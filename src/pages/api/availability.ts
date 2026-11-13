import type { APIRoute } from "astro";
import { fetchFeed, mergeBusyRanges } from "../../lib/ical";
import {
  bookingsToBusyRanges,
  getBookingsStore,
  listBookings,
} from "../../lib/bookings";

export const prerender = false;

function readEnv(
  runtimeEnv: Record<string, string | undefined> | undefined,
  key: string,
): string {
  const fromRuntime = runtimeEnv?.[key]?.trim();
  if (fromRuntime) return fromRuntime;
  const fromProcess = (
    typeof process !== "undefined" ? process.env?.[key] : undefined
  )?.trim();
  return fromProcess || "";
}

export const GET: APIRoute = async ({ locals }) => {
  const runtime = (locals.runtime?.env ?? {}) as Record<string, unknown> &
    Record<string, string | undefined>;

  const airbnbUrl = readEnv(runtime, "AIRBNB_ICAL_URL");
  const vrboUrl = readEnv(runtime, "VRBO_ICAL_URL");
  const nightlyRate = Number(readEnv(runtime, "NIGHTLY_RATE") || "185") || 185;

  const venmoUsername = readEnv(runtime, "VENMO_USERNAME");
  const venmoPaymentLink = readEnv(runtime, "VENMO_PAYMENT_LINK");

  const connected = {
    airbnb: Boolean(airbnbUrl),
    vrbo: Boolean(vrboUrl),
  };

  const warnings: string[] = [];
  const store = getBookingsStore(
    runtime as { BOOKINGS?: import("../../lib/bookings").BookingsStore },
  );

  const [airbnbResult, vrboResult, siteBookings] = await Promise.all([
    airbnbUrl
      ? fetchFeed(airbnbUrl, "airbnb")
      : Promise.resolve({ ranges: [], error: undefined as string | undefined }),
    vrboUrl
      ? fetchFeed(vrboUrl, "vrbo")
      : Promise.resolve({ ranges: [], error: undefined as string | undefined }),
    listBookings(store),
  ]);

  for (const result of [airbnbResult, vrboResult]) {
    if (result.error) warnings.push(result.error);
  }

  const siteRanges = bookingsToBusyRanges(siteBookings);
  const busy = mergeBusyRanges([
    ...airbnbResult.ranges,
    ...vrboResult.ranges,
    ...siteRanges,
  ]);

  const calendarsConnected = connected.airbnb || connected.vrbo;

  return new Response(
    JSON.stringify({
      calendarsConnected,
      connected,
      busy,
      siteBookings: siteBookings.length,
      calendarExportPath: "/api/calendar.ics",
      nightlyRate,
      venmo: {
        username: venmoUsername || null,
        paymentLink: venmoPaymentLink || null,
        configured: Boolean(venmoUsername || venmoPaymentLink),
      },
      warnings,
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=60",
      },
    },
  );
};
