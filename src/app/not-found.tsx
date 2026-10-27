import Link from "next/link";
export default function NotFound() { return <div className="empty-state"><h2>File not found.</h2><p>The clerk couldn’t locate that page.</p><Link className="text-link" href="/">Return to the docket →</Link></div>; }
