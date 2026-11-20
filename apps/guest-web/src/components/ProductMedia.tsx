"use client";

/* eslint-disable @next/next/no-img-element -- Verified public media loads directly without a referrer or server proxy. */
import { useState } from "react";
import { safeImageUrl } from "@/lib/menu";

/** Stable media slot; neither missing photos nor network failures invent restaurant imagery. */
export function ProductMedia({ src, alt, fallbackLabel, className = "", width = 160, height = 160, priority = false }: {
  src?: string | null; alt: string; fallbackLabel?: string; className?: string;
  width?: number; height?: number; priority?: boolean;
}) {
  const url = safeImageUrl(src);
  const [failedSource, setFailedSource] = useState<string>();
  const fallback = !url || failedSource === url;
  return <span className={`product-media ${className}`}>
    {fallback
      ? <span className="product-media-fallback" role="img" aria-label={fallbackLabel || alt}>
          <span aria-hidden="true">♨</span>
        </span>
      : <img src={url} alt={alt} width={width} height={height} loading={priority ? "eager" : "lazy"}
          decoding="async" referrerPolicy="no-referrer"
          ref={node => {
            // A failed SSR image may finish before hydration attaches onError.
            if (node?.complete && node.naturalWidth === 0) setFailedSource(url);
          }} onError={() => setFailedSource(url)} />}
  </span>;
}
