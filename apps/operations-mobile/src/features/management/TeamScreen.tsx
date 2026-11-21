import { useRef, useState, type ComponentRef } from "react";
import { View } from "react-native";
import { ApiHttpError } from "@restaurant-platform/api-client";
import type { InviteRestaurantMemberRequest, RestaurantMemberResponse } from "@restaurant-platform/shared-types";
import { getOperationsApi } from "../../api";
import { useOperationsAuth } from "../../auth/AuthProvider";
import { QueryResult } from "../../components/QueryResult";
import { Action, Body, Card, ConfirmDialog, FormField, Page, StateView, Status } from "../../components/ui";
import { useApiMutation } from "../../hooks/useApiMutation";
import { useApiQuery } from "../../hooks/useApiQuery";
import { useUnsavedChanges } from "../../hooks/useUnsavedChanges";
import { exactTimestamp } from "../operations/format";
import { Choices, FormStatus } from "./controls";
import { invitationEmail, isTeamRole, optionalText, TEAM_ROLES, type TeamRole } from "./validation";
import { useInvitationRecovery } from "./InvitationRecoveryProvider";

type MemberAction = { kind: "remove" | "transfer" | "role"; member: RestaurantMemberResponse; role?: TeamRole };

export function TeamScreen() {
  const { state } = useOperationsAuth();
  if (state.status !== "ready" || state.membership.role !== "OWNER") return <Page title="Team"><StateView kind="forbidden" message="Only the restaurant Owner can manage team membership." /></Page>;
  return <ManagedTeam key={`${state.userId}:${state.membership.restaurantId}:${state.membership.role}`} />;
}

function ManagedTeam() {
  const query = useApiQuery(signal => getOperationsApi().listMembers({ signal }), "managed-team", { keepPreviousData: true });
  const { state, retryMembership, assertWorkspaceAccess } = useOperationsAuth();
  const recovery = useInvitationRecovery();
  const [search, setSearch] = useState("");
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<TeamRole>("STAFF");
  const [formError, setFormError] = useState<string | null>(null);
  const [invited, setInvited] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [nextRole, setNextRole] = useState<TeamRole>("STAFF");
  const [confirmation, setConfirmation] = useState<MemberAction | null>(null);
  const [pendingInvitation, setPendingInvitation] = useState<InviteRestaurantMemberRequest | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [ownershipResult, setOwnershipResult] = useState<"transferred" | "uncertain" | null>(null);
  const mutation = useApiMutation();
  const invitationButton = useRef<ComponentRef<typeof View>>(null);
  const memberButton = useRef<ComponentRef<typeof View>>(null);
  useUnsavedChanges(!!email.trim() || !!fullName.trim());
  const api = () => {
    if (state.status !== "ready" || state.membership.role !== "OWNER") throw new Error("Owner access is unavailable");
    const { userId, membership: { role } } = state;
    return getOperationsApi({ userId, assertCurrentAccess: () => assertWorkspaceAccess(userId, role) });
  };
  const blockedInvitation = recovery.get(email);
  function invite() {
    setFormError(null); setInvited(false);
    try {
      if (mutation.busy || forbidden) return;
      if (!isTeamRole(role)) throw new Error("Choose Manager, Staff or Delivery Driver. Ownership uses its separate transfer workflow.");
      const body = { email: invitationEmail(email), fullName: optionalText(fullName, 150, "Full name"), role };
      if (recovery.get(body.email)) throw new Error("This address has a previous invitation attempt. Check the current team and use the verified-account support flow; do not send it again.");
      if (query.state.status !== "ready") throw new Error("Load the current team before reviewing an invitation.");
      if (query.state.data.some(member => member.email?.trim().toLowerCase() === body.email)) throw new Error("A current member uses this email label. Review that existing member; a profile email is not proof of Auth identity.");
      setPendingInvitation(body);
    } catch (error) { setFormError(error instanceof Error ? error.message : "Check the invitation fields."); }
  }
  function sendInvitation() {
    const body = pendingInvitation;
    if (!body || mutation.busy || forbidden || recovery.get(body.email)) return;
    setPendingInvitation(null); setFeedback(null);
    recovery.record(body.email, "sending");
    void mutation.run(() => api().inviteMember(body), () => {
      recovery.record(body.email, "confirmed"); setEmail(""); setFullName(""); setInvited(true); query.reload();
    }, failure => {
      if (failure instanceof ApiHttpError && failure.status === 403) { recovery.rejected(body.email); setForbidden(true); void retryMembership(); }
      else if (failure instanceof ApiHttpError && failure.status === 409) { recovery.record(body.email, "conflict"); setFeedback("Invitation conflict: refresh current members. Existing registered addresses require verified-account support; no invitation was repeated."); query.reload(); }
      else if (failure instanceof ApiHttpError && ([400, 401, 422].includes(failure.status) || failure.code === "MEMBER_INVITATION_NOT_CONFIGURED")) recovery.rejected(body.email);
      else { recovery.record(body.email, "uncertain"); setFeedback("Invitation outcome is uncertain. It may already have reached the provider. Check current members before any further decision; this address will not be sent again in this session."); }
    });
  }
  function reconcileInvitation(email: string) {
    if (mutation.busy || forbidden) return;
    setFeedback(null);
    void mutation.run(() => api().listMembers(), members => {
      const match = members.find(member => member.email?.trim().toLowerCase() === email);
      if (match) { recovery.record(email, "confirmed"); setFeedback(`The refreshed team lists ${match.fullName ?? match.email ?? "a member"} as ${match.role.replaceAll("_", " ")}. Email delivery and account activation are still unverified. No invitation was repeated.`); }
      else setFeedback("No matching email label appears in the refreshed team. This does not prove the provider failed or that no account was created. This address remains blocked; use the verified-account support flow before recovery.");
      query.reload();
    });
  }
  function confirmAction() {
    const action = confirmation; setConfirmation(null); setFeedback(null);
    if (!action) return;
    if (action.kind === "transfer") {
      void mutation.run(() => api().transferOwnership({ newOwnerUserId: action.member.userId }), () => {
        setOwnershipResult("transferred"); setSelected(null); setEmail(""); setFullName(""); setPendingInvitation(null); setFeedback("Ownership transferred. Rechecking your current role…"); void retryMembership();
      }, failure => {
        if (!(failure instanceof ApiHttpError && failure.status >= 400 && failure.status < 500 && failure.status !== 408)) setOwnershipResult("uncertain");
        setSelected(null); void retryMembership(); query.reload();
      });
    } else if (action.kind === "remove") {
      void mutation.run(() => api().removeMember(action.member.id), () => { setSelected(null); setFeedback("Restaurant membership removed. Historical records remain."); query.reload(); });
    } else if (action.role) {
      const newRole = action.role;
      void mutation.run(() => api().updateMember(action.member.id, { userId: action.member.userId, role: newRole }), () => { setSelected(null); setFeedback("Member role saved by the server."); query.reload(); });
    }
  }
  const confirmationTitle = confirmation?.kind === "transfer" ? "Transfer restaurant ownership?" : confirmation?.kind === "remove" ? "Remove team member?" : "Change member role?";
  const name = confirmation?.member.fullName ?? confirmation?.member.email ?? "this member";
  const confirmationMessage = confirmation?.kind === "transfer"
    ? `${name} will become Owner. You will become Manager and lose team administration and owner-only actions. This requires another Owner transfer to reverse.`
    : confirmation?.kind === "remove" ? `${name} will lose membership in this restaurant. Their Auth account and historical records remain. Any default-driver configuration for them will be cleared.`
      : `${name}: ${confirmation?.member.role.replaceAll("_", " ")} → ${confirmation?.role?.replaceAll("_", " ")}. Access changes immediately after server confirmation. Any incompatible default-driver configuration will be cleared. Historical records remain.`;
  if (forbidden) return <Page title="Team"><StateView kind="forbidden" message="Owner access is no longer available. Recheck your restaurant membership before another team action." /></Page>;
  if (ownershipResult) return <Page title="Team"><StateView kind={ownershipResult === "transferred" ? "loading" : "error"}
    title={ownershipResult === "transferred" ? "Ownership transferred" : "Ownership outcome unconfirmed"}
    message="Team administration is paused while your current membership is revalidated. No ownership operation will be repeated." />
    <FormStatus error={mutation.error} />
    <Action title="Recheck current membership" secondary disabled={mutation.busy} onPress={() => {
      if (state.status !== "ready") return;
      const { userId } = state;
      void mutation.run(async () => { await retryMembership(); assertWorkspaceAccess(userId, "OWNER"); }, () => {
        if (ownershipResult === "uncertain") { setOwnershipResult(null); setFeedback("Current Owner membership revalidated. Reload and review the team before any further ownership decision."); query.reload(); }
      });
    }} />
  </Page>;
  return <Page title="Team" subtitle="Invite people and manage restaurant roles" onRefresh={query.reload} refreshing={query.state.status === "loading"}>
    <Card title="Invite a team member">
      <Body>The invitation creates an Auth identity through the backend. Existing registered addresses need the verified-account support flow; profile email text cannot identify an account.</Body>
      <Body>Only Manager, Staff and Delivery Driver are supported here. Ownership transfer requires an existing restaurant member.</Body>
      <FormField label="Invitation email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" maxLength={320} editable={!mutation.busy} />
      <FormField label="Full name (optional)" value={fullName} onChangeText={setFullName} maxLength={150} editable={!mutation.busy} />
      <Choices<TeamRole> label="Restaurant role" values={TEAM_ROLES} value={role} onChange={setRole} disabled={mutation.busy} />
      <Action ref={invitationButton} title={mutation.busy ? "Working…" : "Send invitation"} accessibilityHint="Reviews the email and restaurant role before contacting the invitation provider." onPress={invite} disabled={mutation.busy || !!blockedInvitation} />
      {blockedInvitation?.state === "confirmed" ? <Status tone="warning">This address already has a confirmed provider/membership result in this session. Review the current team; delivery and activation are unverified. Another invitation is blocked.</Status> : null}
      {invited ? <Body>Invitation accepted by the provider and restaurant membership created. Email delivery and account acceptance status are unavailable from this API.</Body> : null}
      {recovery.list().filter(attempt => attempt.state !== "confirmed").map(attempt => <Card key={attempt.email} title="Invitation needs review">
        <Status tone="warning">{attempt.email}: {attempt.state === "conflict" ? "existing registration or membership conflict" : "unconfirmed provider outcome"}. A second invitation to this address is blocked. ထပ်မံဖိတ်ကြားခြင်းမပြုမီ အဖွဲ့ဝင်စာရင်းကို စစ်ဆေးပါ။</Status>
        <Action title={`Check current team for ${attempt.email}`} secondary disabled={mutation.busy} onPress={() => reconcileInvitation(attempt.email)} />
      </Card>)}
    </Card>
    <FormStatus error={formError ?? mutation.error} message={feedback} />
    <FormField label="Search current team" value={search} onChangeText={setSearch} placeholder="Name, email or role" />
    <QueryResult {...query}>{members => {
      const term = search.trim().toLowerCase();
      const visible = members.filter(member => `${member.fullName ?? ""} ${member.email ?? ""} ${member.role}`.toLowerCase().includes(term));
      return <>{visible.length ? visible.map(member => <Card key={member.id} title={member.fullName ?? member.email ?? "Team member"}>
        <Body>{member.email ?? "Email unavailable"} · {member.role.replaceAll("_", " ")}</Body>
        <Body>Joined: {exactTimestamp(member.createdAt)}</Body>
        {selected === member.id ? <>
          <Body>Auth user: {member.userId}</Body><Body>Membership: {member.id}</Body><Body>Account activation/disabled status: unavailable.</Body>
          {member.role !== "OWNER" ? <>
            <Choices<TeamRole> label="New restaurant role" values={TEAM_ROLES} value={nextRole} onChange={setNextRole} disabled={mutation.busy} />
            <Action title="Review role change" secondary disabled={mutation.busy || nextRole === member.role} onPress={() => setConfirmation({ kind: "role", member, role: nextRole })} />
            <Action title="Remove member" secondary danger disabled={mutation.busy} onPress={() => setConfirmation({ kind: "remove", member })} />
            <Action title="Transfer ownership to this member" secondary disabled={mutation.busy} onPress={() => setConfirmation({ kind: "transfer", member })} />
          </> : <Body>Owner membership is protected. Ownership changes use the dedicated transfer action on another member.</Body>}
          <Action title="Close member details" secondary disabled={mutation.busy} onPress={() => setSelected(null)} />
        </> : <Action ref={memberButton} title="Member details" secondary disabled={mutation.busy} onPress={() => { setSelected(member.id); setNextRole(isTeamRole(member.role) ? member.role : "STAFF"); }} />}
      </Card>) : <Card><Body>{members.length ? "No team members match this search." : "No restaurant members found."}</Body></Card>}</>;
    }}</QueryResult>
    <ConfirmDialog visible={pendingInvitation !== null} title="Send team invitation?" message={pendingInvitation ? `Email: ${pendingInvitation.email}\nName: ${pendingInvitation.fullName ?? "Not provided"}\nRole: ${pendingInvitation.role.replaceAll("_", " ")}\nConfirm the address and role. Provider acceptance can create an account and membership; it cannot verify email delivery or final activation.` : ""}
      confirmLabel="Confirm and send invitation" returnFocusRef={invitationButton} confirmDisabled={mutation.busy || !!blockedInvitation} onCancel={() => setPendingInvitation(null)} onConfirm={sendInvitation} />
    <ConfirmDialog visible={confirmation !== null} title={confirmationTitle} message={confirmationMessage} returnFocusRef={memberButton} danger={confirmation?.kind === "remove" || confirmation?.kind === "transfer"} confirmDisabled={mutation.busy} confirmLabel={confirmation?.kind === "transfer" ? "Transfer ownership" : confirmation?.kind === "remove" ? "Remove membership" : "Save role"} onCancel={() => setConfirmation(null)} onConfirm={confirmAction} />
  </Page>;
}
