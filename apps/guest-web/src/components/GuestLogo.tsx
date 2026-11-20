"use client";

/* eslint-disable @next/next/no-img-element -- Validated public logos use direct no-referrer browser requests. */
import { useState } from "react";

/** Receives only the current tenant's server-validated public logo. */
export function GuestLogo({ src, name }: { src?: string; name: string }) {
  const [failed, setFailed] = useState(false);
  return src && !failed
    ? <img src={src} width={44} height={44} alt="" decoding="async" referrerPolicy="no-referrer"
        ref={node => {
          // The browser can finish a failed request before React hydrates and
          // attaches onError, including failures served from its image cache.
          if (node?.complete && node.naturalWidth === 0) setFailed(true);
        }}
        onError={() => setFailed(true)} />
    : <span className="brand-monogram" aria-hidden="true">{Array.from(name)[0]}</span>;
}
