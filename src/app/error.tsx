"use client";
export default function ErrorPage({ reset }: { reset: () => void }) { return <div className="empty-state"><h2>A brief recess.</h2><p>The workspace hit an unexpected error. Your sandbox records are still with PayPal.</p><button className="screen-button" onClick={reset}>Try again</button></div>; }
