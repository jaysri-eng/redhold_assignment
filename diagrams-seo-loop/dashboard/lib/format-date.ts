/**
 * Deterministic UTC timestamp formatting — avoids hydration mismatches from
 * toLocaleString() differing between server timezone and browser timezone.
 */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;
const DAYS   = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export function formatQueueTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;

  const day   = DAYS[d.getUTCDay()];
  const month = MONTHS[d.getUTCMonth()];
  const date  = d.getUTCDate();
  const hh    = String(d.getUTCHours()).padStart(2, "0");
  const mm    = String(d.getUTCMinutes()).padStart(2, "0");

  return `${day}, ${month} ${date} · ${hh}:${mm} UTC`;
}
