"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { PlatformRestaurantDetailResponse } from "@restaurant-platform/shared-types";
import { resendOwnerInvitation } from "@/app/(admin)/actions";
import { formatDate } from "./restaurant-query";
import { Button, Notice } from "./ui";

type Owner = PlatformRestaurantDetailResponse["owners"][number];

export function OwnerInvitation({ restaurantId, owner }: { restaurantId: string; owner: Owner }) {
  const router = useRouter();
  const submitting = useRef(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [requested, setRequested] = useState(false);
  const [nextAllowedAt, setNextAllowedAt] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(false);
  const complete = owner.onboardingStatus === "COMPLETE";
  const unavailable = owner.onboardingStatus === "UNAVAILABLE" || owner.invitationStatus === "PROVIDER_UNAVAILABLE" || !owner.email;
  const invitationLabels: Record<string, string> = {
    INVITED: "Invitation recorded",
    ACCEPTED: "Auth contact confirmed",
    NOT_INVITED: "No invitation recorded",
    PROVIDER_UNAVAILABLE: "Auth provider unavailable",
  };

  useEffect(() => {
    if (!nextAllowedAt) return;
    const delay = Date.parse(nextAllowedAt) - Date.now();
    if (!Number.isFinite(delay) || delay <= 0) return;
    const timeout = window.setTimeout(() => setCooldown(false), Math.min(delay, 2_147_483_647));
    return () => window.clearTimeout(timeout);
  }, [nextAllowedAt]);

  async function resend() {
    if (submitting.current || complete || unavailable || cooldown) return;
    submitting.current = true;
    setBusy(true);
    setFailure(null);
    setRequested(false);
    try {
      const result = await resendOwnerInvitation(restaurantId, owner.userId);
      if (result.ok) {
        setRequested(true);
        setNextAllowedAt(result.data.nextAllowedAt);
        setCooldown(Date.parse(result.data.nextAllowedAt) > Date.now());
        router.refresh();
      } else setFailure(result.message);
    } catch {
      setFailure("The request could not be confirmed. Refresh the status before trying again.");
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  return <div className="owner-details">
    <dl className="detail-list">
      <div><dt>Auth user ID</dt><dd>{owner.userId}</dd></div>
      <div><dt>Owner name</dt><dd>{owner.fullName || "Not recorded"}</dd></div>
      <div><dt>Auth account email</dt><dd>{owner.email || "Unavailable"}</dd></div>
      <div><dt>Account status</dt><dd>{invitationLabels[owner.invitationStatus] ?? "Unavailable"}</dd></div>
      <div><dt>Password setup</dt><dd>{complete ? `Completed${owner.onboardingCompletedAt ? ` · ${formatDate(owner.onboardingCompletedAt)}` : ""}` : unavailable ? "Status unavailable" : "Setup not confirmed"}</dd></div>
    </dl>
    {complete ? <Notice tone="success" title="Owner setup completed">
      Open Operations to sign in. If the owner forgot their password, use <Link href="/auth/recover">password recovery</Link>.
    </Notice> : unavailable ? <Notice tone="warning" title="Invitation unavailable">
      Refresh the status when the Auth provider is available. A registered owner email is required.
    </Notice> : <>
      <p className="muted small">An Auth account or confirmed email does not prove password setup. Existing accounts receive an account setup or recovery email, preserving their identity and restaurant membership.</p>
      <Button variant="secondary" disabled={busy || cooldown} onClick={resend} aria-busy={busy}>
        {busy ? "Requesting email…" : cooldown ? "Email requested · please wait" : "Resend owner invitation"}
      </Button>
    </>}
    {requested && <Notice tone="success" title="Account setup email requested">
      The email provider accepted the request for the registered owner. Check the inbox and spam folder; delivery is not guaranteed. {cooldown && nextAllowedAt && `Another request is available after ${formatDate(nextAllowedAt)}.`}
    </Notice>}
    {failure && <Notice tone="error" title="Invitation request unsuccessful">{failure}</Notice>}
  </div>;
}
