"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AllCommunityModule, ModuleRegistry, themeQuartz, type ColDef, type ICellRendererParams } from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import { ArrowRight, FolderOpen, RefreshCw, Search } from "lucide-react";
import { Deadline, VerdictStamp } from "./case-widgets";
import { useCourt } from "./court-shell";
import { money, REASONS } from "@/lib/verdict";
import type { DocketRow } from "@/lib/types";
ModuleRegistry.registerModules([AllCommunityModule]);
const crtTheme = themeQuartz.withParams({
  browserColorScheme: "dark", backgroundColor: "#102b30", foregroundColor: "#c6e9ce", headerBackgroundColor: "#18373a", headerTextColor: "#a8c7b5", borderColor: "#46645c", rowBorder: { color: "#34534d" }, rowHoverColor: "#c3ebc314", selectedRowBackgroundColor: "#b8e3bf22", accentColor: "#c6ecc5", fontFamily: '"IBM Plex Mono", monospace', fontSize: 11, headerFontSize: 9, headerFontWeight: 500, spacing: 7, wrapperBorderRadius: 2, cellHorizontalPadding: 15,
});
export function Docket() {
  const { call, mode } = useCourt(); const router = useRouter();
  const searchInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.key === "/" && !event.ctrlKey && !event.metaKey && !event.altKey && !target?.matches("input, textarea, select, [contenteditable=true]") && !document.querySelector("dialog[open]")) { event.preventDefault(); searchInput.current?.focus(); }
    };
    document.addEventListener("keydown", focusSearch);
    return () => document.removeEventListener("keydown", focusSearch);
  }, []);
  const [visibleCount, setVisibleCount] = useState(0);
  const [rows, setRows] = useState<DocketRow[]>([]); const [next, setNext] = useState<string>();
  const [busy, setBusy] = useState(true); const [error, setError] = useState(""); const [query, setQuery] = useState(""); const [reason, setReason] = useState("ALL");
  const load = useCallback(async (cursor?: string) => {
    setBusy(true); setError("");
    try {
      const result = await call(`/api/disputes${cursor ? `?next=${encodeURIComponent(cursor)}` : ""}`);
      setRows(previous => cursor ? [...new Map([...previous, ...(result.disputes ?? [])].map(d => [d.id, d])).values()] : result.disputes ?? []); setNext(result.next);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load the docket."); }
    finally { setBusy(false); }
  }, [call]);
  useEffect(() => {
    let active = true;
    void call("/api/disputes").then(result => { if (active) { setRows(result.disputes ?? []); setNext(result.next); } })
      .catch(e => { if (active) setError(e instanceof Error ? e.message : "Could not load the docket."); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [call]);
  const columns = useMemo<ColDef<DocketRow>[]>(() => [
    { headerName: "CASE FILE / BUYER", field: "id", getQuickFilterText: p => `${p.data?.id ?? ""} ${p.data?.buyer ?? ""}`, minWidth: 184, flex: 1.2, cellRenderer: ({ data }: ICellRendererParams<DocketRow>) => data && <button className="case-cell" aria-label={`Open case ${data.id}`} onClick={event => { event.stopPropagation(); router.push(`/cases/${data.id}`); }}><strong>{data.id.replace("MOCK-CASE-", "MOCK-")}</strong><span>{data.buyer}</span></button> },
    { headerName: "BUYER CLAIM", field: "reason", minWidth: 168, flex: 1.2, valueFormatter: p => REASONS[p.value] ?? p.value },
    { headerName: "AMOUNT", colId: "amount", minWidth: 102, width: 108, valueGetter: p => p.data?.amount.value, valueFormatter: p => p.data ? p.data.amountAvailable === false ? "Unavailable" : money(p.data.amount) : "", filter: "agNumberColumnFilter" },
    { headerName: "RESPONSE DUE", colId: "deadline", minWidth: 124, width: 132, valueGetter: p => p.data?.verdict.daysLeft, cellRenderer: ({ data }: ICellRendererParams<DocketRow>) => data && <Deadline days={data.verdict.daysLeft} resolved={data.status === "RESOLVED"}/>, sort: "asc", comparator: (a: number | null, b: number | null) => (a ?? 99999) - (b ?? 99999) },
    { headerName: "EVIDENCE", colId: "score", width: 113, minWidth: 108, valueGetter: p => p.data?.assessmentComplete === false ? null : p.data?.verdict.score, filter: "agNumberColumnFilter", cellRenderer: ({ data }: ICellRendererParams<DocketRow>) => data && (data.assessmentComplete === false ? <span>Not assessed</span> : <span className="strength-cell"><span className="strength-track"><i style={{ width: `${data.verdict.score}%` }}/></span><span>{data.verdict.score}%</span></span>) },
    { headerName: "RECOMMENDATION", colId: "verdict", minWidth: 136, width: 146, valueGetter: p => p.data?.status === "RESOLVED" ? "CLOSED" : p.data?.verdict.supportedReason ? p.data.verdict.recommendation : "REVIEW", cellRenderer: (p: ICellRendererParams<DocketRow>) => <VerdictStamp verdict={p.value ?? "ACCEPT"} small/> },
    { headerName: "STATUS", field: "status", minWidth: 156, flex: 1, valueFormatter: p => ({ WAITING_FOR_SELLER_RESPONSE: "Seller response", WAITING_FOR_BUYER_RESPONSE: "Buyer response", UNDER_REVIEW: "Under review", RESOLVED: "Resolved" })[p.value as string] ?? p.value, cellClass: "status-cell" },
  ], [router]);
  const filtered = rows.filter(d => reason === "ALL" || d.reason === reason);
  const open = rows.filter(d => d.status !== "RESOLVED"); const urgent = open.filter(d => d.verdict.urgent);
  const totals = new Map<string, number>(); open.filter(d => d.amountAvailable !== false).forEach(d => totals.set(d.amount.currency, (totals.get(d.amount.currency) ?? 0) + d.amount.value));
  return <div className="docket-content">
    <div className="workspace-heading"><div><p className="section-index">{mode === "mock" ? "MOONLIT CERAMICS / SYNTHETIC SHOP" : "YOUR SANDBOX SHOP"}</p><h2>The docket<span className="heading-spark">✳</span></h2><p>A little order in the dispute disorder. Select a case to get started.</p></div><button className="screen-button" onClick={() => void load()} disabled={busy}><RefreshCw size={14} className={busy ? "spin" : ""}/> Refresh</button></div>
    <div className="docket-stats"><div><span>OPEN CASES</span><strong>{busy && !rows.length ? "—" : String(open.length).padStart(2, "0")}</strong><small>{rows.length} cases on your desk{next ? " · more available" : ""}</small></div><div><span>FUNDS AT STAKE</span><strong className="money-stat">{totals.size ? [...totals].map(([currency, value]) => money({ currency, value })).join(" + ") : "$0.00"}</strong><small>Across open cases{open.some(d => d.amountAvailable === false) ? " · incomplete amounts" : next ? " loaded so far" : ""}</small></div><div className={urgent.length ? "urgent-stat" : ""}><span>NEEDS YOUR ATTENTION</span><strong>{String(urgent.length).padStart(2, "0")}<span className="stat-dot"/></strong><small>Due within 3 days or overdue</small></div><div className="docket-tip"><FolderOpen size={28} strokeWidth={1}/><p>Good records.<br/>Better responses.</p><small>You’re in the right place.</small></div></div>
    <div className="docket-toolbar"><label className="search-box"><Search size={15}/><input ref={searchInput} aria-label="Search cases" placeholder="Search case, buyer or claim…" value={query} onChange={e => setQuery(e.target.value)}/><kbd>/</kbd></label><span>{visibleCount} CASE{visibleCount === 1 ? "" : "S"} IN VIEW</span></div>
    <div className="reason-filters" aria-label="Filter by dispute reason"><button aria-pressed={reason === "ALL"} onClick={() => setReason("ALL")}>All cases <span>{rows.length}</span></button>{Object.entries(REASONS).map(([code, label]) => <button key={code} aria-pressed={reason === code} onClick={() => setReason(code)}>{label}</button>)}</div>
    {error && <div role="alert" className="error-notice">{error}<button onClick={() => void load()}>Try again</button></div>}
    {!busy && !error && !rows.length && mode === "sandbox" && <p className="warning-notice">No sandbox disputes yet. Have a sandbox buyer open a dispute on a completed test payment, then refresh the docket.</p>}
    <div className="docket-grid" aria-label="Dispute docket"><AgGridReact<DocketRow> theme={crtTheme} rowData={filtered} columnDefs={columns} defaultColDef={{ sortable: true, filter: true, resizable: true }} quickFilterText={query} onModelUpdated={event => setVisibleCount(event.api.getDisplayedRowCount())} getRowId={p => p.data.id} rowHeight={69} headerHeight={43} loading={busy && !rows.length} animateRows={false} tooltipShowDelay={300} onRowClicked={e => e.data && router.push(`/cases/${e.data.id}`)} onCellKeyDown={e => { if ((e.event as KeyboardEvent)?.key === "Enter" && e.data) router.push(`/cases/${e.data.id}`); }} overlayNoRowsTemplate="<span>No cases match. Clear your filters or refresh the docket.</span>"/></div>
    <div className="docket-footnote"><p><span>↳</span> Click a row to open its case file. Sort or filter any column.</p>{next && <button className="screen-button" onClick={() => void load(next)} disabled={busy}>Load more cases <ArrowRight size={14}/></button>}</div>
    <div className="court-note"><span>✧</span><p><strong>A recommendation, never a ruling.</strong> Evidence scores are transparent heuristics. Confirm what you have before you act. Final decisions stay with you and PayPal.</p></div>
  </div>;
}
