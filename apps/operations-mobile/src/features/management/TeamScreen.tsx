import { useState } from "react";
import type { RestaurantMemberResponse } from "@restaurant-platform/shared-types";
import { getOperationsApi } from "../../api";
import { useOperationsAuth } from "../../auth/AuthProvider";
import { QueryResult } from "../../components/QueryResult";
import { Action, Body, Card, ConfirmDialog, FormField, Page } from "../../components/ui";
import { useApiMutation } from "../../hooks/useApiMutation";
import { useApiQuery } from "../../hooks/useApiQuery";
import { exactTimestamp } from "../operations/format";
import { Choices, FormStatus } from "./controls";
import { invitationEmail, isTeamRole, optionalText, TEAM_ROLES, type TeamRole } from "./validation";

type MemberAction = { kind: "remove" | "transfer" | "role"; member: RestaurantMemberResponse; role?: TeamRole };

export function TeamScreen() {
  const query = useApiQuery(signal => getOperationsApi().listMembers({ signal }), "managed-team");
  const { state, retryMembership } = useOperationsAuth();
  const [search, setSearch] = useState("");
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<TeamRole>("STAFF");
  const [formError, setFormError] = useState<string | null>(null);
  const [invited, setInvited] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [nextRole, setNextRole] = useState<TeamRole>("STAFF");
  const [confirmation, setConfirmation] = useState<MemberAction | null>(null);
  const mutation = useApiMutation();
  const owner = state.status === "ready" && state.membership.role === "OWNER";
  if (!owner) return <Page title="Team"><Body>Only the restaurant Owner can manage team membership.</Body></Page>;
  function invite() {
    setFormError(null); setInvited(false);
    try {
      const body = { email: invitationEmail(email), fullName: optionalText(fullName, 150, "Full name"), role };
      void mutation.run(() => getOperationsApi().inviteMember(body), () => { setEmail(""); setFullName(""); setInvited(true); query.reload(); });
    } catch (error) { setFormError(error instanceof Error ? error.message : "Check the invitation fields."); }
  }
  function confirmAction() {
    const action = confirmation; setConfirmation(null);
    if (!action) return;
    if (action.kind === "transfer") {
      void mutation.run(() => getOperationsApi().transferOwnership({ newOwnerUserId: action.member.userId }), () => { setSelected(null); void retryMembership(); });
    } else if (action.kind === "remove") {
      void mutation.run(() => getOperationsApi().removeMember(action.member.id), () => { setSelected(null); query.reload(); });
    } else if (action.role) {
      const newRole = action.role;
      void mutation.run(() => getOperationsApi().updateMember(action.member.id, { userId: action.member.userId, role: newRole }), () => { setSelected(null); query.reload(); });
    }
  }
  const confirmationTitle = confirmation?.kind === "transfer" ? "Transfer restaurant ownership?" : confirmation?.kind === "remove" ? "Remove team member?" : "Change member role?";
  const name = confirmation?.member.fullName ?? confirmation?.member.email ?? "this member";
  const confirmationMessage = confirmation?.kind === "transfer"
    ? `${name} will become Owner. You will become Manager and lose team administration and owner-only actions. This requires another Owner transfer to reverse.`
    : confirmation?.kind === "remove" ? `${name} will lose membership in this restaurant. Their Auth account and historical records remain. Any default-driver configuration for them will be cleared.`
      : `${name} will become ${confirmation?.role?.replaceAll("_", " ")}. Any incompatible default-driver configuration will be cleared.`;
  return <Page title="Team" subtitle="Invite people and manage restaurant roles" onRefresh={query.reload} refreshing={query.state.status === "loading"}>
    <Card title="Invite a team member">
      <Body>The invitation creates an Auth identity through the backend. Existing registered addresses need the verified-account support flow; profile email text cannot identify an account.</Body>
      <FormField label="Invitation email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" maxLength={320} editable={!mutation.busy} />
      <FormField label="Full name (optional)" value={fullName} onChangeText={setFullName} maxLength={150} editable={!mutation.busy} />
      <Choices<TeamRole> label="Restaurant role" values={TEAM_ROLES} value={role} onChange={setRole} disabled={mutation.busy} />
      <Action title={mutation.busy ? "Working…" : "Send invitation"} onPress={invite} disabled={mutation.busy} />
      {invited ? <Body>Invitation accepted by the provider and restaurant membership created. Email delivery and account acceptance status are unavailable from this API.</Body> : null}
    </Card>
    <FormStatus error={formError ?? mutation.error} message={mutation.message} />
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
            <Action title="Remove member" secondary disabled={mutation.busy} onPress={() => setConfirmation({ kind: "remove", member })} />
            <Action title="Transfer ownership to this member" secondary disabled={mutation.busy} onPress={() => setConfirmation({ kind: "transfer", member })} />
          </> : <Body>Owner membership is protected. Ownership changes use the dedicated transfer action on another member.</Body>}
          <Action title="Close member details" secondary disabled={mutation.busy} onPress={() => setSelected(null)} />
        </> : <Action title="Member details" secondary disabled={mutation.busy} onPress={() => { setSelected(member.id); setNextRole(isTeamRole(member.role) ? member.role : "STAFF"); }} />}
      </Card>) : <Card><Body>{members.length ? "No team members match this search." : "No restaurant members found."}</Body></Card>}</>;
    }}</QueryResult>
    <ConfirmDialog visible={confirmation !== null} title={confirmationTitle} message={confirmationMessage} confirmLabel={confirmation?.kind === "transfer" ? "Transfer ownership" : confirmation?.kind === "remove" ? "Remove membership" : "Save role"} onCancel={() => setConfirmation(null)} onConfirm={confirmAction} />
  </Page>;
}
