import Link from "next/link";
import { messages, type GuestLocale } from "@/lib/i18n";

export function GuestState({ kind, locale, basePath = "" }: {
  kind: "loading" | "unavailable" | "error" | "not-found" | "unknown" | "empty";
  locale: GuestLocale; basePath?: string;
}) {
  const text = messages[locale];
  const [title, note] = {
    loading: [text.loading, text.loadingNote], unavailable: [text.unavailableTitle, text.unavailableNote],
    error: [text.errorTitle, text.errorNote], "not-found": [text.notFoundTitle, text.notFoundNote],
    unknown: [text.unknownTitle, text.unknownNote], empty: [text.emptyTitle, text.emptyNote],
  }[kind];
  return <section className="state-panel" role={kind === "loading" ? "status" : undefined} aria-busy={kind === "loading" || undefined}>
    <span className={`state-mark ${kind === "loading" ? "is-loading" : ""}`} aria-hidden="true">{kind === "loading" ? "·" : "✳"}</span>
    <h1>{title}</h1><p>{note}</p>
    {(kind === "not-found" || kind === "error" || kind === "unavailable") && <Link className="button" href={`${basePath}/menu`} prefetch={false}>{kind === "not-found" ? text.back : text.retry}</Link>}
    {kind === "loading" && <div className="loading-lines" aria-hidden="true"><span /><span /><span /></div>}
  </section>;
}
