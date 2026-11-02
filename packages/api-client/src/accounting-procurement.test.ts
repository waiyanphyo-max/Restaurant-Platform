import { describe, expect, it, vi } from "vitest";
import { createProcurementApiClient } from "./accounting-procurement.js";
const restaurantId="11111111-1111-4111-8111-111111111111";
const itemId="22222222-2222-4222-8222-222222222222";
const client=(fetchImpl:typeof fetch)=>createProcurementApiClient({baseUrl:"https://api.example.test",restaurantId,getAccessToken:()=>"owner-token",fetchImpl});

describe("procurement contracts",()=>{
  it("saves plans independently from actual purchases and preserves exact strings",async()=>{
    const fetchImpl=vi.fn<typeof fetch>().mockImplementation(async()=>new Response("{}",{headers:{"Content-Type":"application/json"}}));
    const api=client(fetchImpl),lines=[{itemId,quantity:"0.3",unit:"kg",unitCost:"9007199254740993"}];
    await api.createShoppingSheet({shoppingDate:"2026-11-02",lines},"plan-1");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(new URL(String(fetchImpl.mock.calls[0][0])).pathname).toBe(`/api/v1/restaurants/${restaurantId}/accounting/shopping/sheets`);
    await api.confirmPurchase({purchaseDate:"2026-11-02",purchasedAt:"2026-11-02T09:30:00+06:30",lines},"purchase-1");
    const [,request]=fetchImpl.mock.calls[1];
    expect(new URL(String(fetchImpl.mock.calls[1][0])).pathname).toBe(`/api/v1/restaurants/${restaurantId}/accounting/purchases`);
    expect(JSON.parse(String(request?.body)).lines[0]).toEqual(lines[0]);
    expect((request?.headers as Headers).get("Authorization")).toBe("Bearer owner-token");
    expect((request?.headers as Headers).get("Idempotency-Key")).toBe("purchase-1");
    expect(request?.credentials).toBe("omit");
  });
  it("retries with the same mutation body/key and reads CSV as text",async()=>{
    const fetchImpl=vi.fn<typeof fetch>().mockRejectedValueOnce(new TypeError("network"))
      .mockResolvedValueOnce(new Response("{}",{headers:{"Content-Type":"application/json"}}))
      .mockResolvedValueOnce(new Response("purchase_id,line_total\r\nabc,9007199254740993\r\n",{headers:{"Content-Type":"text/csv"}}));
    await client(fetchImpl).recordPurchasePayment(itemId,{amount:"9007199254740993",method:"CASH",paidAt:"2026-11-02T00:00:00Z"},"payment-retry");
    expect(fetchImpl.mock.calls[0][1]?.body).toBe(fetchImpl.mock.calls[1][1]?.body);
    expect((fetchImpl.mock.calls[1][1]?.headers as Headers).get("Idempotency-Key")).toBe("payment-retry");
    await expect(client(fetchImpl).getPurchaseCsv({from:"2026-11-01",to:"2026-11-30"})).resolves.toContain("9007199254740993");
  });
  it("preserves finance permission denials without retries",async()=>{
    const fetchImpl=vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({code:"INSUFFICIENT_RESTAURANT_PERMISSION"}),{status:403,headers:{"Content-Type":"application/json"}}));
    await expect(client(fetchImpl).listPurchases()).rejects.toMatchObject({status:403});
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
