import { describe, expect, it } from "vitest";
import type { SalesLedgerOrder } from "@restaurant-platform/shared-types";
import { remainingRefundAmount, validRefundReview } from "./sales-refund-review";
import { salesExportScope } from "./export-scope";

const payment = { id:"payment",amount:"9007199254740993",status:"PAID",paidAt:"2024-02-29T09:00:00+06:30" };
const sale = {payments:[payment],refunds:[{id:"refund",paymentId:"payment",amount:"2"}],refundReversals:[]} as unknown as SalesLedgerOrder;
const body = {paymentId:"payment",amount:"9007199254740991",refundedAt:"2024-02-29T10:00:00+06:30",reason:"Actual completed return"};
describe("exact refund review",()=>{
  it("caps exact large amounts after active refunds and restores capacity only for recorded reversals",()=>{
    expect(remainingRefundAmount(sale,"payment")).toBe("9007199254740991");
    expect(validRefundReview(sale,body,Date.parse("2024-03-01T00:00:00Z"))).toBe(true);
    expect(validRefundReview(sale,{...body,amount:"9007199254740992"})).toBe(false);
    const corrected={...sale,refundReversals:[{refundId:"refund"}]} as SalesLedgerOrder;
    expect(remainingRefundAmount(corrected,"payment")).toBe("9007199254740993");
    expect(sale.refunds[0].amount).toBe("2");
  });
  it.each(["2024-02-30T10:00:00+06:30","2023-02-29T10:00:00+06:30","2024-02-29T24:00:00+06:30","2024-02-29T10:60:00+06:30","2024-02-29T10:00:00+18:01","2024-02-29T10:00:00","2024-02-29T08:59:59+06:30"])("rejects an invalid calendar, missing offset or pre-collection timestamp %s",refundedAt=>{
    expect(validRefundReview(sale,{...body,refundedAt})).toBe(false);
  });
  it("keeps future timestamps, fractional/overflow amounts and legacy unknown collection time out of review",()=>{
    expect(validRefundReview(sale,body,Date.parse("2024-02-29T09:30:00+06:30"))).toBe(false);
    expect(validRefundReview(sale,{...body,amount:"1.5"})).toBe(false);
    expect(validRefundReview(sale,{...body,amount:"9223372036854775808"})).toBe(false);
    expect(remainingRefundAmount({...sale,payments:[{...payment,paidAt:null}]} as SalesLedgerOrder,"payment")).toBeNull();
  });
});
describe("server-supported private export description",()=>{
  it("shows applied dates and filters without claiming physical row or schema metadata",()=>{
    const scope=salesExportScope({from:"2024-02-01",to:"2024-02-29",channel:"CUSTOMER_APP",paymentStatus:"UNPAID",order:"A-1042",product:"Historical noodles",sort:"HIGHEST_TOTAL",page:3,size:20});
    for (const value of ["2024-02-01 through 2024-02-29","CUSTOMER APP","UNPAID","A-1042","Historical noodles","HIGHEST TOTAL","Complete matching history across pages"]) expect(scope).toContain(value);
    expect(scope).not.toContain("20 rows");expect(scope).not.toContain("columns");
    expect(salesExportScope({})).toContain("Current restaurant-local day");
  });
});
