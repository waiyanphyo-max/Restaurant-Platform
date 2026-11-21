import { isValidElement, type ReactElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { MyRestaurantResponse } from "@restaurant-platform/shared-types";

const scenario = vi.hoisted(() => ({ myanmar: false }));
vi.mock("../components/ui", () => ({ Action: "Action", Body: "Body", Card: "Card", Page: "Page" }));
vi.mock("./OperationsLanguage", () => ({ useOperationsText: () => (en: string, my: string) => scenario.myanmar ? my : en }));
import { WorkspaceTools } from "./WorkspaceTools";
import { getNavigationItems, type OperationsRole } from "./policy";

function elements(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  return [node, ...elements(node.props.children as ReactNode)];
}
const restaurantId = "11111111-1111-4111-8111-111111111111";
function tools(role: OperationsRole) {
  const membership: MyRestaurantResponse = { restaurantId, active: true, role, name: "Synthetic restaurant", slug: "synthetic" };
  const items = getNavigationItems(membership, restaurantId);
  const navigate = vi.fn();
  const close = vi.fn();
  return { items, navigate, close, tree: WorkspaceTools({ items, role, navigate, close }) };
}

describe("UXI-10 workspace tools", () => {
  it.each(["OWNER", "MANAGER", "STAFF"] as const)("offers working %s actions for every permitted route", role => {
    scenario.myanmar = false;
    const { tree, navigate, items, close } = tools(role);
    const actions = elements(tree).filter(element => element.type === "Action");
    for (const action of actions) (action.props.onPress as () => void)();
    expect(navigate.mock.calls.map(call => call[0])).toEqual(expect.arrayContaining(items.map(item => item.path)));
    expect(navigate).toHaveBeenCalledTimes(items.length);
    expect(close).toHaveBeenCalledTimes(1);
    if (role === "STAFF") expect(elements(tree).some(element => element.props.title === "Finance")).toBe(false);
    if (role === "MANAGER") expect(navigate.mock.calls.flat()).not.toContain("/team");
  });

  it("presents Myanmar navigation labels while preserving the authorized routes", () => {
    scenario.myanmar = true;
    const { tree, navigate } = tools("STAFF");
    const actions = elements(tree).filter(element => element.type === "Action");
    const queue = actions.find(element => element.props.title === "လာယူရန် စောင့်ဆိုင်းစာရင်း")!;
    expect(queue).toBeDefined();
    (queue.props.onPress as () => void)();
    expect(navigate).toHaveBeenCalledWith("/queue");
    expect(elements(tree).some(element => element.props.title === "ဘဏ္ဍာရေး")).toBe(false);
    scenario.myanmar = false;
  });
});
