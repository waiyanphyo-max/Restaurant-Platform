import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const harness = vi.hoisted(() => ({
  states: [] as unknown[], refs: [] as { current: unknown }[], effects: [] as (readonly unknown[])[],
  stateIndex: 0, refIndex: 0, effectIndex: 0,
  auth: {
    state: { status: "signed_out" } as { status: string }, phoneEnabled: false, emailRecoveryEnabled: true,
    signUpWithPassword: vi.fn(), signInWithPassword: vi.fn(), requestPasswordReset: vi.fn(), resetPassword: vi.fn(), resendConfirmation: vi.fn(),
    verifyPhoneOtp: vi.fn(), requestPhoneOtp: vi.fn(), retry: vi.fn(), signOut: vi.fn()
  }
}));
vi.mock("react", async importOriginal => ({
  ...await importOriginal<typeof import("react")>(),
  useState(initial: unknown) {
    const index = harness.stateIndex++;
    if (!(index in harness.states)) harness.states[index] = initial;
    return [harness.states[index], (value: unknown) => { harness.states[index] = typeof value === "function" ? value(harness.states[index]) : value; }];
  },
  useRef(initial: unknown) { const index = harness.refIndex++; harness.refs[index] ??= { current: initial }; return harness.refs[index]; },
  useEffect(effect: () => void, dependencies: unknown[]) {
    const index = harness.effectIndex++; const previous = harness.effects[index];
    if (!previous || dependencies.some((value, item) => !Object.is(value, previous[item]))) { harness.effects[index] = dependencies; effect(); }
  }
}));
vi.mock("react-native", () => ({ ActivityIndicator: "ActivityIndicator", Text: "Text", View: "View", StyleSheet: { create: (value: unknown) => value } }));
vi.mock("../components/ui", () => ({ Action: "Action", FormField: "FormField", useUiTheme: () => ({ color: { foreground: "#123456", foregroundMuted: "#345678", surfaceMuted: "#eeeeee" } }) }));
vi.mock("../i18n", () => ({ localize: (language: string, english: string, burmese: string) => language === "my-MM" ? burmese : english }));
vi.mock("./AuthProvider", () => ({ useCustomerAuth: () => harness.auth }));
import { AuthPanel } from "./AuthPanel";

function render() { harness.stateIndex = 0; harness.refIndex = 0; harness.effectIndex = 0; return AuthPanel(); }
function elements(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  return isValidElement<Record<string, unknown>>(node) ? [node, ...elements(node.props.children as ReactNode)] : [];
}
function find(type: string, label: string) {
  const item = elements(render()).find(item => item.type === type && (item.props.title === label || item.props.label === label));
  if (!item) throw new Error(`${type} ${label} missing`);
  return item.props;
}
function enter(label: string, value: string) { (find("FormField", label).onChangeText as (value: string) => void)(value); }
function press(title: string) { (find("Action", title).onPress as () => void)(); }
function content(node: ReactNode): string {
  if (Array.isArray(node)) return node.map(content).join(" ");
  if (isValidElement<Record<string, unknown>>(node)) return content(node.props.children as ReactNode);
  return typeof node === "string" ? node : "";
}
async function settle() { await Promise.resolve(); await Promise.resolve(); render(); }
function signup() { press("Create an email account"); enter("Email address", " Customer@Example.Test "); enter("New password", "Long-password1"); enter("Confirm password", "Long-password1"); }
describe("customer authentication interface", () => {
  beforeEach(() => {
    harness.states = []; harness.refs = []; harness.effects = []; harness.auth.state = { status: "signed_out" }; harness.auth.emailRecoveryEnabled = true; harness.auth.phoneEnabled = false;
    for (const value of Object.values(harness.auth)) if (typeof value === "function") value.mockReset().mockResolvedValue(undefined);
    harness.auth.signUpWithPassword.mockResolvedValue({ authenticated: false }); vi.useFakeTimers();
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });
  it("validates email and matching passwords before contacting Auth", async () => {
    signup(); enter("Email address", "bad"); enter("Confirm password", "different"); press("Create account"); await settle();
    expect(find("FormField", "Email address").error).toContain("valid email");
    expect(find("FormField", "Confirm password").error).toBe("Passwords must match.");
    expect(harness.auth.signUpWithPassword).not.toHaveBeenCalled();
  });
  it("hides passwords by default and toggles visibility independently without changing their values", () => {
    signup(); expect(find("FormField", "New password").secureTextEntry).toBe(true);
    press("Show password"); expect(find("FormField", "New password").secureTextEntry).toBe(false);
    expect(find("FormField", "New password").value).toBe("Long-password1");
    expect(find("FormField", "Confirm password").secureTextEntry).toBe(true);
    press("Show confirm password"); expect(find("FormField", "Confirm password").secureTextEntry).toBe(false);
    press("Hide password"); expect(find("FormField", "New password").secureTextEntry).toBe(true);
    press("Already have an account? Sign in"); expect(find("FormField", "Password").value).toBe("");
    expect(find("FormField", "Password").secureTextEntry).toBe(true);
  });
  it("normalizes email, blocks rapid duplicate submits, and guides confirmation without an authenticated claim", async () => {
    let complete!: (result: { authenticated: boolean }) => void;
    harness.auth.signUpWithPassword.mockImplementation(() => new Promise(resolve => { complete = resolve; }));
    signup(); const action = find("Action", "Create account").onPress as () => void;
    action(); action(); expect(harness.auth.signUpWithPassword).toHaveBeenCalledExactlyOnceWith("customer@example.test", "Long-password1");
    expect(find("Action", "Please wait…").disabled).toBe(true);
    complete({ authenticated: false }); await settle();
    expect(content(render())).toContain("check your inbox to confirm"); expect(harness.auth.state.status).toBe("signed_out");
    expect(find("FormField", "Email address").value).toBe(" Customer@Example.Test ");
    expect(find("FormField", "Password").value).toBe("");
  });
  it("shows identical signup feedback for duplicate accounts and confirmation-required results", async () => {
    signup(); press("Create account"); await settle(); const first = content(render());
    press("Create an email account"); enter("New password", "Long-password1"); enter("Confirm password", "Long-password1");
    harness.auth.signUpWithPassword.mockRejectedValueOnce({ code: "user_already_exists" });
    press("Create account"); await settle(); expect(content(render())).toBe(first);
  });
  it("explains rate limits and exposes a disabled confirmation resend cooldown", async () => {
    harness.auth.signUpWithPassword.mockRejectedValueOnce({ code: "over_email_send_rate_limit", status: 429 });
    signup(); press("Create account"); await settle(); expect(content(render())).toContain("Wait at least one minute");
    expect(find("FormField", "Email address").value).toContain("Customer");
    press("Already have an account? Sign in"); expect(find("Action", "Resend confirmation email").disabled).toBe(true);
  });
  it("validates sign-in, clears failed passwords and lets the customer request confirmation again", async () => {
    enter("Email address", "customer@example.test"); enter("Password", "password");
    harness.auth.signInWithPassword.mockRejectedValueOnce({ code: "email_not_confirmed" }); press("Sign in"); await settle();
    expect(content(render())).toContain("Confirm your email"); expect(find("FormField", "Password").value).toBe("");
    press("Resend confirmation email"); await settle();
    expect(harness.auth.resendConfirmation).toHaveBeenCalledWith("customer@example.test");
    expect(content(render())).toContain("If this email needs confirmation");
  });
  it("lets a customer returning from an expired link resend confirmation without a password", async () => {
    enter("Email address", " Customer@Example.Test "); press("Resend confirmation email"); await settle();
    expect(harness.auth.resendConfirmation).toHaveBeenCalledExactlyOnceWith("customer@example.test");
    expect(harness.auth.signInWithPassword).not.toHaveBeenCalled();
    expect(content(render())).toContain("If this email needs confirmation");
  });
  it("requests and verifies reset codes, matching passwords and returns to sign-in", async () => {
    press("Forgot password?"); enter("Email address", " Customer@Example.Test "); press("Send reset email"); await settle();
    expect(harness.auth.requestPasswordReset).toHaveBeenCalledWith("customer@example.test");
    enter("Email verification code", "123456"); enter("New password", "New-password1"); enter("Confirm password", "New-password1"); press("Update password"); await settle();
    expect(harness.auth.resetPassword).toHaveBeenCalledWith("customer@example.test", "123456", "New-password1");
    expect(content(render())).toContain("Your password has been updated"); expect(find("FormField", "Password").value).toBe("");
    expect(harness.auth.state.status).toBe("signed_out");
  });
  it("normalizes unknown-account reset feedback to the same conditional success response", async () => {
    harness.auth.requestPasswordReset.mockRejectedValueOnce({ code: "user_not_found" });
    press("Forgot password?"); enter("Email address", "customer@example.test"); press("Send reset email"); await settle();
    expect(content(render())).toContain("If this email can receive a reset"); expect(find("FormField", "Email verification code")).toBeDefined();
  });
  it("does not send recovery emails until the operator enables the reviewed code flow", () => {
    harness.auth.emailRecoveryEnabled = false; press("Forgot password?");
    expect(find("Action", "Send reset email").disabled).toBe(true);
    expect(content(render())).toContain("not enabled for this build"); expect(harness.auth.requestPasswordReset).not.toHaveBeenCalled();
  });
  it("supports Burmese labels without needing a loaded customer profile", () => {
    press("မြန်မာဘာသာ"); expect(find("FormField", "အီးမေးလ်လိပ်စာ")).toBeDefined(); expect(find("Action", "English")).toBeDefined();
  });

  it("only exposes phone sign-in when the existing verified flow is enabled", async () => {
    expect(elements(render()).some(item => item.props.title === "Use verified phone sign in")).toBe(false);
    harness.auth.phoneEnabled = true; press("Use verified phone sign in");
    enter("International phone number", "+959123456789"); press("Send SMS code"); await settle();
    expect(harness.auth.requestPhoneOtp).toHaveBeenCalledExactlyOnceWith("+959123456789");
    enter("SMS verification code", "123456"); press("Verify and sign in"); await settle();
    expect(harness.auth.verifyPhoneOtp).toHaveBeenCalledExactlyOnceWith("+959123456789", "123456");
    expect(content(render())).toContain("does not link a phone");
  });

  it.each(["loading", "unconfigured", "error"])("does not expose sign-in fields while secure session state is %s", status => {
    harness.auth.state = { status };
    expect(elements(render()).some(item => item.type === "FormField")).toBe(false);
  });

  it("localizes a returned email-confirmation notice using the sign-in language", () => {
    const notice = { english: "Confirmed; sign in manually.", burmese: "အတည်ပြုပြီးပါပြီ။ အကောင့်ဝင်ပါ။" };
    harness.stateIndex = 0; harness.refIndex = 0; harness.effectIndex = 0;
    expect(content(AuthPanel({ confirmationNotice: notice }))).toContain(notice.english);
    press("မြန်မာဘာသာ"); harness.stateIndex = 0; harness.refIndex = 0; harness.effectIndex = 0;
    expect(content(AuthPanel({ confirmationNotice: notice }))).toContain(notice.burmese);
  });
});
