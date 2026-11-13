import type { APIRoute } from "astro";
import {
  bookingsToIcs,
  getBookingsStore,
  listBookings,
} from "../../lib/bookings";

export const prerender = false;

/** Public ICS feed for Airbnb / VRBO calendar import (site bookings only). */
export const GET: APIRoute = async ({ locals }) => {
  const runtimeEnv = (locals.runtime?.env ?? {}) as {
    BOOKINGS?: import("../../lib/bookings").BookingsStore;
  };
  const store = getBookingsStore(runtimeEnv);
  const bookings = await listBookings(store);
  const ics = bookingsToIcs(bookings);

  return new Response(ics, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="the-loft-bookings.ics"',
      "Cache-Control": "public, max-age=60",
      "Access-Control-Allow-Origin": "*",
    },
  });
};
