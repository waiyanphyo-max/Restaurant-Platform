"use client";

export default function AdminError({ reset }: { reset: () => void }) {
  return <section className="panel error-panel" role="alert"><span className="state-symbol" aria-hidden="true">!</span><h1>We couldn’t load this page</h1><p>The service may be temporarily unavailable. Try loading the page again.</p><button className="button button-primary" onClick={reset}>Try again</button></section>;
}
