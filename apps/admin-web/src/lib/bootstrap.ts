import type { PlatformBootstrapSnapshot, PlatformBootstrapStepRequest, PlatformMediaManifestEntry, RuntimeBrandingPalette } from "@restaurant-platform/shared-types";

export const bootstrapKinds = ["CATEGORY", "PRODUCT", "VARIANT", "MODIFIER_GROUP", "MODIFIER_OPTION", "ATTACH_MODIFIER_GROUP", "ORDERING_SETTINGS", "MEDIA_MANIFEST", "COMPLETE_CATALOG", "HANDOFF"] as const;
export type BootstrapKind = typeof bootstrapKinds[number];
export const stepLabels: Record<BootstrapKind, string> = {
  CATEGORY: "Category", PRODUCT: "Product", VARIANT: "Product variant", MODIFIER_GROUP: "Modifier group",
  MODIFIER_OPTION: "Modifier option", ATTACH_MODIFIER_GROUP: "Attach modifier group", MEDIA_MANIFEST: "Media mapping manifest",
  ORDERING_SETTINGS: "Initial ordering settings",
  COMPLETE_CATALOG: "Confirm catalog review", HANDOFF: "Confirm Operations handoff",
};

export class BootstrapDraftError extends Error {
  constructor(public field: string, message: string) { super(message); }
}

const text = (form: FormData, key: string) => String(form.get(key) ?? "").trim();
const checked = (form: FormData, key: string) => form.get(key) === "on";
function required(form: FormData, key: string, limit = 150) {
  const value = text(form, key);
  if (!value || value.length > limit) throw new BootstrapDraftError(key, `Enter a value of ${limit} characters or fewer.`);
  return value;
}
function integer(form: FormData, key: string) {
  const raw = text(form, key);
  const value = Number(raw);
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(value)) throw new BootstrapDraftError(key, "Use an exact nonnegative whole number within the supported range.");
  return value;
}
function reference(form: FormData, key: string, validIds: string[]) {
  const value = required(form, key, 36);
  if (!validIds.includes(value)) throw new BootstrapDraftError(key, "Select an existing record in this restaurant.");
  return value;
}

/** Draft validation improves feedback. Spring independently validates all references and permissions. */
export function buildBootstrapStep(kind: BootstrapKind, form: FormData, snapshot: PlatformBootstrapSnapshot): PlatformBootstrapStepRequest {
  const operationKey = required(form, "operationKey", 100);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/.test(operationKey)) throw new BootstrapDraftError("operationKey", "Use letters, numbers, periods, underscores, colons and hyphens.");
  const base = { operationKey, kind };
  if (kind === "CATEGORY") return { ...base, category: { name: required(form, "name"), displayOrder: integer(form, "displayOrder"), active: checked(form, "active") } };
  if (kind === "PRODUCT") {
    const trackStock = checked(form, "trackStock");
    return { ...base, currency: snapshot.currency, product: {
      categoryId: reference(form, "categoryId", snapshot.categories.filter(item => item.active).map(item => item.id)),
      name: required(form, "name"), description: text(form, "description") || null,
      price: integer(form, "price"), available: checked(form, "available"), trackStock,
      stockQuantity: trackStock ? integer(form, "stockQuantity") : null,
    } };
  }
  if (kind === "VARIANT") return { ...base, currency: snapshot.currency,
    productId: reference(form, "productId", snapshot.products.map(item => item.id)),
    variant: { name: required(form, "name"), description: text(form, "description") || null, price: integer(form, "price"), available: checked(form, "available") },
  };
  if (kind === "MODIFIER_GROUP") {
    const isRequired = checked(form, "required"), minSelections = integer(form, "minSelections"), maxSelections = integer(form, "maxSelections");
    if (maxSelections < minSelections || (isRequired && minSelections < 1)) throw new BootstrapDraftError("minSelections", "Required groups need a minimum of at least one; maximum must be at least the minimum.");
    return { ...base, modifierGroup: { name: required(form, "name"), required: isRequired, minSelections, maxSelections, active: checked(form, "active") } };
  }
  if (kind === "MODIFIER_OPTION") return { ...base, currency: snapshot.currency,
    modifierGroupId: reference(form, "modifierGroupId", snapshot.modifierGroups.map(item => item.id)),
    modifierOption: { name: required(form, "name"), additionalPrice: integer(form, "additionalPrice"), available: checked(form, "available") },
  };
  if (kind === "ATTACH_MODIFIER_GROUP") return { ...base,
    productId: reference(form, "productId", snapshot.products.map(item => item.id)),
    modifierGroupId: reference(form, "modifierGroupId", snapshot.modifierGroups.map(item => item.id)),
  };
  if (kind === "ORDERING_SETTINGS") return { ...base, settings: {
    currency: snapshot.currency, timezone: snapshot.settings.timezone,
    minimumOrder: integer(form, "minimumOrder"), defaultDeliveryFee: integer(form, "defaultDeliveryFee"),
    acceptsOrders: checked(form, "acceptsOrders"), allowQrOrder: checked(form, "allowQrOrder"),
    allowDelivery: checked(form, "allowDelivery"), allowTakeaway: checked(form, "allowTakeaway"),
  } };
  if (kind === "MEDIA_MANIFEST") {
    const originalFilename = required(form, "originalFilename", 255);
    if (originalFilename.endsWith(".") || /[\\/:<>"|?*]/.test(originalFilename) || [...originalFilename].some(char => char.charCodeAt(0) < 32)) throw new BootstrapDraftError("originalFilename", "Use the original filename without a directory path or unsafe characters.");
    const intendedAssociation = text(form, "intendedAssociation") === "VARIANT_IMAGE" ? "VARIANT_IMAGE" : "PRODUCT_IMAGE";
    const reviewStatus = text(form, "reviewStatus") === "APPROVED" ? "APPROVED" : "PENDING";
    const productId = text(form, "productId") ? reference(form, "productId", snapshot.products.map(item => item.id)) : null;
    const variantId = intendedAssociation === "VARIANT_IMAGE" && text(form, "variantId")
      ? reference(form, "variantId", snapshot.variants.filter(item => item.productId === productId).map(item => item.id)) : null;
    if (reviewStatus === "APPROVED" && (!productId || (intendedAssociation === "VARIANT_IMAGE" && !variantId))) throw new BootstrapDraftError("productId", "Approved mappings need actual product and, for a variant image, matching variant UUIDs.");
    const originalContentHash = text(form, "originalContentHash") || null;
    if (originalContentHash && !/^[0-9a-f]{64}$/i.test(originalContentHash)) throw new BootstrapDraftError("originalContentHash", "Use the original file’s 64-character SHA-256 hash, or leave pending.");
    if (reviewStatus === "APPROVED" && !originalContentHash) throw new BootstrapDraftError("originalContentHash", "Approved mappings require the observed original file’s SHA-256 hash. Keep unverified originals pending.");
    const entry: PlatformMediaManifestEntry = { originalFilename, restaurantId: snapshot.restaurantId, productId, variantId, intendedAssociation, reviewStatus, originalContentHash, uploadStatus: "PENDING" };
    const existing = snapshot.mediaManifest.findIndex(item => item.originalFilename.toLowerCase() === originalFilename.toLowerCase());
    const mediaManifest = [...snapshot.mediaManifest];
    if (existing < 0) mediaManifest.push(entry); else mediaManifest[existing] = entry;
    return { ...base, mediaManifest, expectedMediaOperationKey: latestMediaOperationKey(snapshot) };
  }
  return base;
}

export function readInitialPalette(form: FormData): RuntimeBrandingPalette {
  const palette = { primaryColor: text(form, "primaryColor"), secondaryColor: text(form, "secondaryColor"), backgroundColor: text(form, "backgroundColor") };
  for (const [field, color] of Object.entries(palette)) {
    if (!/^#[0-9a-f]{6}$/i.test(color)) throw new BootstrapDraftError(field, "Use a six-digit hex color, such as #245A71.");
  }
  return { primaryColor: palette.primaryColor.toUpperCase(), secondaryColor: palette.secondaryColor.toUpperCase(), backgroundColor: palette.backgroundColor.toUpperCase() };
}

export function reconciledStep(snapshot: PlatformBootstrapSnapshot, request: PlatformBootstrapStepRequest) {
  return snapshot.steps.find(item => item.operationKey === request.operationKey);
}

export function latestMediaOperationKey(snapshot: PlatformBootstrapSnapshot): string | null {
  return snapshot.steps.filter(item => item.kind === "MEDIA_MANIFEST").at(-1)?.operationKey ?? null;
}

export function setupChecklist(snapshot: PlatformBootstrapSnapshot) {
  return [
    ["Restaurant provisioned", "Confirmed"],
    ["Owner invitation", snapshot.owners.some(item => item.invitationStatus === "INVITED") ? "Recorded; account setup pending" : snapshot.owners.some(item => item.invitationStatus === "ACCEPTED") ? "Auth contact confirmed" : "Not confirmed"],
    ["Owner account setup", snapshot.ownerOnboardingConfirmed ? "Confirmed by account setup state" : "Pending or unavailable"],
    ["Runtime palette", snapshot.branding.revision > 0 && snapshot.branding.palette ? `Initialized · revision ${snapshot.branding.revision}` : "Pending"],
    ["Initial catalog", snapshot.catalogComplete ? "Review completed" : snapshot.products.length ? "Partially completed; review pending" : "Pending"],
    ["Original photos", "Pending publication verification"],
    ["Native build and release", "Pending separate release review"],
    ["Owner Operations handoff", snapshot.handedOff ? "Handoff recorded" : snapshot.handoffReady ? "Ready for confirmation" : "Blocked"],
  ];
}
