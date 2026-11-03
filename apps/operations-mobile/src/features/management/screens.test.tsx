import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const scenario = vi.hoisted(() => ({ role: "OWNER", guestBaseUrl: "https://guest.example.com" as string | null, status: "ready", records: [] as unknown[] }));
vi.mock("react-native", () => ({
  Image: "img", AppState: { addEventListener: () => ({ remove() {} }) }, Share: { share: vi.fn() },
  useWindowDimensions: () => ({ width: 360 }), View: "div", Text: "span", Switch: "input", StyleSheet: { create: (styles: unknown) => styles }
}));
vi.mock("expo-router", () => ({ useFocusEffect: vi.fn() }));
vi.mock("react-native-qrcode-svg", () => ({ default: () => null }));
vi.mock("expo-file-system/legacy", () => ({ cacheDirectory: "file:///cache/", EncodingType: { Base64: "base64" } }));
vi.mock("expo-sharing", () => ({}));
vi.mock("../../api", () => ({ getOperationsApi: vi.fn() }));
vi.mock("../../tenant", () => ({ readEmbeddedTenant: () => ({ restaurantId: "11111111-1111-4111-8111-111111111111", guestBaseUrl: scenario.guestBaseUrl }) }));
vi.mock("../../auth/AuthProvider", () => ({ useOperationsAuth: () => ({ state: { status: "ready", membership: { role: scenario.role } }, retryMembership: vi.fn() }) }));
vi.mock("../../hooks/useApiMutation", () => ({ useApiMutation: () => ({ busy: false, error: null, message: null, run: vi.fn(), reset: vi.fn() }) }));
vi.mock("../../hooks/useApiQuery", () => ({ useApiQuery: () => ({ state: scenario.status === "ready" ? { status: "ready", data: scenario.records } : { status: scenario.status }, reload: vi.fn() }) }));
vi.mock("../../components/ui", () => ({
  Page: ({ title, children }: { title: string; children: React.ReactNode }) => <main><h1>{title}</h1>{children}</main>,
  Card: ({ title, children }: { title?: string; children: React.ReactNode }) => <article><h2>{title}</h2>{children}</article>,
  Body: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  Action: ({ title, disabled }: { title: string; disabled?: boolean }) => <button disabled={disabled}>{title}</button>,
  FormField: ({ label }: { label: string }) => <label>{label}<input /></label>,
  ConfirmDialog: ({ visible, message }: { visible: boolean; message: string }) => visible ? <aside>{message}</aside> : null,
  StateView: ({ kind, onRetry }: { kind: string; onRetry?: () => void }) => <aside>{kind}{onRetry ? <button>Try again</button> : null}</aside>
}));

import { TeamScreen } from "./TeamScreen";
import { TablesScreen } from "./TablesScreen";

describe("owner team and table states", () => {
  beforeEach(() => {
    vi.stubGlobal("React", React);
    scenario.role = "OWNER"; scenario.guestBaseUrl = "https://guest.example.com"; scenario.status = "ready"; scenario.records = [];
  });
  it("renders owner invitations for all supported non-owner roles with honest activation status", () => {
    const html = renderToStaticMarkup(<TeamScreen />);
    expect(html).toContain("Send invitation");
    expect(html).toContain("MANAGER"); expect(html).toContain("STAFF"); expect(html).toContain("DELIVERY DRIVER");
    expect(html).not.toContain("PLATFORM ADMIN");
    expect(html).toContain("No restaurant members found");
  });
  it.each(["MANAGER", "STAFF", "DELIVERY_DRIVER"])("withholds owner team actions from %s", role => {
    scenario.role = role;
    const html = renderToStaticMarkup(<TeamScreen />);
    expect(html).toContain("Only the restaurant Owner");
    expect(html).not.toContain("Send invitation");
  });
  it.each(["loading", "offline", "error", "denied"])("renders %s and retry states around live records", status => {
    scenario.status = status;
    const html = renderToStaticMarkup(<TablesScreen />);
    expect(html).toContain(status);
    if (status !== "loading") expect(html).toContain("Try again");
  });
  it("disables one-time QR creation when no reviewed guest origin exists", () => {
    scenario.guestBaseUrl = null;
    const html = renderToStaticMarkup(<TablesScreen />);
    expect(html).toContain("no approved guest website origin");
    expect(html).toContain('<button disabled="">Rotate Common QR');
    expect(html).toContain('<button disabled="">Create table and QR');
    expect(html).not.toContain("#qrToken=");
  });
  it("renders an existing table without leaking a reusable QR credential", () => {
    scenario.records = [{ id: "table-id", tableNumber: "T7", active: true, qrToken: "not-in-list-contract" }];
    const html = renderToStaticMarkup(<TablesScreen />);
    expect(html).toContain("Table T7"); expect(html).toContain("Rotate table QR");
    expect(html).toContain("Deactivate table"); expect(html).not.toContain("not-in-list-contract");
  });
});
