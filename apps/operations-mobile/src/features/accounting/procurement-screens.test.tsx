import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PurchaseDetail } from "@restaurant-platform/shared-types";

const response = vi.hoisted(() => ({ status: "ready", data: null as unknown }));
vi.mock("react-native", () => ({ View: "div", Text: "span", Switch: "input", StyleSheet: { create: (styles: unknown) => styles } }));
vi.mock("../../api", () => ({ getOperationsApi: vi.fn() }));
vi.mock("../../hooks/useApiQuery", () => ({
  useApiQuery: () => ({ state: { status: response.status, data: response.data }, reload: vi.fn() })
}));
vi.mock("../../hooks/useApiMutation", () => ({
  useApiMutation: () => ({ busy: false, error: null, message: null, run: vi.fn() })
}));
vi.mock("./AccountingCsvAction", () => ({ AccountingCsvAction: () => null }));
vi.mock("../../components/ui", () => ({
  Card: ({ title, children }: { title?: string; children: React.ReactNode }) => <section><h2>{title}</h2>{children}</section>,
  Body: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  Action: ({ title, disabled, selected }: { title: string; disabled?: boolean; selected?: boolean }) =>
    <button disabled={disabled} aria-pressed={selected}>{title}</button>,
  FormField: ({ label }: { label: string }) => <label>{label}<input /></label>,
  ConfirmDialog: () => null,
  StateView: ({ kind, onRetry }: { kind: string; onRetry?: () => void }) => <aside>{kind}{onRetry ? <button>Try again</button> : null}</aside>
}));

import { FinancialRequestKeys } from "./financial-requests";
import { PurchaseDetailScreen } from "./PurchaseScreens";
import { Payables } from "./SupplierScreens";

describe("procurement screens", () => {
  beforeEach(() => {
    vi.stubGlobal("React", React);
    response.status = "ready";
    response.data = null;
  });

  it.each(["loading", "offline", "error", "denied"])("renders the %s state for payables", status => {
    response.status = status;
    const html = renderToStaticMarkup(<Payables />);
    expect(html).toContain(status);
    expect(html.includes("Try again")).toBe(status !== "loading");
    expect(html).not.toContain("Outstanding 0");
  });

  it("renders real payable balances, search and paging separately from the supplier register", () => {
    response.data = { content: [{ supplierId: "supplier-a", supplierName: "Local Produce", confirmedObligations: "9007199254740993",
      amountPaid: "1", outstandingAmount: "9007199254740992", earliestUnpaidDueDate: "2026-11-12" }], page: 0, size: 20, totalElements: 21 };
    const html = renderToStaticMarkup(<Payables />);
    expect(html).toContain("Local Produce");
    expect(html).toContain("9,007,199,254,740,992");
    expect(html).toContain("2026-11-12");
    expect(html).toContain("Search payables");
    expect(html).toContain("Largest outstanding");
    expect(html).toContain("Next page");
    expect(html).not.toContain("Add supplier");
  });

  it("shows an empty result without creating a zero balance row", () => {
    response.data = { content: [], page: 0, size: 20, totalElements: 0 };
    expect(renderToStaticMarkup(<Payables />)).toContain("No supplier balances match this search.");
  });

  it("keeps historical purchase costs, timestamp and cancellation visible on a focused detail screen", () => {
    const purchasedAt = "2026-11-02T09:30:00+06:30";
    response.data = {
      purchase: { id: "purchase-a", purchaseDate: "2026-11-02", purchasedAt, supplierId: null, supplierName: null, totalAmount: "200",
        amountPaid: "0", outstandingAmount: "0", paymentStatus: "UNPAID", status: "CANCELLED", dueDate: null,
        invoiceReference: "INV-A", receiptId: null, correctionOfId: null, createdBy: "member-a", createdAt: "2026-11-02T03:01:00Z" },
      lines: [{ id: "line-a", itemId: "item-a", itemName: "Historical rice", quantity: "2", unit: "kg", unitCost: "100", lineTotal: "200", supplierId: null }],
      payments: [], cancellations: [{ id: "cancel-a", reason: "Incorrect invoice", createdBy: "member-a", createdAt: "2026-11-03T03:01:00Z" }],
      corrections: []
    } satisfies PurchaseDetail;
    const html = renderToStaticMarkup(<PurchaseDetailScreen id="purchase-a" requests={new FinancialRequestKeys()}
      onBack={() => undefined} onChanged={() => undefined} onSelectPurchase={() => undefined} onReplace={() => undefined} />);
    expect(html).toContain("Purchase detail");
    expect(html).toContain(purchasedAt);
    expect(html).toContain("Historical rice");
    expect(html).toContain("Recorded unit cost 100");
    expect(html).toContain("Incorrect invoice");
    expect(html).toContain("Start linked replacement purchase");
    expect(html).not.toContain("Record a payment");
  });
});
