"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useRef, useState } from "react";
import { Activity, ArrowUpRight, Scale, X } from "lucide-react";
import { NightScene } from "./night-scene";
import type { ApiEnvelope, TraceEntry } from "@/lib/types";

type CourtContext = { mode: "mock" | "sandbox" | null; call: (path: string, body?: unknown) => Promise<ApiEnvelope & { calendar?: string }>; openTrace: () => void };
const Context = createContext<CourtContext | null>(null);
export function useCourt() { const context = useContext(Context); if (!context) throw new Error("Court context missing"); return context; }
export function CourtShell({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<CourtContext["mode"]>(null);
  const [trace, setTrace] = useState<TraceEntry[]>([]);
  const dialog = useRef<HTMLDialogElement>(null); const pathname = usePathname();
  const call = useCallback(async (path: string, body?: unknown) => {
    const response = await fetch(path, { method: body === undefined ? "GET" : "POST", headers: body === undefined ? undefined : { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body), cache: "no-store" });
    let result: ApiEnvelope & { calendar?: string };
    try { result = await response.json(); } catch { throw new Error("The server could not return this case. Please retry."); }
    if (result.mode) setMode(result.mode);
    if (Array.isArray(result.trace)) setTrace(previous => [...previous, ...result.trace].slice(-200));
    if (!response.ok || result.error) throw new Error(result.error ?? "Request failed. Please retry.");
    return result;
  }, []);
  const openTrace = useCallback(() => dialog.current?.showModal(), []);
  return <Context.Provider value={{ mode, call, openTrace }}>
    <NightScene />
    <a href="#main" className="skip-link">Skip to case workspace</a>
    <header className="site-header"><div className="header-inner">
      <Link className="brand" href="/" aria-label="Chargeback Court home"><Scale size={28} strokeWidth={1.5} /><span>chargeback<span className="brand-light">court</span><sup>✧</sup></span></Link>
      <nav aria-label="Main navigation"><Link href="/#how-it-works">How it works <ArrowUpRight size={13}/></Link><span className="mode-badge"><i />{mode === "mock" ? "Demo mode: synthetic sandbox data" : mode === "sandbox" ? "Connected to PayPal sandbox" : "Sandbox only"}</span></nav>
    </div></header>
    <main id="main" className="page-shell">
      <section className={`hero ${pathname !== "/" ? "case-hero" : ""}`}>
        <div><p className="eyebrow"><span>✧</span> A little backup for the little business</p><h1>{pathname === "/" ? <>Small shop.<br/><em>Strong defence.</em><span className="cursor">_</span></> : <>Every case deserves<br/><em>a fair hearing.</em></>}</h1><p className="hero-description">Your AI paralegal for PayPal disputes.<br/>Gather the facts. Know your options. Make your case.</p></div>
        <aside className="hero-note"><div className="seal"><Scale size={33} strokeWidth={1}/><span>SELLER<br/>DEFENCE<br/>DIVISION</span></div><p>For the makers.<br/>The late-night packers.<br/>The one-person shops.</p><span className="tiny">COURT IS NOW IN SESSION ↙</span></aside>
      </section>
      <section className="computer-case" aria-label="Chargeback Court workspace">
        <div className="hardware-top"><div className="hardware-nameplate">CHARGEBACK COURT <strong>5150</strong></div><div className="hardware-vents"/><span className="power-label"><i/> POWER</span></div>
        <div className="crt-screen"><div className="screen-topline"><span>CC–DOS 1.0 / SELLER DEFENCE SYSTEM</span><span><i/> SYSTEM READY</span></div>
          <div className="screen-nav"><Link href="/" className={pathname === "/" ? "active" : ""}>01 / Docket</Link>{pathname !== "/" && <span className="active">02 / Case file</span>}<button onClick={openTrace}><Activity size={14}/> Agent trace <span className="trace-count">{trace.length.toString().padStart(2, "0")}</span></button></div>
          {children}
          <div className="screen-bottom"><span>PAYPAL SANDBOX • AG GRID COMMUNITY</span><span>FACTS FIRST. ALWAYS.</span></div>
        </div>
        <div className="hardware-bottom"><div className="hardware-vents"/><span>BUILT FOR THE BUSINESS YOU BUILT.</span><div className="hardware-controls"><i/><i/><i/></div></div>
      </section>
      <section id="how-it-works" className="how-it-works"><p className="section-index">THE COURT PROCEDURE / THREE SIMPLE STEPS</p><div className="how-grid">
        <div><span>01</span><h3>Open the case.</h3><p>Your PayPal disputes, transactions and response deadlines, together in one docket.</p></div>
        <div><span>02</span><h3>Let the facts speak.</h3><p>Confirm the evidence you have. A transparent checklist scores your case; AI drafts the note.</p></div>
        <div><span>03</span><h3>You have the final say.</h3><p>Review the brief, then confirm before filing evidence, offering a refund or accepting a claim.</p></div>
      </div></section>
      <footer className="site-footer"><span><Scale size={17}/> Chargeback Court</span><p>Sandbox only. Not legal advice.</p><span>MADE FOR SMALL SELLERS <span aria-hidden="true">✧</span></span></footer>
    </main>
    <dialog ref={dialog} className="trace-drawer" aria-labelledby="trace-title"><div className="drawer-paper"><div className="drawer-top"><span className="section-index">THE PAPER TRAIL</span><button className="icon-button" aria-label="Close agent trace" onClick={() => dialog.current?.close()}><X size={20}/></button></div><h2 id="trace-title">Nothing behind<br/><em>the curtain.</em></h2><p>Every PayPal request made during this visit. Demo entries are simulated; status 0 means a network failure. Paths exclude query values. Tokens and request bodies never enter this trace.</p><div className="trace-legend"><span>{trace.length} RECENT CALLS</span><button onClick={() => setTrace([])}>Clear trace</button></div>
      {!trace.length ? <p className="empty-state">Open the docket or a case to start the paper trail.</p> : <ol className="trace-list">{trace.map((entry, index) => <li key={entry.id}><div className="trace-row"><strong>{String(index + 1).padStart(2, "0")} / {entry.method}</strong><span className={entry.status >= 400 || !entry.status ? "trace-error" : ""}>{entry.status || "ERR"} · {entry.ms} ms</span></div><code>{entry.path}</code><small>{entry.mode === "mock" ? "SIMULATED" : "PAYPAL SANDBOX"} · {new Date(entry.at).toLocaleTimeString()}</small></li>)}</ol>}
      <div className="receipt-end"><span>END OF RECORD</span><span className="barcode"/></div></div></dialog>
  </Context.Provider>;
}
