export async function signOutAndRedirect(
  signOut: () => Promise<{ error: unknown | null }>,
  redirect: (path: string) => void,
  next: string,
  onSignedOut?: () => void,
) {
  const result = await signOut();
  if (result.error) throw result.error;
  onSignedOut?.();
  const query = new URLSearchParams({ reason: "signed-out", next });
  redirect(`/login?${query.toString()}`);
}
