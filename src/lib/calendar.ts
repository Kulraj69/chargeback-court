import type { Dispute } from "./types";
import { AppError } from "./errors";
function escape(value: string) { return value.replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/;/g, "\\;").replace(/,/g, "\\,"); }
function stamp(date: string) { return new Date(date).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, ""); }
function fold(line: string): string {
  const parts: string[] = []; let current = "";
  for (const char of line) {
    if (new TextEncoder().encode(current + char).length > 74) { parts.push(current); current = " " + char; }
    else current += char;
  }
  return [...parts, current].join("\r\n");
}
export function deadlineCalendar(dispute: Dispute, now = new Date().toISOString()): string {
  if (!dispute.due || !Number.isFinite(Date.parse(dispute.due)) || dispute.status === "RESOLVED") throw new AppError("This case has no active response deadline.", 404);
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Chargeback Court//Seller deadline//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "BEGIN:VEVENT", `UID:${escape(dispute.id)}@chargeback-court.local`, `DTSTAMP:${stamp(now)}`, `DTSTART:${stamp(dispute.due)}`, `SUMMARY:${escape(`Respond to dispute ${dispute.id}`)}`, `DESCRIPTION:${escape("PayPal sandbox seller response deadline. Review the case and submit before this time. Not legal advice.")}`, "BEGIN:VALARM", "TRIGGER:-P1D", "ACTION:DISPLAY", "DESCRIPTION:Seller response due tomorrow", "END:VALARM", "END:VEVENT", "END:VCALENDAR"].map(fold).join("\r\n") + "\r\n";
}
