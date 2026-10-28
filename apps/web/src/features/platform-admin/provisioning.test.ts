import { describe, expect, it } from "vitest";
import { emptyProvisionForm, slugify, toProvisionRequest, validateProvisionForm } from "./provisioning";

describe("platform restaurant provisioning form", () => {
  it("creates a slug from a restaurant name", () => {
    expect(slugify("Green Garden Kitchen")).toBe("green-garden-kitchen");
  });

  it("reports invalid owner email and required restaurant fields", () => {
    const errors = validateProvisionForm({ ...emptyProvisionForm, ownerEmail: "bad", slug: "Has Spaces" });
    expect(errors.ownerEmail).toBeTruthy();
    expect(errors.name).toBeTruthy();
    expect(errors.slug).toBeTruthy();
    expect(errors.city).toBeTruthy();
    expect(errors.township).toBeTruthy();
  });

  it("maps optional blank fields to null and trims submitted values", () => {
    const payload = toProvisionRequest({
      ...emptyProvisionForm,
      ownerEmail: " owner@example.com ",
      ownerFullName: " ",
      name: " Garden ",
      slug: "garden",
      city: " Yangon ",
      township: " Bahan ",
    });
    expect(payload).toEqual({
      ownerEmail: "owner@example.com",
      ownerFullName: null,
      restaurant: expect.objectContaining({
        name: "Garden", slug: "garden", city: "Yangon", township: "Bahan",
        description: null, phone: null, address: null, currency: "MMK",
      }),
    });
  });
});
