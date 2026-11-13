import { mergeBusyRanges, parseBusyRanges } from "./ical";

const sample = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
DTSTART;VALUE=DATE:20260410
DTEND;VALUE=DATE:20260413
SUMMARY:Reserved
END:VEVENT
BEGIN:VEVENT
DTSTART:20260412T150000Z
DTEND:20260414T110000Z
SUMMARY:Blocked
END:VEVENT
END:VCALENDAR`;

const airbnb = parseBusyRanges(sample, "airbnb");
const vrbo = parseBusyRanges(
  `BEGIN:VCALENDAR
BEGIN:VEVENT
DTSTART;VALUE=DATE:20260420
DTEND;VALUE=DATE:20260422
END:VEVENT
END:VCALENDAR`,
  "vrbo",
);

const merged = mergeBusyRanges([...airbnb, ...vrbo]);

if (airbnb.length !== 2) throw new Error(`expected 2 airbnb ranges, got ${airbnb.length}`);
if (merged.length !== 2) throw new Error(`expected 2 merged ranges, got ${merged.length}`);
if (merged[0].start !== "2026-04-10" || merged[0].end !== "2026-04-14") {
  throw new Error(`unexpected first merge: ${JSON.stringify(merged[0])}`);
}

console.log("ical tests passed", merged);
