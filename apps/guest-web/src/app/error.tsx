"use client";

import { messages } from "@/lib/i18n";
import { useGuestSession } from "@/components/GuestSession";

export default function GuestError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { locale } = useGuestSession();
  const text = messages[locale];
  // Intentionally do not render/log the exception or request URL.
  return <section className="state-panel" role="alert"><span className="state-mark" aria-hidden="true">✳</span><h1>{text.errorTitle}</h1><p>{text.errorNote}</p><button className="button" onClick={reset}>{text.retry}</button></section>;
}
