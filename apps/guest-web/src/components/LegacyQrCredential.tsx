"use client";

import { useEffect, useState } from "react";
import { readQrTokenFromHash } from "@/lib/qr-fragment";

export function LegacyQrCredential() {
  // The credential stays in client memory for a later checkout implementation.
  const [token, setToken] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const fragment = window.location.hash;
    const credential = readQrTokenFromHash(fragment);
    if (fragment) {
      window.history.replaceState(
        window.history.state,
        "",
        window.location.pathname + window.location.search,
      );
    }
    setToken(credential);
    setChecked(true);
  }, []);

  if (!checked) return <p role="status">Checking the QR link…</p>;
  if (!token) return <p role="alert">This QR link has no usable credential.</p>;

  return (
    <p role="status">
      The QR credential was recognized and removed from the address bar. Ordering is not active in
      this starter.
    </p>
  );
}
