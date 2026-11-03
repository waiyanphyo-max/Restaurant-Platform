import { describe, expect, it, vi } from "vitest";
import { ApiConfigurationError, ApiProtocolError, createSalesAccountingApiClient } from "./index.js";
const restaurantId="11111111-1111-4111-8111-111111111111";
const orderId="22222222-2222-4222-8222-222222222222";
const paymentId="33333333-3333-4333-8333-333333333333";
const json=(data:unknown)=>new Response(JSON.stringify(data),{headers:{"Content-Type":"application/json"}});
const create=(fetchImpl:typeof fetch)=>createSalesAccountingApiClient({restaurantId,baseUrl:"https://api.example.test",getAccessToken:()=>"owner-token",fetchImpl});

describe("accounting sales transport",()=>{
  it("preserves exact whole currency strings and sends server-side historical filters",async()=>{
    const data={content:[{totalAmount:"9007199254740993"}],page:0,size:20,totalElements:1};
    const fetchImpl=vi.fn<typeof fetch>().mockImplementation(async()=>json(data));
    const result=await create(fetchImpl).getLedger({month:"2024-02",product:"Historical tea",order:"R-17",paymentStatus:"PARTIALLY_PAID",channel:"TABLE_QR",sort:"HIGHEST_TOTAL",page:3,size:20});
    expect(result.content[0].totalAmount).toBe("9007199254740993");
    const [url,init]=fetchImpl.mock.calls[0]; const parsed=new URL(String(url));
    expect(parsed.pathname).toBe(`/api/v1/restaurants/${restaurantId}/accounting/sales/ledger`);
    expect(Object.fromEntries(parsed.searchParams)).toEqual({month:"2024-02",product:"Historical tea",order:"R-17",paymentStatus:"PARTIALLY_PAID",channel:"TABLE_QR",sort:"HIGHEST_TOTAL",page:"3",size:"20"});
    expect(init?.credentials).toBe("omit"); expect((init?.headers as Headers).get("Authorization")).toBe("Bearer owner-token");
  });
  it("sends product search and sorting before pagination",async()=>{
    const fetchImpl=vi.fn<typeof fetch>().mockImplementation(async()=>json({content:[],page:1,size:20,totalElements:0}));
    await create(fetchImpl).getProducts({month:"2024-02",search:"Historical tea",sort:"NAME",page:1,size:20});
    const [url]=fetchImpl.mock.calls[0]; const parsed=new URL(String(url));
    expect(parsed.pathname).toBe(`/api/v1/restaurants/${restaurantId}/accounting/sales/products`);
    expect(Object.fromEntries(parsed.searchParams)).toEqual({month:"2024-02",search:"Historical tea",sort:"NAME",page:"1",size:"20"});
  });
  it("rejects malformed or ambiguous calendar periods before requesting",()=>{
    const fetchImpl=vi.fn<typeof fetch>(); const api=create(fetchImpl);
    for(const query of [{date:"2025-02-29"},{date:"2026-13-01"},{month:"2026-00"},{from:"2026-01-01"},{from:"2026-02-01",to:"2026-01-01"},{month:"2026-02",date:"2026-02-01"}]) {
      expect(()=>api.getLedger(query)).toThrow(ApiConfigurationError);
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it("downloads authenticated CSV with unchanged filters and excludes pagination",async()=>{
    const fetchImpl=vi.fn<typeof fetch>().mockImplementation(async()=>new Response('"order_id","total"\r\n"one","9007199254740993"\r\n',{headers:{"Content-Type":"text/csv;charset=utf-8"}}));
    const csv=await create(fetchImpl).exportCsv({date:"2026-11-01",channel:"STAFF",sort:"NEWEST",page:4,size:20});
    expect(csv).toContain('"9007199254740993"');
    const [url,init]=fetchImpl.mock.calls[0];expect(new URL(String(url)).search).toBe("?date=2026-11-01&channel=STAFF&sort=NEWEST");
    expect((init?.headers as Headers).get("Accept")).toBe("text/csv"); expect((init?.headers as Headers).get("Authorization")).toBe("Bearer owner-token");
  });
  it("rejects a non-CSV successful response during export",async()=>{
    const fetchImpl=vi.fn<typeof fetch>().mockImplementation(async()=>json({error:"Unexpected document"}));
    await expect(create(fetchImpl).exportCsv()).rejects.toBeInstanceOf(ApiProtocolError);
  });
  it("records a completed refund using one stable idempotency key and exact string amount",async()=>{
    const fetchImpl=vi.fn<typeof fetch>().mockImplementation(async()=>json({id:orderId}));
    const api=create(fetchImpl);const body={paymentId,amount:"9007199254740993",refundedAt:"2026-11-01T12:30:00+06:30",reason:"Returned item"};
    await api.refund(orderId,body,"refund-fixed-key");
    const [url,init]=fetchImpl.mock.calls[0];expect(String(url)).toContain(`/ledger/${orderId}/refunds`);
    expect(JSON.parse(String(init?.body))).toEqual(body);expect((init?.headers as Headers).get("Idempotency-Key")).toBe("refund-fixed-key");
    expect(()=>api.refund(orderId,{...body,amount:"1.5"},"new-key")).toThrow(ApiConfigurationError);
  });
  it("posts a controlled refund reversal with a reason and retry key",async()=>{
    const fetchImpl=vi.fn<typeof fetch>().mockImplementation(async()=>json({id:orderId,amount:"100"}));
    await create(fetchImpl).reverseRefund(orderId,paymentId,"Wrong recorded refund","fixed-reversal-key");
    const [url,init]=fetchImpl.mock.calls[0];
    expect(String(url)).toContain(`/ledger/${orderId}/refunds/${paymentId}/reverse`);
    expect(JSON.parse(String(init?.body))).toEqual({reason:"Wrong recorded refund"});
    expect((init?.headers as Headers).get("Idempotency-Key")).toBe("fixed-reversal-key");
  });
});
