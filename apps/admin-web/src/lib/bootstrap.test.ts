import { describe, expect, it } from "vitest";
import type { PlatformBootstrapSnapshot } from "@restaurant-platform/shared-types";
import { buildBootstrapStep, readInitialPalette, setupChecklist } from "./bootstrap";

export const restaurantId = "11111111-1111-4111-8111-111111111111";
export const productId = "22222222-2222-4222-8222-222222222222";
export const categoryId = "33333333-3333-4333-8333-333333333333";
export function setupFixture(): PlatformBootstrapSnapshot {
  return { restaurantId, currency: "MMK", settings: { restaurantId, defaultDeliveryDriverUserId: null, currency: "MMK", timezone: "Asia/Yangon", minimumOrder: 0, defaultDeliveryFee: 0, acceptsOrders: false, allowQrOrder: true, allowDelivery: false, allowTakeaway: true },
    steps: [], categories: [{ id: categoryId, name: "Approved dishes", active: true, displayOrder: 0 }],
    products: [{ id: productId, categoryId, name: "Mala fixture", description: null, price: 5000, imageUrl: null, trackStock: false, stockQuantity: null, available: true, createdAt: "2026-11-19T00:00:00Z", updatedAt: "2026-11-19T00:00:00Z" }],
    variants: [], modifierGroups: [], productModifierGroups: [], catalogComplete: false, mediaManifest: [], branding: { restaurantId, displayName: "Restaurant A", logoUrl: null, palette: null, revision: 0 },
    owners: [{ userId: "44444444-4444-4444-8444-444444444444", email: "owner-a@example.test", fullName: "Owner A", invitationStatus: "ACCEPTED", onboardingStatus: "UNKNOWN", onboardingCompletedAt: null }],
    ownerOnboardingConfirmed: false, photosStatus: "PENDING", nativeBuildStatus: "PENDING", handoffReady: false, handedOff: false, blockers: ["OWNER_ONBOARDING_PENDING", "ORDERING_SETTINGS_REVIEW_PENDING"] };
}
export function values(data: Record<string, string>): FormData { const form = new FormData(); for (const [key, value] of Object.entries(data)) form.set(key, value); return form; }

describe("reviewed bootstrap drafts", () => {
  it("uses this restaurant's currency and trusted category IDs without image URLs", () => {
    expect(buildBootstrapStep("PRODUCT", values({ operationKey: "product-1", name: "Dish", categoryId, price: "7000", available: "on" }), setupFixture())).toEqual({ operationKey: "product-1", kind: "PRODUCT", currency: "MMK", product: { name: "Dish", categoryId, description: null, price: 7000, available: true, trackStock: false, stockQuantity: null } });
    expect(() => buildBootstrapStep("PRODUCT", values({ operationKey: "product-1", name: "Dish", categoryId: restaurantId, price: "7000" }), setupFixture())).toThrow("Select an existing record");
  });
  it.each(["1.5", "-1", "1e3", "9007199254740992", "NaN", ""])("rejects non-exact monetary input %s", price => {
    expect(() => buildBootstrapStep("PRODUCT", values({ operationKey: "p", name: "Dish", categoryId, price }), setupFixture())).toThrow("whole number");
  });
  it("preserves required modifier minimum and maximum contracts", () => {
    expect(buildBootstrapStep("MODIFIER_GROUP", values({ operationKey: "spice", name: "Spice", required: "on", active: "on", minSelections: "1", maxSelections: "1" }), setupFixture())).toMatchObject({ modifierGroup: { required: true, minSelections: 1, maxSelections: 1 } });
    expect(() => buildBootstrapStep("MODIFIER_GROUP", values({ operationKey: "spice", name: "Spice", required: "on", minSelections: "0", maxSelections: "1" }), setupFixture())).toThrow("minimum");
  });
  it("reviews ordering flags without changing provisioned timezone/currency", () => {
    expect(buildBootstrapStep("ORDERING_SETTINGS", values({ operationKey: "ordering", minimumOrder: "1000", defaultDeliveryFee: "200", allowTakeaway: "on" }), setupFixture())).toMatchObject({ settings: { currency: "MMK", timezone: "Asia/Yangon", minimumOrder: 1000, defaultDeliveryFee: 200, acceptsOrders: false, allowQrOrder: false, allowDelivery: false, allowTakeaway: true } });
  });
  it("permits missing original UUIDs only as a pending manifest and never claims upload", () => {
    const result = buildBootstrapStep("MEDIA_MANIFEST", values({ operationKey: "media", originalFilename: "Malar-Xiang-Guo.jpg", reviewStatus: "PENDING" }), setupFixture());
    expect(result.expectedMediaOperationKey).toBeNull();
    expect(result.mediaManifest?.[0]).toMatchObject({ restaurantId, productId: null, variantId: null, reviewStatus: "PENDING", uploadStatus: "PENDING" });
    expect(() => buildBootstrapStep("MEDIA_MANIFEST", values({ operationKey: "media", originalFilename: "dish.jpg", reviewStatus: "APPROVED" }), setupFixture())).toThrow("actual product");
    expect(() => buildBootstrapStep("MEDIA_MANIFEST", values({ operationKey: "media", originalFilename: "../dish.jpg" }), setupFixture())).toThrow("filename");
  });
  it("revises a pending filename mapping through another reviewed operation", () => {
    const snapshot = setupFixture();
    snapshot.mediaManifest = [{ originalFilename: "Dish.jpg", restaurantId, productId: null, variantId: null, intendedAssociation: "PRODUCT_IMAGE", reviewStatus: "PENDING", originalContentHash: null, uploadStatus: "PENDING" }];
    const request = buildBootstrapStep("MEDIA_MANIFEST", values({ operationKey: "media-approved", originalFilename: "dish.jpg", productId, reviewStatus: "APPROVED", originalContentHash: "a".repeat(64) }), snapshot);
    expect(request.mediaManifest).toHaveLength(1);
    expect(request.mediaManifest?.[0]).toMatchObject({ productId, reviewStatus: "APPROVED", uploadStatus: "PENDING" });
  });
  it("requires an observed SHA-256 before approving a known product mapping", () => {
    const draft = { operationKey: "media-review", originalFilename: "dish.jpg", productId, reviewStatus: "APPROVED" };
    expect(() => buildBootstrapStep("MEDIA_MANIFEST", values(draft), setupFixture())).toThrow("SHA-256");
    expect(() => buildBootstrapStep("MEDIA_MANIFEST", values({ ...draft, originalContentHash: "invalid" }), setupFixture())).toThrow("64-character");
    expect(buildBootstrapStep("MEDIA_MANIFEST", values({ ...draft, reviewStatus: "PENDING" }), setupFixture()).mediaManifest?.[0])
      .toMatchObject({ productId, reviewStatus: "PENDING", originalContentHash: null, uploadStatus: "PENDING" });
  });
  it.each([".", "..", "dish.jpg.", "dish?.jpg", "dish|.jpg"])("rejects unsafe original filename %s", originalFilename => {
    expect(() => buildBootstrapStep("MEDIA_MANIFEST", values({ operationKey: "media", originalFilename }), setupFixture())).toThrow("filename");
  });
  it("retains the reviewed latest media receipt when another operator changes the manifest", () => {
    const snapshot = setupFixture();
    const receipt = (operationKey: string, kind: "MEDIA_MANIFEST" | "CATEGORY") => ({ operationKey, kind, resourceId: null, result: {}, actorId: restaurantId, completedAt: "2026-11-20T00:00:00Z" });
    snapshot.steps = [receipt("media-first", "MEDIA_MANIFEST"), receipt("category-2", "CATEGORY"), receipt("media-current", "MEDIA_MANIFEST"), receipt("category-3", "CATEGORY")];
    const request = buildBootstrapStep("MEDIA_MANIFEST", values({ operationKey: "media-reviewed", originalFilename: "dish.jpg" }), snapshot);
    expect(request.expectedMediaOperationKey).toBe("media-current");
    snapshot.steps.push(receipt("media-other-tab", "MEDIA_MANIFEST"));
    expect(request.expectedMediaOperationKey).toBe("media-current");
    expect(buildBootstrapStep("MEDIA_MANIFEST", values({ operationKey: "media-rebuilt", originalFilename: "dish.jpg" }), snapshot).expectedMediaOperationKey).toBe("media-other-tab");
  });
  it("validates the canonical three colors independently of deployment fallback metadata", () => {
    expect(readInitialPalette(values({ primaryColor: "#a51d22", secondaryColor: "#c99632", backgroundColor: "#fff8f0" }))).toEqual({ primaryColor: "#A51D22", secondaryColor: "#C99632", backgroundColor: "#FFF8F0" });
    expect(() => readInitialPalette(values({ primaryColor: "red" }))).toThrow("six-digit");
  });
  it("does not confuse confirmed Auth email with completed account setup or native publication", () => {
    const checklist = Object.fromEntries(setupChecklist(setupFixture()));
    expect(checklist["Owner invitation"]).toBe("Auth contact confirmed");
    expect(checklist["Owner account setup"]).toBe("Pending or unavailable");
    expect(checklist["Native build and release"]).toContain("Pending");
    expect(checklist["Original photos"]).toContain("Pending");
  });
});
