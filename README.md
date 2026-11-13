# The Loft — booking page

One-page vacation rental site for **The Loft** (Ballard, Seattle): photo-led landing, check-in/out picker, Airbnb + VRBO calendar blocking (iCal), and Venmo payment (deep link + QR — not an embedded card checkout).

**Production domain:** [ballard.place](https://ballard.place) (purchased in Cloudflare; `www.ballard.place` also routed).

Built with **Astro** + **Cloudflare Workers** (static assets + server API) via Wrangler.

Listing reference: [Airbnb — Ballard Loft](https://www.airbnb.com/rooms/1703090109214600082)

## Quick start

```bash
npm install
cp .env.example .env          # or copy .dev.vars.example → .dev.vars for Wrangler
npm run dev                   # http://localhost:4321
```

Workers-shaped local preview:

```bash
npm run preview               # astro build && wrangler dev
```

## Environment variables

| Variable | Status | Purpose |
| --- | --- | --- |
| `SITE_URL` | **Set** → `https://ballard.place` | Canonical public URL (ICS links, etc.) |
| `AIRBNB_ICAL_URL` | **Set** for this listing | Airbnb calendar export (ICS) |
| `VRBO_ICAL_URL` | **Set** for this listing | VRBO calendar export (ICS) |
| `VENMO_USERNAME` | **Set** → `mattbowers` | Venmo handle without `@` |
| `VENMO_PAYMENT_LINK` | **Set** → `https://venmo.com/mattbowers` | Full Venmo link |
| `NIGHTLY_RATE` | Optional | USD per night (default `185`) |
| `HOST_EMAIL` | Optional | Reserved for host contact copy |

### Defaults in-repo

`.env.example`, `.dev.vars.example`, and `wrangler.jsonc` `vars` already include both iCal URLs and Venmo `@mattbowers`. If either feed URL is cleared, that source is skipped; if both are missing, the UI shows **“Calendars not connected”** instead of crashing.

For local Wrangler / platformProxy, use `.dev.vars` (gitignored):

```bash
cp .dev.vars.example .dev.vars
```

### Cloudflare (production)

Worker → **Settings → Variables and Secrets**. Prefer a **secret** for `AIRBNB_ICAL_URL` if you rotate the calendar token. `wrangler.jsonc` ships plain `vars` so a first deploy works; move the iCal URL to a secret when you harden.

## How calendar sync works

### Import into this site (block dates from Airbnb + VRBO)

1. Guests open the page; the booking widget calls `GET /api/availability`.
2. The Worker fetches each configured ICS feed (`AIRBNB_ICAL_URL`, `VRBO_ICAL_URL`).
3. Confirmed **site bookings** (KV) are loaded and merged with those feeds.
4. `VEVENT` ranges are merged server-side (overlaps collapsed). The client blocks any check-in → check-out that overlaps.

If a feed URL is missing, that source is skipped (no crash). If both external feeds are missing, the picker shows **“Calendars not connected”** (site bookings still block if any exist).

### Export from this site (block Airbnb + VRBO when someone books here)

Public ICS feed of bookings confirmed on The Loft site:

```text
https://ballard.place/api/calendar.ics
```

When a guest taps **I’ve paid / request to book**, the stay is stored in Cloudflare KV (`BOOKINGS`) and appears in that feed so Airbnb/VRBO can mark those nights busy.

#### Paste the export URL in Airbnb

1. Open the [Ballard Loft listing](https://www.airbnb.com/rooms/1703090109214600082) → **Calendar**.
2. **Availability** / calendar settings → **Sync calendars** / **Import calendar**.
3. Paste `https://ballard.place/api/calendar.ics`.
4. Name it e.g. “The Loft website” → Save.

Airbnb periodically refreshes imported calendars; new site bookings show as unavailable after the next sync.

#### Paste the export URL in VRBO

1. Open the listing calendar in VRBO / partner host tools.
2. Find **Calendar sync** / **Import calendar** (iCal).
3. Paste `https://ballard.place/api/calendar.ics`.
4. Save. VRBO will pull busy ranges from the site feed on its refresh cadence.

### Where to get inbound iCal URLs (Airbnb → site, VRBO → site)

- **Airbnb:** Listing → Calendar → Availability settings → **Export calendar** → copy the link.  
  Current Loft feed is already set in env examples / Wrangler vars.
- **VRBO:** Calendar / sync settings → **Export** calendar link (ICS).  
  Current Loft feed is already set in env examples / Wrangler vars.

## Venmo flow

1. Guest selects available dates; the UI shows nights × `NIGHTLY_RATE`.
2. **Pay with Venmo** opens a deep link to `@mattbowers` (amount + stay note) and shows a QR of the same URL.
3. Guest pays in Venmo (outside this site).
4. Guest returns and taps **I’ve paid / request to book** — on-page confirmation only (no card processor).

## Photos

Hero + gallery images live in `public/images/` (copied from the Airbnb listing media). Full download set also under `public/images/listing/`.

| File | Role |
| --- | --- |
| `loft-hero.jpg` | Full-bleed hero |
| `loft-living.jpg` | Gallery — upstairs TV room |
| `loft-kitchen.jpg` | Gallery — kitchen |
| `loft-bedroom.jpg` | Gallery — queen bedroom |
| `loft-detail.jpg` | Gallery — bedroom / lounge cut-through |
| `loft-dining.jpg` | Gallery — dining + Ballard sign |
| `loft-exterior.jpg` | Gallery — private entrance |

## Deploy to Cloudflare

Uses **Workers + static assets**. From a machine logged into Cloudflare:

### 1. Bookings KV namespace

Production namespace **the-loft-bookings** is already created and wired in `wrangler.jsonc` as the `BOOKINGS` binding (`44c5f865914847c189511787becebf14`). `preview_id` points at the same namespace until a separate preview namespace exists.

### 2. Deploy (attaches `ballard.place`)

`wrangler.jsonc` routes **ballard.place** and **www.ballard.place** as Worker custom domains.

```bash
npm run deploy                # astro build && wrangler deploy
```

Or connect the GitHub repo in the Cloudflare dashboard (Workers Builds):

- **Build command:** `npm run build`
- **Deploy command:** `npx wrangler deploy`
- **Root:** repository root

Confirm env vars in the dashboard after first deploy (or rely on `wrangler.jsonc` vars). Then paste **`https://ballard.place/api/calendar.ics`** into Airbnb + VRBO import settings (see above).

If custom domains don’t attach on first deploy: Worker → **Settings → Domains & Routes** → Add `ballard.place` / `www.ballard.place`.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Astro local dev (API + page) |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Build + `wrangler dev` |
| `npm run deploy` | Build + deploy with Wrangler |
| `npm run check` | Astro / TS check |

## API cheat sheet

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/availability` | Merged busy ranges (Airbnb + VRBO + site) + Venmo/rate |
| `POST` | `/api/bookings` | Persist a confirmed site booking `{ checkIn, checkOut, … }` |
| `GET` | `/api/bookings` | List site bookings (JSON) |
| `GET` | `/api/calendar.ics` | **Public ICS export** for Airbnb/VRBO import |

## Still needed from owners

- Deploy the Worker (binds **ballard.place**), then paste `https://ballard.place/api/calendar.ics` into Airbnb + VRBO **import**
- Confirm **nightly rate** if not `$185`
- Optional **host email** for confirmation copy
- Optional: move iCal URLs to Cloudflare **secrets** if you rotate export tokens
