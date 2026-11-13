import type { APIRoute } from "astro";
import {
  createBooking,
  getBookingsStore,
  listBookings,
  validateBookingDates,
} from "../../lib/bookings";
import { mergeBusyRanges, fetchFeed, type BusyRange } from "../../lib/ical";
import { bookingsToBusyRanges } from "../../lib/bookings";

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

async function externalBusy(
  env: Record<string, string | undefined>,
): Promise<BusyRange[]> {
  const airbnbUrl = readEnv(env, "AIRBNB_ICAL_URL");
  const vrboUrl = readEnv(env, "VRBO_ICAL_URL");
  const results = await Promise.all([
    airbnbUrl ? fetchFeed(airbnbUrl, "airbnb") : Promise.resolve({ ranges: [] as BusyRange[] }),
    vrboUrl ? fetchFeed(vrboUrl, "vrbo") : Promise.resolve({ ranges: [] as BusyRange[] }),
  ]);
  return results.flatMap((r) => r.ranges);
}

export const GET: APIRoute = async ({ locals }) => {
  const runtimeEnv = (locals.runtime?.env ?? {}) as Record<string, unknown>;
  const store = getBookingsStore(runtimeEnv as { BOOKINGS?: import("../../lib/bookings").BookingsStore });
  const bookings = await listBookings(store);
  return new Response(JSON.stringify({ bookings }), {
    status: 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
};

export const POST: APIRoute = async ({ request, locals }) => {
  let body: {
    checkIn?: string;
    checkOut?: string;
    amount?: number;
    nights?: number;
    note?: string;
  };

  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const checkIn = body.checkIn?.trim() ?? "";
  const checkOut = body.checkOut?.trim() ?? "";
  const dateError = validateBookingDates(checkIn, checkOut);
  if (dateError) {
    return new Response(JSON.stringify({ error: dateError }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const runtimeEnv = (locals.runtime?.env ?? {}) as Record<string, unknown> &
    Record<string, string | undefined>;
  const store = getBookingsStore(runtimeEnv as { BOOKINGS?: import("../../lib/bookings").BookingsStore });

  const [existing, external] = await Promise.all([
    listBookings(store),
    externalBusy(runtimeEnv as Record<string, string | undefined>),
  ]);
  const busy = mergeBusyRanges([
    ...bookingsToBusyRanges(existing),
    ...external,
  ]);
  const conflict = busy.some((range) => checkIn < range.end && checkOut > range.start);
  if (conflict) {
    return new Response(
      JSON.stringify({ error: "Those dates overlap an existing busy range" }),
      { status: 409, headers: { "Content-Type": "application/json" } },
    );
  }

  const booking = await createBooking(store, {
    checkIn,
    checkOut,
    amount: typeof body.amount === "number" ? body.amount : undefined,
    nights: typeof body.nights === "number" ? body.nights : undefined,
    note: typeof body.note === "string" ? body.note.slice(0, 280) : undefined,
  });

  return new Response(JSON.stringify({ booking }), {
    status: 201,
    headers: { "Content-Type": "application/json" },
  });
};
