/** Minimal ICS busy-range parser for Airbnb / VRBO calendar feeds. */

export type BusyRange = {
  start: string; // YYYY-MM-DD (inclusive)
  end: string; // YYYY-MM-DD (exclusive checkout-style)
  source: "airbnb" | "vrbo" | "site";
};

function unfold(ics: string): string {
  return ics.replace(/\r\n[ \t]/g, "").replace(/\n[ \t]/g, "");
}

function parseIcalDate(value: string): string | null {
  const cleaned = value.trim();
  // VALUE=DATE:20240115
  if (/^\d{8}$/.test(cleaned)) {
    return `${cleaned.slice(0, 4)}-${cleaned.slice(4, 6)}-${cleaned.slice(6, 8)}`;
  }
  // 20240115T150000Z or 20240115T150000
  const m = cleaned.match(/^(\d{8})T/);
  if (m) {
    const d = m[1];
    return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
  }
  return null;
}

function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function extractProp(block: string, name: string): string | null {
  const re = new RegExp(`(?:^|\\n)${name}(?:;[^:]*)?:([^\\n]*)`, "i");
  const match = block.match(re);
  return match ? match[1].trim() : null;
}

export function parseBusyRanges(
  ics: string,
  source: BusyRange["source"],
): BusyRange[] {
  const text = unfold(ics);
  const events = text.split(/BEGIN:VEVENT/i).slice(1);
  const ranges: BusyRange[] = [];

  for (const raw of events) {
    const block = raw.split(/END:VEVENT/i)[0] ?? "";
    const startRaw = extractProp(block, "DTSTART");
    const endRaw = extractProp(block, "DTEND");
    if (!startRaw) continue;

    const start = parseIcalDate(startRaw);
    if (!start) continue;

    let end = endRaw ? parseIcalDate(endRaw) : null;
    // All-day DTEND is exclusive in ICS; timed events treat same-day as 1 night.
    if (!end) {
      end = addDays(start, 1);
    } else if (end === start) {
      end = addDays(start, 1);
    }

    ranges.push({ start, end, source });
  }

  return ranges;
}

/** Merge overlapping / adjacent busy ranges into sorted unique spans. */
export function mergeBusyRanges(ranges: BusyRange[]): BusyRange[] {
  if (ranges.length === 0) return [];

  const sorted = [...ranges].sort((a, b) => a.start.localeCompare(b.start));
  const merged: BusyRange[] = [];

  for (const range of sorted) {
    const last = merged[merged.length - 1];
    if (!last) {
      merged.push({ ...range });
      continue;
    }

    if (range.start <= last.end) {
      if (range.end > last.end) last.end = range.end;
      if (range.source !== last.source) {
        last.source = last.source === range.source ? last.source : last.source;
      }
    } else {
      merged.push({ ...range });
    }
  }

  return merged;
}

export async function fetchFeed(
  url: string,
  source: BusyRange["source"],
): Promise<{ ranges: BusyRange[]; error?: string }> {
  try {
    const res = await fetch(url, {
      headers: { Accept: "text/calendar, text/plain, */*" },
      redirect: "follow",
    });
    if (!res.ok) {
      return {
        ranges: [],
        error: `${source} feed returned ${res.status}`,
      };
    }
    const text = await res.text();
    if (!/BEGIN:VCALENDAR/i.test(text)) {
      return { ranges: [], error: `${source} feed is not a valid calendar` };
    }
    return { ranges: parseBusyRanges(text, source) };
  } catch (err) {
    const message = err instanceof Error ? err.message : "fetch failed";
    return { ranges: [], error: `${source}: ${message}` };
  }
}
