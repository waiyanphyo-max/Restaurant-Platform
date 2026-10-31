import { describe, expect, it } from "vitest";
import { validateProvisioningDraft, type ProvisioningDraft } from "./ProvisioningForm";

const valid: ProvisioningDraft = { name: "Test restaurant", slug: "test-restaurant", city: "Yangon", township: "Bahan", ownerEmail: "owner@example.test", ownerFullName: "" };

describe("restaurant information preview validation", () => {
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
});
