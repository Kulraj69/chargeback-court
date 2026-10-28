"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, CalendarPlus, Check, FileText, Paperclip, RefreshCw, Send, Sparkles, X } from "lucide-react";
import { useCourt } from "./court-shell";
import { Deadline, VerdictStamp } from "./case-widgets";
import { actionAvailable } from "@/lib/actions";
import { checklist, money, REASONS, scoreCase } from "@/lib/verdict";
import type { ActionType, ApiEnvelope, Attachment, Dispute, EvidenceInput } from "@/lib/types";

const ACTION_LABELS: Record<ActionType, string> = { evidence: "File evidence", offer: "Offer partial refund", accept: "Accept claim", message: "Send a message", sandbox_require_evidence: "Request seller evidence", sandbox_adjudicate: "Adjudicate sandbox case" };
function displayDate(date?: string) { return date ? new Date(date).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "Not provided"; }
export function CaseFile({ id }: { id: string }) {
  const { call, mode, openTrace } = useCourt();
  const [dispute, setDispute] = useState<Dispute>(); const [input, setInput] = useState<EvidenceInput>({ evidence: [] });
  const [brief, setBrief] = useState<ApiEnvelope["brief"]>(); const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [busy, setBusy] = useState(""); const [error, setError] = useState(""); const [notice, setNotice] = useState(""); const [warning, setWarning] = useState("");
  const [action, setAction] = useState<ActionType>("evidence"); const [note, setNote] = useState(""); const [offer, setOffer] = useState(""); const [outcome, setOutcome] = useState("SELLER_FAVOR"); const [confirmError, setConfirmError] = useState("");
  const [searchStart, setSearchStart] = useState(""); const [searchEnd, setSearchEnd] = useState(""); const [needsRefresh, setNeedsRefresh] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null); const upload = useRef<HTMLInputElement>(null);
  const path = `/api/disputes/${encodeURIComponent(id)}`;
  const load = useCallback(async (query = "") => {
    setBusy("load"); setError("");
    try { const data = await call(path + query); setDispute(data.dispute); setInput({ evidence: data.dispute?.evidence ?? [], tracking: data.dispute?.tracking }); setBrief(undefined); setWarning(data.warning ?? ""); setNeedsRefresh(false); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not open this case."); }
    finally { setBusy(""); }
  }, [call, path]);
  useEffect(() => {
    let active = true;
    void call(path).then(data => {
      if (!active) return;
      setDispute(data.dispute); setInput({ evidence: data.dispute?.evidence ?? [], tracking: data.dispute?.tracking }); setWarning(data.warning ?? "");
    }).catch(e => { if (active) setError(e instanceof Error ? e.message : "Could not open this case."); });
    return () => { active = false; };
  }, [call, path]);
  const verdict = useMemo(() => dispute ? scoreCase(dispute, input) : undefined, [dispute, input]);
  const updateInput = (next: EvidenceInput) => { setInput(next); if (mode === "sandbox") setDispute(previous => previous && { ...previous, assessmentComplete: false }); setBrief(undefined); setNotice(""); };
  async function assess() {
    setBusy("assess"); setError("");
    try { await call(`${path}/verdict`, input); setDispute(previous => previous && { ...previous, assessmentComplete: true }); setNotice(mode === "mock" ? "Assessment recorded in your demo session." : "Assessment checked. Confirmed evidence is kept in this open case view."); }
    catch (e) { setError((e as Error).message); } finally { setBusy(""); }
  }
  async function draft() {
    setBusy("brief"); setError(""); setBrief(undefined);
    try { const result = await call(`${path}/brief`, input); setBrief(result.brief); }
    catch (e) { setError((e as Error).message); } finally { setBusy(""); }
  }
  async function calendar() {
    setBusy("calendar"); setError("");
    try {
      const result = await call(`${path}/calendar`);
      if (!result.calendar) throw new Error("No calendar was returned.");
      const url = URL.createObjectURL(new Blob([result.calendar], { type: "text/calendar;charset=utf-8" }));
      const link = document.createElement("a"); link.href = url; link.download = `${id}-deadline.ics`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice("Deadline exported. Import the calendar file to set a reminder.");
    } catch (e) { setError((e as Error).message); } finally { setBusy(""); }
  }
  async function attach(files: FileList | null) {
    if (!files) return; setError("");
    try {
      if (files.length + attachments.length > 3) throw new Error("Choose at most three attachments.");
      const added: Attachment[] = [];
      for (const file of Array.from(files)) {
        if (file.size > 500_000 || !["application/pdf", "image/png", "image/jpeg"].includes(file.type)) throw new Error("Use PDF, PNG or JPEG files up to 500 KB each.");
        if (!/^[A-Za-z0-9][A-Za-z0-9._ -]{0,99}$/.test(file.name)) throw new Error("Rename files using simple letters, digits, spaces, hyphens and dots (up to 100 characters).");
        if ([...attachments, ...added].some(a => a.name === file.name)) throw new Error("Attachment names must be unique.");
        const base64 = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(",")[1]); reader.onerror = () => reject(new Error("Could not read the file.")); reader.readAsDataURL(file); });
        added.push({ name: file.name, mime: file.type, base64 });
      }
      setAttachments(previous => [...previous, ...added]);
    } catch (e) { setError((e as Error).message); } finally { if (upload.current) upload.current.value = ""; }
  }
  function openAction(type: ActionType) {
    setAction(type); setConfirmError("");
    setNote(type === "evidence" ? brief?.text ?? "" : type === "accept" ? "I accept this claim and authorise the sandbox refund." : type === "offer" ? "I propose a partial refund to resolve this dispute." : "");
    setOffer(String(verdict?.offerAmount ?? "")); setOutcome("SELLER_FAVOR"); dialog.current?.showModal();
  }
  async function submitAction(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy("action"); setConfirmError("");
    try {
      const data = await call(`${path}/action`, { type: action, confirm: true, ...input, note, offerAmount: offer, outcome, attachments: action === "evidence" ? attachments : undefined });
      if (data.dispute) { setDispute(data.dispute); if (mode === "mock") setInput({ evidence: data.dispute.evidence, tracking: data.dispute.tracking }); }
      else setNeedsRefresh(true);
      setNotice(data.warning ?? `${ACTION_LABELS[action]}: ${mode === "mock" ? "completed in your synthetic demo" : "accepted by PayPal sandbox"}.`);
      if (action === "evidence") setAttachments([]);
      dialog.current?.close();
    } catch (e) { setConfirmError((e as Error).message); } finally { setBusy(""); }
  }
  if (!dispute || !verdict) return <div className="case-loading"><Link className="text-link" href="/"><ArrowLeft size={14}/> Back to docket</Link>{error ? <div className="error-notice" role="alert">{error}<button onClick={() => void load()}>Retry</button></div> : <p role="status"><span className="cursor">▌</span> Retrieving the case file…</p>}</div>;
  const items = checklist(dispute.reason), resolved = dispute.status === "RESOLVED";
  const can = (type: ActionType) => actionAvailable(dispute, type) && !busy && !needsRefresh;
  return <div className="case-content">
    <div className="case-breadcrumb"><Link href="/"><ArrowLeft size={14}/> Back to docket</Link><button onClick={() => void load()} disabled={!!busy}><RefreshCw size={13}/> Refresh case</button></div>
    <div className="case-title-row"><div><p className="section-index">CASE FILE / {dispute.id}</p><h2>{REASONS[dispute.reason] ?? dispute.reason}</h2><p>{dispute.buyer} <span>vs.</span> {mode === "mock" ? "Moonlit Ceramics" : "Your sandbox shop"}</p></div><div className="case-amount"><strong>{dispute.amountAvailable === false ? "Unavailable" : money(dispute.amount)}</strong><span>{dispute.stage.replaceAll("_", " ")}</span></div></div>
    <div className="case-statusbar"><span className="status-pill">{dispute.status.replaceAll("_", " ")}</span><Deadline days={verdict.daysLeft} resolved={resolved}/>{dispute.due && !resolved && <button className="text-link" onClick={() => void calendar()} disabled={!!busy}><CalendarPlus size={14}/> Add deadline to calendar</button>}</div>
    {dispute.due && !resolved && <p className="exact-deadline">Respond by {displayDate(dispute.due)} · your local time</p>}
    {error && <div role="alert" className="error-notice">{error}</div>}{notice && <div role="status" className="success-notice"><Check size={16}/>{notice}</div>}{warning && <div className="warning-notice">{warning}</div>}
    {resolved && <div className="resolved-notice"><ScaleMark/><div><strong>Case closed.</strong><p>Outcome: {(dispute.outcome ?? "Not provided").replaceAll("_", " ")}. {mode === "mock" && "This outcome is part of the synthetic demo."}</p></div></div>}
    <div className="case-columns"><div className="case-main">
      <section className="file-section"><div className="section-heading"><h3><span>01</span> The transaction</h3><span className="tiny">PAYPAL RECORD</span></div><dl className="transaction-grid"><div><dt>TRANSACTION ID</dt><dd>{dispute.transactionId ?? "Not supplied by PayPal"}</dd></div><div><dt>PURCHASED</dt><dd>{displayDate(dispute.transaction?.at ?? dispute.transactionAt)}</dd></div><div><dt>ITEM</dt><dd>{dispute.transaction?.item || "Item details not available"}</dd></div><div><dt>PAYMENT</dt><dd>{dispute.transaction?.amount ? money(dispute.transaction.amount) : "Not available"} {dispute.transaction?.status ? ` / ${dispute.transaction.status}` : ""}</dd></div><div className="full-width"><dt>SHIPPING ADDRESS</dt><dd>{dispute.transaction?.shippingAddress || "Address not available"}</dd></div></dl>
      {mode === "sandbox" && dispute.transactionId && <details className="transaction-search"><summary>Look up a different purchase window</summary><form onSubmit={e => { e.preventDefault(); void load(`?start_date=${encodeURIComponent(`${searchStart}T00:00:00Z`)}&end_date=${encodeURIComponent(`${searchEnd}T23:59:59Z`)}`); }}><p className="muted">Choose up to 31 days, in UTC. Reporting data may take three hours to appear.</p><label>Start date<input type="date" required value={searchStart} onChange={e => setSearchStart(e.target.value)}/></label><label>End date<input type="date" required value={searchEnd} onChange={e => setSearchEnd(e.target.value)}/></label><button className="screen-button" disabled={!!busy}>Search transaction</button></form></details>}
      </section>
      <section className="file-section"><div className="section-heading"><h3><span>02</span> Your evidence</h3><span className="tiny">{input.evidence.length} / {items.length} CONFIRMED</span></div><p className="section-intro">Tick only what you actually have. Each item contributes its shown weight to your evidence score.</p>
        <fieldset disabled={resolved || !!busy} className="evidence-list"><legend className="visually-hidden">Evidence checklist</legend>{items.map(item => <label key={item.id} className={input.evidence.includes(item.id) ? "evidence-row checked" : "evidence-row"}><input type="checkbox" checked={input.evidence.includes(item.id)} onChange={e => updateInput({ ...input, evidence: e.target.checked ? [...input.evidence, item.id] : input.evidence.filter(i => i !== item.id) })}/><span>{item.label}</span><small>+{item.weight}</small></label>)}</fieldset>
        {!items.length && <p className="warning-notice">This reason has no scoring checklist. Review it manually in the PayPal sandbox Resolution Center.</p>}
        {items.some(i => i.id === "tracking") && <fieldset disabled={resolved || !!busy} className="tracking-fields"><label>Carrier<input maxLength={100} placeholder="e.g. USPS" value={input.tracking?.carrier ?? ""} onChange={e => updateInput({ ...input, tracking: { number: input.tracking?.number ?? "", carrier: e.target.value } })}/></label><label>Tracking number<input maxLength={100} placeholder="Enter shipment tracking" value={input.tracking?.number ?? ""} onChange={e => updateInput({ ...input, tracking: { carrier: input.tracking?.carrier ?? "", number: e.target.value } })}/></label></fieldset>}
        {input.evidence.includes("tracking") && (!input.tracking?.carrier || !input.tracking.number) && <p className="inline-warning">Add both tracking fields to count this evidence.</p>}
        {!resolved && <><div className="attachment-row"><button className="screen-button" onClick={() => upload.current?.click()} disabled={!!busy || attachments.length >= 3}><Paperclip size={14}/> Attach supporting files</button><small>PDF / PNG / JPG · 500 KB each · up to 3</small><input ref={upload} className="visually-hidden" tabIndex={-1} type="file" accept="application/pdf,image/png,image/jpeg" multiple onChange={e => void attach(e.target.files)}/></div>{attachments.map(file => <div key={file.name} className="attachment-chip"><FileText size={13}/>{file.name}<button aria-label={`Remove ${file.name}`} onClick={() => setAttachments(a => a.filter(f => f.name !== file.name))}><X size={14}/></button></div>)}<p className="tiny attachment-note">Files are sent only when you confirm “File evidence”. {mode === "mock" ? "Demo file contents are discarded after filing." : "They remain in this browser until filing."}</p><button className="screen-button assess-button" onClick={() => void assess()} disabled={!!busy || !items.length}><Check size={14}/>{busy === "assess" ? "Assessing…" : "Record assessment"}</button></>}
      </section>
      <section className="file-section"><div className="section-heading"><h3><span>03</span> The seller’s brief</h3><span className="tiny">FACT-CHECKED DRAFT</span></div><p className="section-intro">A short note drawn only from your confirmed evidence. Read it before sending; you can edit the note in the confirmation step.</p>
        {brief ? <div className="brief-paper"><div className="brief-paper-top"><span>STATEMENT FOR THE RECORD</span><FileText size={15}/></div><div className="printed-brief" aria-label="Drafted seller evidence note">{brief.text.split(/(?<=\.)\s+/).map((line, i) => <p key={i} style={{ animationDelay: `${i * .12}s` }}>{line}</p>)}</div><div className="brief-credit">{brief.source === "nebius" ? "NEBIUS NEMOTRON · FACT GUARD PASSED" : "GROUNDED TEMPLATE"}</div>{brief.reason && <small>{brief.reason}</small>}</div> : <div className="brief-empty"><span>▌</span><p>{busy === "brief" ? "The clerk is preparing your statement…" : "Your facts, ready for the record."}</p><small>{busy === "brief" ? "Checking every sentence against confirmed evidence." : "Confirm your evidence, then ask the clerk to draft."}</small></div>}
        {!resolved && <button className="primary-button" onClick={() => void draft()} disabled={!!busy || !input.evidence.length}><Sparkles size={16}/>{busy === "brief" ? "Preparing brief…" : brief ? "Redraft evidence note" : "Draft evidence note"}<span>↗</span></button>}
      </section>
      <section className="file-section timeline-section"><div className="section-heading"><h3><span>04</span> Case timeline</h3><button className="text-link" onClick={openTrace}>View agent trace ↗</button></div><ol className="timeline">{[{ at: dispute.created ?? "", actor: "SYSTEM", text: "Dispute opened." }, ...dispute.messages].sort((a, b) => Date.parse(a.at || "0") - Date.parse(b.at || "0")).map((event, i) => <li key={`${i}-${event.at}`}><div><strong>{event.actor.replaceAll("_", " ")}</strong><time>{displayDate(event.at)}</time></div><p>{event.text}</p></li>)}</ol></section>
    </div><aside className="case-aside">
      <section className="verdict-card"><p className="section-index">THE COURT’S RECOMMENDATION</p><div className="large-stamp" key={verdict.recommendation}><VerdictStamp verdict={resolved ? "CLOSED" : verdict.supportedReason ? verdict.recommendation : "REVIEW"}/></div>{dispute.assessmentComplete === false ? <p className="assessment-pending">Not assessed</p> : <><div className="verdict-score"><strong>{verdict.score}<span>/100</span></strong><span>EVIDENCE<br/>STRENGTH</span></div><div className="score-bar"><i style={{ width: `${verdict.score}%` }}/></div></>}<p>{verdict.explanation}</p><div className="score-thresholds"><span>0–34 ACCEPT</span><span>35–64 OFFER</span><span>65+ FIGHT</span></div>
        {verdict.recommendation === "OFFER" && <div className="offer-estimate"><span>SUGGESTED PARTIAL REFUND</span><strong>{money({ ...dispute.amount, value: verdict.offerAmount })}</strong></div>}
        <div className="expected-value"><strong>Evidence, not odds</strong><p>This checklist measures confirmed records, not your chance of winning or expected recovery.</p><small>PayPal decides the outcome. Fees and preparation time are not scored.</small></div>
        <div className="missing-evidence"><strong>{dispute.assessmentComplete === false ? "NOT YET CONFIRMED" : verdict.missing.length ? "STILL MISSING" : "CHECKLIST COMPLETE"}</strong>{dispute.assessmentComplete === false ? <p>Review each record and record your assessment. Unchecked does not yet mean unavailable.</p> : verdict.missing.length ? <ul>{verdict.missing.map(item => <li key={item}>{item}</li>)}</ul> : <p>Every checklist item is confirmed. Check that the files support the note you submit.</p>}</div>
      </section>
      {!resolved && <section className="action-card"><p className="section-index">YOUR CALL, COUNSEL.</p><h3>Make your next move.</h3><p>Each action opens a review and confirmation step.</p><button className="primary-button" disabled={!can("evidence") || !brief} onClick={() => openAction("evidence")}><Send size={15}/> File evidence <span>↗</span></button>{!brief && <small>Draft a note first to file evidence.</small>}<button className="screen-button" disabled={!can("offer")} onClick={() => openAction("offer")}>Offer partial refund</button><button className="screen-button" disabled={!can("accept")} onClick={() => openAction("accept")}>Accept claim</button><button className="text-link" disabled={!can("message")} onClick={() => openAction("message")}>Send buyer a message ↗</button><small>Available actions follow the case’s current status and PayPal permissions.</small>
      <details className="sandbox-controls"><summary>Sandbox lifecycle controls</summary><p>Simulate the next review step. Adjudication sets a test outcome.</p><button className="screen-button" disabled={!can("sandbox_require_evidence")} onClick={() => openAction("sandbox_require_evidence")}>Request seller evidence</button><button className="screen-button" disabled={!can("sandbox_adjudicate")} onClick={() => openAction("sandbox_adjudicate")}>Adjudicate case</button><small>Available while the case is under review.</small></details></section>}
      <p className="aside-footnote">✧ No automatic filings.<br/>You always get the final say.</p>
    </aside></div>
    <dialog ref={dialog} className="confirm-dialog" aria-labelledby="confirm-title" onCancel={e => { if (busy === "action") e.preventDefault(); }}><form onSubmit={submitAction}><div className="drawer-top"><span className="section-index">REVIEW BEFORE YOU FILE</span><button type="button" className="icon-button" aria-label="Cancel action" disabled={busy === "action"} onClick={() => dialog.current?.close()}><X size={19}/></button></div><h2 id="confirm-title">{ACTION_LABELS[action]}</h2><p>{id} · {mode === "mock" ? "Synthetic demo" : "PayPal sandbox"}</p><div className="confirm-summary">{action === "accept" ? `Accept liability and refund ${money(dispute.amount)} in the sandbox. This resolves the case.` : action === "evidence" ? `Submit your reviewed note, confirmed tracking (if any), and ${attachments.length} attachment(s) for PayPal review.` : action === "offer" ? "Propose a partial refund. The buyer must accept it before the case is resolved." : action === "sandbox_adjudicate" ? "Set the sandbox outcome and resolve this test case." : action === "sandbox_require_evidence" ? "Reopen the seller response step for this sandbox case." : "Send this note to the buyer in the dispute conversation."}</div>
      {action === "evidence" && <div className="confirm-facts"><strong>CONFIRMED EVIDENCE</strong><p>{items.filter(i => input.evidence.includes(i.id)).map(i => i.label).join(" · ")}</p>{input.evidence.includes("tracking") && <p>{input.tracking?.carrier} / {input.tracking?.number}</p>}{attachments.length > 0 && <p>Files: {attachments.map(f => f.name).join(", ")}</p>}</div>}
      {action === "offer" && <label>Offer amount ({dispute.amount.currency})<input type="number" required min="0.01" max={dispute.amount.value} step="any" value={offer} onChange={e => setOffer(e.target.value)} disabled={busy === "action"}/></label>}
      {action === "sandbox_adjudicate" && <label>Test outcome<select value={outcome} onChange={e => setOutcome(e.target.value)} disabled={busy === "action"}><option value="SELLER_FAVOR">Seller favour</option><option value="BUYER_FAVOR">Buyer favour</option></select></label>}
      {!action.startsWith("sandbox_") && <label>Review your note<textarea required maxLength={2000} rows={7} value={note} onChange={e => setNote(e.target.value)} disabled={busy === "action"}/><small>{note.length} / 2000 characters. Check your edits against your records.</small></label>}
      {confirmError && <p role="alert" className="error-notice">{confirmError}</p>}<div className="confirm-buttons"><button type="button" className="screen-button" disabled={busy === "action"} onClick={() => dialog.current?.close()}>Cancel</button><button className="primary-button" disabled={busy === "action"}>{busy === "action" ? "Submitting…" : `Confirm ${action === "accept" ? "acceptance" : action === "offer" ? "offer" : action === "message" ? "message" : action === "evidence" ? "filing" : "sandbox action"}`}<Send size={14}/></button></div></form></dialog>
  </div>;
}
function ScaleMark() { return <span className="resolved-symbol" aria-hidden="true">⚖</span>; }
