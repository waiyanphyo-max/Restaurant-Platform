"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Brand } from "./Brand";
import { SignOutButton } from "./SignOutButton";
import { SessionMonitor } from "./SessionMonitor";

const navigation = [
  { href: "/", label: "Overview", icon: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z" },
  { href: "/restaurants", label: "Restaurants", icon: "M4 21V4h16v17M2 21h20M8 8h2m4 0h2M8 12h2m4 0h2M10 21v-5h4v5" },
  { href: "/provisioning", label: "Provisioning", icon: "M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5" },
  { href: "/restaurant-details", label: "Restaurant details", icon: "M5 3h10l4 4v14H5zM14 3v5h5M9 12h6m-6 4h6" },
  { href: "/settings", label: "Settings", icon: "M4 7h16M4 17h16M8 4v6m8 4v6" },
];

function LineIcon({ path }: { path: string }) {
  return <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d={path} /></svg>;
}

export function AdminShell({ userId, stage, children }: { userId: string; stage: string; children: ReactNode }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const account = useRef<HTMLDivElement>(null);
  const accountButton = useRef<HTMLButtonElement>(null);
  const current = navigation.find(item => item.href === pathname) ?? navigation[0];

  useEffect(() => {
    const close = (event: MouseEvent) => { if (!document.querySelector("dialog[open]") && !account.current?.contains(event.target as Node)) setAccountOpen(false); };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (document.querySelector("dialog[open]")) return;
        setMobileOpen(false);
        setAccountOpen(false);
        if (account.current?.contains(document.activeElement)) accountButton.current?.focus();
      }
    };
    document.addEventListener("click", close);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("click", close); document.removeEventListener("keydown", escape); };
  }, []);

  return <div className="admin-app">
    <SessionMonitor userId={userId} />
    <a className="skip-link" href="#main-content">Skip to content</a>
    <aside className={`sidebar${mobileOpen ? " sidebar-open" : ""}`} aria-label="Platform workspace">
      <Brand light />
      <div className="workspace-label"><span className="workspace-avatar">P</span><span>Platform workspace<small>Administration</small></span></div>
      <span className="nav-label">WORKSPACE</span>
      <nav aria-label="Main navigation">{navigation.map(item => <Link key={item.href} href={item.href} prefetch={false} className={`nav-item${item.href === pathname ? " active" : ""}`} aria-current={item.href === pathname ? "page" : undefined} onClick={() => setMobileOpen(false)}><LineIcon path={item.icon} />{item.label}{item.href === pathname && <span className="nav-dot" />}</Link>)}</nav>
      <div className="sidebar-bottom"><div className="secure-label"><span className="status-dot" />Restricted workspace</div><p>For authorized platform operators.</p><span className="sidebar-version">RESTAURANT PLATFORM · M3</span></div>
    </aside>
    <div className="main-wrap">
      <header className="topbar">
        <div className="topbar-location"><button type="button" className="icon-button mobile-toggle" aria-label={mobileOpen ? "Close navigation" : "Open navigation"} aria-expanded={mobileOpen} aria-controls="mobile-navigation" onClick={() => setMobileOpen(!mobileOpen)}><LineIcon path="M4 6h16M4 12h16M4 18h16" /></button><span className="breadcrumb-parent">Workspace</span><span className="breadcrumb-slash">/</span><strong>{current.label}</strong></div>
        <div className="topbar-actions"><span className="environment"><span className="status-dot" />{stage}</span><div className="account" ref={account}><button ref={accountButton} type="button" className="account-trigger" aria-label="Account menu" aria-expanded={accountOpen} aria-controls="account-panel" onClick={() => setAccountOpen(!accountOpen)}><span className="avatar">PA</span><span className="account-name">Platform admin<small>Authorized operator</small></span><span aria-hidden="true">⌄</span></button>{accountOpen && <div id="account-panel" className="account-panel"><p className="overline">SIGNED IN ACCOUNT</p><strong>Platform administrator</strong><code>{userId}</code><Link href="/settings" onClick={() => setAccountOpen(false)}>Account &amp; settings</Link><SignOutButton /></div>}</div></div>
      </header>
      <div id="mobile-navigation" className="mobile-nav" hidden={!mobileOpen}><nav aria-label="Mobile navigation">{navigation.map(item => <Link key={item.href} href={item.href} prefetch={false} aria-current={item.href === pathname ? "page" : undefined} onClick={() => setMobileOpen(false)}>{item.label}</Link>)}</nav></div>
      <main id="main-content" className="page-content" tabIndex={-1}>{children}</main>
      <footer className="app-footer"><span>Restaurant Platform</span><span>Secure administration workspace</span></footer>
    </div>
  </div>;
}
