import Link from "next/link";

export function Brand({ light = false }: { light?: boolean }) {
  return <Link className={`brand${light ? " brand-light" : ""}`} href="/" aria-label="Restaurant Platform home">
    <span className="brand-mark" aria-hidden="true"><svg viewBox="0 0 28 28" fill="none"><path d="M7 6v7m4-7v7M7 10h4m-2 3v9M19 6c-3 3-4 6-4 9h5M20 6v16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
    <span>Restaurant<span className="brand-subtitle">PLATFORM ADMIN</span></span>
  </Link>;
}
