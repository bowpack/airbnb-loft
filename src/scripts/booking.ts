type BusyRange = { start: string; end: string; source: string };

type AvailabilityResponse = {
  calendarsConnected: boolean;
  connected: { airbnb: boolean; vrbo: boolean };
  busy: BusyRange[];
  nightlyRate: number;
  venmo: {
    username: string | null;
    paymentLink: string | null;
    configured: boolean;
  };
  warnings: string[];
};

function nightsBetween(checkIn: string, checkOut: string): number {
  const a = new Date(`${checkIn}T12:00:00Z`);
  const b = new Date(`${checkOut}T12:00:00Z`);
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

function overlapsBusy(checkIn: string, checkOut: string, busy: BusyRange[]): boolean {
  return busy.some((range) => checkIn < range.end && checkOut > range.start);
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function buildVenmoUrl(
  venmo: AvailabilityResponse["venmo"],
  amount: number,
  note: string,
): string | null {
  if (venmo.paymentLink) {
    try {
      const url = new URL(venmo.paymentLink);
      if (!url.searchParams.has("amount")) {
        url.searchParams.set("amount", amount.toFixed(2));
      }
      if (!url.searchParams.has("note") && !url.searchParams.has("txn")) {
        url.searchParams.set("note", note);
      }
      return url.toString();
    } catch {
      return venmo.paymentLink;
    }
  }
  if (venmo.username) {
    const u = new URL(`https://venmo.com/${encodeURIComponent(venmo.username)}`);
    u.searchParams.set("txn", "pay");
    u.searchParams.set("amount", amount.toFixed(2));
    u.searchParams.set("note", note);
    return u.toString();
  }
  return null;
}

function qrUrl(data: string): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=8&data=${encodeURIComponent(data)}`;
}

export function initBooking(root: HTMLElement) {
  const statusEl = root.querySelector<HTMLElement>("[data-calendar-status]");
  const checkInEl = root.querySelector<HTMLInputElement>("[name=checkin]");
  const checkOutEl = root.querySelector<HTMLInputElement>("[name=checkout]");
  const nightsEl = root.querySelector<HTMLElement>("[data-nights]");
  const rateEl = root.querySelector<HTMLElement>("[data-rate]");
  const totalEl = root.querySelector<HTMLElement>("[data-total]");
  const conflictEl = root.querySelector<HTMLElement>("[data-conflict]");
  const payLink = root.querySelector<HTMLAnchorElement>("[data-venmo-link]");
  const payQr = root.querySelector<HTMLImageElement>("[data-venmo-qr]");
  const payWrap = root.querySelector<HTMLElement>("[data-pay]");
  const venmoMissing = root.querySelector<HTMLElement>("[data-venmo-missing]");
  const confirmBtn = root.querySelector<HTMLButtonElement>("[data-confirm]");
  const confirmDone = root.querySelector<HTMLElement>("[data-confirm-done]");
  const confirmSummary = root.querySelector<HTMLElement>("[data-confirm-summary]");

  if (!checkInEl || !checkOutEl || !statusEl) return;

  const min = todayISO();
  checkInEl.min = min;
  checkOutEl.min = min;

  let state: AvailabilityResponse = {
    calendarsConnected: false,
    connected: { airbnb: false, vrbo: false },
    busy: [],
    nightlyRate: 185,
    venmo: { username: null, paymentLink: null, configured: false },
    warnings: [],
  };

  function setStatus(kind: "loading" | "offline" | "ok" | "error", message: string) {
    statusEl!.dataset.state = kind === "ok" ? "ok" : kind === "loading" ? "ok" : kind;
    statusEl!.textContent = message;
  }

  function refreshSummary() {
    const checkIn = checkInEl!.value;
    const checkOut = checkOutEl!.value;
    const nights = checkIn && checkOut ? nightsBetween(checkIn, checkOut) : 0;
    const valid = nights > 0;
    const conflict = valid && overlapsBusy(checkIn, checkOut, state.busy);
    const amount = valid ? nights * state.nightlyRate : 0;

    if (nightsEl) nightsEl.textContent = valid ? String(nights) : "—";
    if (rateEl) rateEl.textContent = `$${state.nightlyRate}`;
    if (totalEl) totalEl.textContent = valid ? `$${amount}` : "—";

    if (conflictEl) {
      conflictEl.hidden = !conflict;
    }

    const note = valid
      ? `The Loft ${checkIn} to ${checkOut} (${nights} night${nights === 1 ? "" : "s"})`
      : "The Loft stay";
    const venmoUrl = valid && !conflict ? buildVenmoUrl(state.venmo, amount, note) : null;

    if (payWrap) payWrap.hidden = !state.venmo.configured;
    if (venmoMissing) venmoMissing.hidden = state.venmo.configured;

    if (payLink) {
      if (venmoUrl) {
        payLink.href = venmoUrl;
        payLink.removeAttribute("aria-disabled");
        payLink.classList.remove("is-disabled");
      } else {
        payLink.href = "#";
        payLink.setAttribute("aria-disabled", "true");
      }
    }

    if (payQr) {
      if (venmoUrl) {
        payQr.src = qrUrl(venmoUrl);
        payQr.alt = "Venmo payment QR code";
        payQr.hidden = false;
      } else {
        payQr.hidden = true;
      }
    }

    if (confirmBtn) {
      confirmBtn.disabled = !(valid && !conflict && state.venmo.configured);
    }

    if (confirmDone) confirmDone.classList.remove("is-visible");
  }

  async function loadAvailability() {
    setStatus("loading", "Checking Airbnb & VRBO calendars…");
    try {
      const res = await fetch("/api/availability");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      state = (await res.json()) as AvailabilityResponse;

      if (!state.calendarsConnected) {
        setStatus(
          "offline",
          "Calendars not connected — date blocking is off until Airbnb/VRBO iCal URLs are set. You can still pick dates and pay via Venmo.",
        );
      } else if (state.warnings.length) {
        const parts = [
          state.connected.airbnb ? "Airbnb" : null,
          state.connected.vrbo ? "VRBO" : null,
        ]
          .filter(Boolean)
          .join(" + ");
        setStatus(
          "error",
          `Connected (${parts}) with warnings: ${state.warnings.join("; ")}. Busy dates shown may be incomplete.`,
        );
      } else {
        const parts = [
          state.connected.airbnb ? "Airbnb" : null,
          state.connected.vrbo ? "VRBO" : null,
        ]
          .filter(Boolean)
          .join(" + ");
        const pending = !state.connected.vrbo
          ? " VRBO feed not connected yet — only Airbnb busy nights are blocked."
          : !state.connected.airbnb
            ? " Airbnb feed not connected — only VRBO busy nights are blocked."
            : " Busy nights from Airbnb + VRBO are blocked.";
        setStatus(
          "ok",
          `Synced with ${parts}.${pending} Site bookings also block dates and export to /api/calendar.ics.`,
        );
      }
    } catch {
      setStatus(
        "error",
        "Couldn’t load calendar sync. The picker still works — please double-check dates with the host.",
      );
    }
    refreshSummary();
  }

  checkInEl.addEventListener("change", () => {
    if (checkInEl!.value) {
      const next = new Date(`${checkInEl!.value}T12:00:00Z`);
      next.setUTCDate(next.getUTCDate() + 1);
      checkOutEl!.min = next.toISOString().slice(0, 10);
      if (checkOutEl!.value && checkOutEl!.value <= checkInEl!.value) {
        checkOutEl!.value = checkOutEl!.min;
      }
    }
    refreshSummary();
  });
  checkOutEl.addEventListener("change", refreshSummary);

  confirmBtn?.addEventListener("click", async () => {
    const checkIn = checkInEl!.value;
    const checkOut = checkOutEl!.value;
    const nights = nightsBetween(checkIn, checkOut);
    const amount = nights * state.nightlyRate;
    const note = `The Loft ${checkIn} to ${checkOut} (${nights} night${nights === 1 ? "" : "s"})`;

    confirmBtn.disabled = true;
    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checkIn, checkOut, nights, amount, note }),
      });
      const payload = (await res.json()) as { error?: string; booking?: { id: string } };
      if (!res.ok) {
        if (confirmSummary) {
          confirmSummary.textContent =
            payload.error || "Couldn’t save this booking request. Try different dates or contact the host.";
        }
        confirmDone?.classList.add("is-visible");
        confirmBtn.disabled = false;
        return;
      }

      if (confirmSummary) {
        confirmSummary.textContent = `Requested ${checkIn} → ${checkOut} · ${nights} night${nights === 1 ? "" : "s"} · $${amount} via Venmo${state.venmo.username ? ` (@${state.venmo.username})` : ""}. Dates are now on the site calendar export for Airbnb/VRBO. We’ll confirm once payment lands.`;
      }
      confirmDone?.classList.add("is-visible");
      await loadAvailability();
    } catch {
      if (confirmSummary) {
        confirmSummary.textContent =
          "Network error while saving the booking. Your Venmo payment may still have gone through — message the host.";
      }
      confirmDone?.classList.add("is-visible");
      confirmBtn.disabled = false;
    }
  });

  void loadAvailability();
}
