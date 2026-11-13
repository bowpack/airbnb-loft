/// <reference types="astro/client" />

type BookingsKv = {
  get: (key: string) => Promise<string | null>;
  put: (key: string, value: string) => Promise<void>;
  list: (options?: { prefix?: string }) => Promise<{ keys: { name: string }[] }>;
};

type RuntimeEnv = {
  SITE_URL?: string;
  AIRBNB_ICAL_URL?: string;
  VRBO_ICAL_URL?: string;
  VENMO_USERNAME?: string;
  VENMO_PAYMENT_LINK?: string;
  NIGHTLY_RATE?: string;
  HOST_EMAIL?: string;
  BOOKINGS?: BookingsKv;
};

type Runtime = import("@astrojs/cloudflare").Runtime<RuntimeEnv>;

declare namespace App {
  interface Locals extends Runtime {}
}
