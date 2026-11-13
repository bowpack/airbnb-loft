import type { BusyRange } from "./ical";

export type SiteBooking = {
  id: string;
  checkIn: string; // YYYY-MM-DD inclusive
  checkOut: string; // YYYY-MM-DD exclusive (checkout day)
  createdAt: string;
  amount?: number;
  nights?: number;
  note?: string;
};

export type BookingsStore = {
  get: (key: string) => Promise<string | null>;
  put: (key: string, value: string) => Promise<void>;
  list: (options?: { prefix?: string }) => Promise<{ keys: { name: string }[] }>;
};

const PREFIX = "booking:";
const memory = new Map<string, string>();

/** Local fallback when KV binding is unavailable (plain `astro dev` without proxy). */
export function memoryStore(): BookingsStore {
  return {
    async get(key) {
      return memory.get(key) ?? null;
    },
    async put(key, value) {
      memory.set(key, value);
    },
    async list(options) {
      const prefix = options?.prefix ?? "";
      const keys = [...memory.keys()]
        .filter((name) => name.startsWith(prefix))
        .map((name) => ({ name }));
      return { keys };
    },
  };
}

export function getBookingsStore(env: {
  BOOKINGS?: BookingsStore;
}): BookingsStore {
  if (env.BOOKINGS && typeof env.BOOKINGS.get === "function") {
    return env.BOOKINGS;
  }
  return memoryStore();
}

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function validateBookingDates(
  checkIn: string,
  checkOut: string,
): string | null {
  if (!isIsoDate(checkIn) || !isIsoDate(checkOut)) {
    return "checkIn and checkOut must be YYYY-MM-DD";
  }
  if (checkOut <= checkIn) {
    return "checkOut must be after checkIn";
  }
  return null;
}

export async function listBookings(store: BookingsStore): Promise<SiteBooking[]> {
  const listed = await store.list({ prefix: PREFIX });
  const bookings: SiteBooking[] = [];
  for (const { name } of listed.keys) {
    const raw = await store.get(name);
    if (!raw) continue;
    try {
      bookings.push(JSON.parse(raw) as SiteBooking);
    } catch {
      // skip corrupt entries
    }
  }
  return bookings.sort((a, b) => a.checkIn.localeCompare(b.checkIn));
}

export async function createBooking(
  store: BookingsStore,
  input: {
    checkIn: string;
    checkOut: string;
    amount?: number;
    nights?: number;
    note?: string;
  },
): Promise<SiteBooking> {
  const id = crypto.randomUUID();
  const booking: SiteBooking = {
    id,
    checkIn: input.checkIn,
    checkOut: input.checkOut,
    createdAt: new Date().toISOString(),
    amount: input.amount,
    nights: input.nights,
    note: input.note,
  };
  await store.put(`${PREFIX}${id}`, JSON.stringify(booking));
  return booking;
}

export function bookingsToBusyRanges(bookings: SiteBooking[]): BusyRange[] {
  return bookings.map((b) => ({
    start: b.checkIn,
    end: b.checkOut,
    source: "site" as const,
  }));
}

function foldLine(line: string): string {
  // ICS line folding at 75 octets — keep simple for short lines
  if (line.length <= 75) return line;
  const parts: string[] = [];
  let rest = line;
  parts.push(rest.slice(0, 75));
  rest = rest.slice(75);
  while (rest.length) {
    parts.push(` ${rest.slice(0, 74)}`);
    rest = rest.slice(74);
  }
  return parts.join("\r\n");
}

function toIcsDate(iso: string): string {
  return iso.replaceAll("-", "");
}

/** Build a public calendar of site bookings for Airbnb / VRBO import. */
export function bookingsToIcs(
  bookings: SiteBooking[],
  opts?: { calName?: string; prodId?: string },
): string {
  const calName = opts?.calName ?? "The Loft site bookings";
  const prodId = opts?.prodId ?? "-//The Loft//Site Bookings//EN";
  const stamp = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:${prodId}`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${calName}`,
  ];

  for (const booking of bookings) {
    const uid = `${booking.id}@the-loft.site`;
    const summary = "The Loft — booked on site";
    const description = [
      "Booked via The Loft website.",
      booking.note ? `Note: ${booking.note}` : null,
      booking.amount != null ? `Amount: $${booking.amount}` : null,
    ]
      .filter(Boolean)
      .join("\\n");

    lines.push(
      "BEGIN:VEVENT",
      `UID:${uid}`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${toIcsDate(booking.checkIn)}`,
      `DTEND;VALUE=DATE:${toIcsDate(booking.checkOut)}`,
      foldLine(`SUMMARY:${summary}`),
      foldLine(`DESCRIPTION:${description}`),
      "STATUS:CONFIRMED",
      "TRANSP:OPAQUE",
      "END:VEVENT",
    );
  }

  lines.push("END:VCALENDAR");
  return `${lines.join("\r\n")}\r\n`;
}
