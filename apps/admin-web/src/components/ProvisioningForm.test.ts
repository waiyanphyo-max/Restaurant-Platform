import { describe, expect, it, vi } from "vitest";
vi.mock("@/app/(admin)/actions", () => ({ provisionRestaurant: vi.fn() }));
import { validateProvisioningDraft, type ProvisioningDraft } from "./ProvisioningForm";

const valid: ProvisioningDraft = { name: "Test restaurant", slug: "test-restaurant", city: "Yangon", township: "Bahan", ownerEmail: "owner@example.test", ownerFullName: "" };

describe("restaurant provisioning validation", () => {
  it("accepts required restaurant details and an optional owner name", () => {
    expect(validateProvisioningDraft(valid)).toEqual({});
  });

  it("rejects whitespace-only required details and malformed slugs", () => {
    const errors = validateProvisioningDraft({ ...valid, name: "  ", slug: "Restaurant--Name", township: " " });
    expect(errors).toHaveProperty("name");
    expect(errors).toHaveProperty("slug");
    expect(errors).toHaveProperty("township");
  });

  it("rejects an invalid owner email and values above the backend field limits", () => {
    const errors = validateProvisioningDraft({ ...valid, name: "x".repeat(151), ownerFullName: "x".repeat(151), city: "x".repeat(101), ownerEmail: "invalid" });
    expect(errors).toHaveProperty("name");
    expect(errors).toHaveProperty("ownerFullName");
    expect(errors).toHaveProperty("city");
    expect(errors).toHaveProperty("ownerEmail");
  });

  it("checks timezone, currency, Auth UUID and initial branding", () => {
    expect(validateProvisioningDraft({ ...valid, timezone: "Mars/City", currency: "MMKK", ownerUserId: "owner@example.test", primaryColor: "red", logoUrl: "javascript:alert(1)" })).toMatchObject({ timezone: expect.any(String), currency: expect.any(String), ownerUserId: expect.any(String), primaryColor: expect.any(String), logoUrl: expect.any(String) });
    expect(validateProvisioningDraft({ ...valid, timezone: "Asia/Yangon", currency: "MMK", primaryColor: "#234D3C", ownerUserId: "00000000-0000-4000-8000-000000000001" })).toEqual({});
  });
});
