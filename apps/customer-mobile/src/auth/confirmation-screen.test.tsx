import { isValidElement, type ReactElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({
  states: [] as unknown[], refs: [] as { current: unknown }[], stateIndex: 0, refIndex: 0,
  previousAttempt: undefined as string | undefined, cleanup: undefined as (() => void) | undefined,
  attempt: "1", confirm: vi.fn(), take: vi.fn(), replace: vi.fn(),
}));
vi.mock("react", async original => ({
  ...await original<typeof import("react")>(),
  useState(initial: unknown) {
    const index = h.stateIndex++; if (!(index in h.states)) h.states[index] = initial;
    return [h.states[index], (value: unknown) => { h.states[index] = value; }];
  },
  useRef(initial: unknown) { const index = h.refIndex++; h.refs[index] ??= { current: initial }; return h.refs[index]; },
  useEffect(effect: () => (() => void), dependencies: [string]) {
    if (h.previousAttempt !== dependencies[0]) { h.cleanup?.(); h.previousAttempt = dependencies[0]; h.cleanup = effect(); }
  },
}));
vi.mock("expo-router", () => ({ router: { replace: h.replace }, useLocalSearchParams: () => ({ attempt: h.attempt }) }));
vi.mock("react-native", () => ({ Text: "Text" }));
vi.mock("react-native-safe-area-context", () => ({ SafeAreaView: "SafeAreaView" }));
vi.mock("../components/ui", () => ({ Action: "Action", Page: "Page", StateView: "StateView" }));
vi.mock("./native", () => ({ confirmCustomerEmail: h.confirm }));
vi.mock("./confirmation-link", () => ({ takeCustomerConfirmationInput: h.take }));
vi.mock("../../app/index", () => ({ default: "SignIn" }));
import CustomerEmailConfirmation from "../../app/email-confirmation";

function render() { h.stateIndex = 0; h.refIndex = 0; return CustomerEmailConfirmation(); }
function items(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(items);
  return isValidElement<Record<string, unknown>>(node) ? [node, ...items(node.props.children as ReactNode)] : [];
}
async function settle() { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); }
beforeEach(() => {
  h.cleanup?.(); h.cleanup = undefined; h.previousAttempt = undefined; h.states = []; h.refs = []; h.attempt = "1";
  vi.resetAllMocks(); h.take.mockReturnValue({ kind: "provider-return" }); h.confirm.mockResolvedValue("returned");
});

describe("customer confirmation sign-in screen", () => {
  it("opens the password sign-in experience after a provider return without calling sign-in itself", async () => {
    render(); await settle(); const tree = render();
    expect(tree.type).toBe("SignIn"); expect(tree.props.confirmationMessage).toContain("Sign in with your email and password");
    expect(h.confirm).toHaveBeenCalledExactlyOnceWith({ kind: "provider-return" }); expect(h.take).toHaveBeenCalledOnce();
  });
  it("shows an expired-link error and a manual return action", async () => {
    h.confirm.mockResolvedValue("invalid"); render(); await settle();
    const action = items(render()).find(item => item.props.title === "Return to sign in");
    expect(action).toBeDefined(); (action?.props.onPress as () => void)(); expect(h.replace).toHaveBeenCalledWith("/");
  });
  it("processes a second email in a warm app and ignores the previous attempt's late result", async () => {
    let previous!: (result: string) => void;
    h.confirm.mockImplementationOnce(() => new Promise(resolve => { previous = resolve; }));
    render(); h.attempt = "2"; h.take.mockReturnValue({ kind: "token-hash", tokenHash: "synthetic-second-link" }); h.confirm.mockResolvedValueOnce("confirmed");
    render(); await settle(); previous("invalid"); await settle();
    expect(render().type).toBe("SignIn"); expect(render().props.confirmationMessage).toContain("Your email is confirmed");
    expect(h.confirm).toHaveBeenCalledTimes(2); expect(h.take).toHaveBeenCalledTimes(2);
  });
  it("localizes confirmation checking and expired-link recovery without submitting a second attempt", async () => {
    h.confirm.mockResolvedValue("invalid"); render(); await settle();
    const language = items(render()).find(item => item.props.title === "မြန်မာဘာသာ")!;
    (language.props.onPress as () => void)();
    const tree = render();
    expect(items(tree).find(item => item.type === "Page")!.props.title).toBe("အီးမေးလ် အတည်ပြုခြင်း");
    expect(items(tree).find(item => item.type === "StateView")!.props.kind).toBe("error");
    expect(items(tree).some(item => item.props.title === "အကောင့်ဝင်ရန် ပြန်သွားပါ")).toBe(true);
    expect(h.confirm).toHaveBeenCalledOnce();
  });
});
