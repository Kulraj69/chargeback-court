export function VerdictStamp({ verdict, small = false }: { verdict: string; small?: boolean }) { return <span className={`verdict-stamp ${verdict.toLowerCase()} ${small ? "small" : ""}`}>{verdict === "OFFER" ? "OFFER REFUND" : verdict}</span>; }
export function Deadline({ days, resolved }: { days: number | null; resolved?: boolean }) {
  if (resolved) return <span className="muted">— Closed</span>;
  if (days === null) return <span className="muted">No deadline</span>;
  return <span className={days <= 3 ? "deadline urgent" : "deadline"}><i/>{days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? "Due today" : `${days}d left`}</span>;
}
