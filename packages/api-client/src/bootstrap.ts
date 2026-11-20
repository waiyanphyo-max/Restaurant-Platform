import type {
  PlatformBootstrapSnapshot, PlatformBootstrapStepKind, PlatformBootstrapStepRequest,
  PlatformBootstrapStepResponse, PlatformMediaManifestEntry,
} from "@restaurant-platform/shared-types";
import { ApiConfigurationError, ApiProtocolError } from "./errors.js";
import { checkedBrandingResponse } from "./branding.js";
import { requireUuid } from "./tenant.js";

const kinds = new Set<PlatformBootstrapStepKind>(["CATEGORY", "PRODUCT", "VARIANT", "MODIFIER_GROUP",
  "MODIFIER_OPTION", "ATTACH_MODIFIER_GROUP", "ORDERING_SETTINGS", "MEDIA_MANIFEST", "COMPLETE_CATALOG", "HANDOFF"]);
const keyPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/;
const creationKinds = new Set<PlatformBootstrapStepKind>(["CATEGORY", "PRODUCT", "VARIANT", "MODIFIER_GROUP", "MODIFIER_OPTION"]);
const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
function protocolUuid(value: unknown): string {
  try { return requireUuid(value as string, "record ID"); } catch { throw new ApiProtocolError(); }
}

function manifestEntry(entry: PlatformMediaManifestEntry, restaurantId: string): PlatformMediaManifestEntry {
  if (!entry || requireUuid(entry.restaurantId, "media restaurantId") !== restaurantId ||
      typeof entry.originalFilename !== "string" || !entry.originalFilename.trim() ||
      entry.originalFilename.length > 255 || /[/\\:]/.test(entry.originalFilename) ||
      [...entry.originalFilename].some(character => character.charCodeAt(0) < 32) ||
      !["PRODUCT_IMAGE", "VARIANT_IMAGE"].includes(entry.intendedAssociation) ||
      !["PENDING", "APPROVED"].includes(entry.reviewStatus) || entry.uploadStatus !== "PENDING" ||
      (entry.originalContentHash != null && !/^[a-f0-9]{64}$/i.test(entry.originalContentHash))) {
    throw new ApiConfigurationError("Invalid initial media mapping");
  }
  const productId = entry.productId == null ? null : requireUuid(entry.productId, "productId");
  const variantId = entry.variantId == null ? null : requireUuid(entry.variantId, "variantId");
  if ((entry.intendedAssociation === "PRODUCT_IMAGE" && variantId !== null) ||
      (variantId !== null && productId === null) ||
      (entry.reviewStatus === "APPROVED" && (!productId ||
        (entry.intendedAssociation === "VARIANT_IMAGE" && !variantId)))) {
    throw new ApiConfigurationError("Reviewed media requires exact product/variant IDs");
  }
  return { originalFilename: entry.originalFilename, restaurantId, productId, variantId,
    intendedAssociation: entry.intendedAssociation, reviewStatus: entry.reviewStatus,
    originalContentHash: entry.originalContentHash ?? null, uploadStatus: "PENDING" };
}

function whole(value: unknown): void {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new ApiConfigurationError("Catalog amounts and quantities must be exact nonnegative whole values");
  }
}

/** Project only the selected operation. Neither actor identity nor image URLs can be supplied. */
export function checkedBootstrapStep(body: PlatformBootstrapStepRequest, restaurantId: string): PlatformBootstrapStepRequest {
  if (!body || !keyPattern.test(body.operationKey) || !kinds.has(body.kind)) {
    throw new ApiConfigurationError("A stable operation key and valid initial setup operation are required");
  }
  const result: PlatformBootstrapStepRequest = { operationKey: body.operationKey, kind: body.kind };
  if (["PRODUCT", "VARIANT", "MODIFIER_OPTION"].includes(body.kind)) {
    if (typeof body.currency !== "string" || !/^[A-Z]{3}$/.test(body.currency)) {
      throw new ApiConfigurationError("Use the restaurant's exact currency code");
    }
    result.currency = body.currency;
  }
  switch (body.kind) {
    case "CATEGORY": {
      if (!body.category) throw new ApiConfigurationError("Category is required");
      const { name, displayOrder, active } = body.category;
      result.category = { name, displayOrder, active }; break;
    }
    case "PRODUCT": {
      if (!body.product) throw new ApiConfigurationError("Product is required");
      const { name, description, price, trackStock, stockQuantity, available } = body.product;
      whole(price); if (stockQuantity != null) whole(stockQuantity);
      result.product = { categoryId: requireUuid(body.product.categoryId, "categoryId"), name,
        description, price, trackStock, stockQuantity, available }; break;
    }
    case "VARIANT": {
      if (!body.variant) throw new ApiConfigurationError("Variant is required");
      const { name, description, price, available } = body.variant; whole(price);
      result.productId = requireUuid(body.productId!, "productId");
      result.variant = { name, description, price, available }; break;
    }
    case "MODIFIER_GROUP": {
      if (!body.modifierGroup) throw new ApiConfigurationError("Modifier group is required");
      const { name, required, minSelections, maxSelections, active } = body.modifierGroup;
      result.modifierGroup = { name, required, minSelections, maxSelections, active }; break;
    }
    case "MODIFIER_OPTION": {
      if (!body.modifierOption) throw new ApiConfigurationError("Modifier option is required");
      const { name, additionalPrice, available } = body.modifierOption; whole(additionalPrice);
      result.modifierGroupId = requireUuid(body.modifierGroupId!, "modifierGroupId");
      result.modifierOption = { name, additionalPrice, available }; break;
    }
    case "ATTACH_MODIFIER_GROUP":
      result.productId = requireUuid(body.productId!, "productId");
      result.modifierGroupId = requireUuid(body.modifierGroupId!, "modifierGroupId"); break;
    case "ORDERING_SETTINGS": {
      if (!body.settings) throw new ApiConfigurationError("Ordering settings are required");
      const { currency, timezone, minimumOrder, defaultDeliveryFee, acceptsOrders, allowQrOrder, allowDelivery, allowTakeaway } = body.settings;
      whole(minimumOrder); whole(defaultDeliveryFee);
      result.settings = { currency, timezone, minimumOrder, defaultDeliveryFee, acceptsOrders, allowQrOrder, allowDelivery, allowTakeaway }; break;
    }
    case "MEDIA_MANIFEST":
      if (!Array.isArray(body.mediaManifest) || body.mediaManifest.length > 500) {
        throw new ApiConfigurationError("A bounded media mapping manifest is required");
      }
      if (body.expectedMediaOperationKey != null && (typeof body.expectedMediaOperationKey !== "string" ||
          !keyPattern.test(body.expectedMediaOperationKey))) {
        throw new ApiConfigurationError("Use the last reviewed media manifest operation key");
      }
      result.expectedMediaOperationKey = body.expectedMediaOperationKey ?? null;
      result.mediaManifest = body.mediaManifest.map(entry => manifestEntry(entry, restaurantId)); break;
  }
  return result;
}

export function checkedBootstrapStepResponse(value: unknown, expected?: PlatformBootstrapStepRequest): PlatformBootstrapStepResponse {
  if (!isObject(value) || typeof value.operationKey !== "string" || !keyPattern.test(value.operationKey) ||
      !kinds.has(value.kind as PlatformBootstrapStepKind) || !isObject(value.result) ||
      (creationKinds.has(value.kind as PlatformBootstrapStepKind) && value.resourceId == null) ||
      typeof value.completedAt !== "string" || !Number.isFinite(Date.parse(value.completedAt)) ||
      (expected && (value.operationKey !== expected.operationKey || value.kind !== expected.kind))) {
    throw new ApiProtocolError();
  }
  return { operationKey: value.operationKey, kind: value.kind as PlatformBootstrapStepKind,
    resourceId: value.resourceId == null ? null : protocolUuid(value.resourceId), result: value.result,
    actorId: protocolUuid(value.actorId), completedAt: value.completedAt };
}

/** Check scope and every catalog reference before displaying a recovered setup. No shared cache. */
export function checkedBootstrapSnapshot(value: unknown, restaurantId: string): PlatformBootstrapSnapshot {
  if (!isObject(value) || protocolUuid(value.restaurantId) !== restaurantId ||
      typeof value.currency !== "string" || !/^[A-Z]{3}$/.test(value.currency) ||
      ["steps", "categories", "products", "variants", "modifierGroups", "productModifierGroups", "owners", "mediaManifest", "blockers"]
        .some(key => !Array.isArray(value[key])) ||
      ["catalogComplete", "ownerOnboardingConfirmed", "handoffReady", "handedOff"].some(key => typeof value[key] !== "boolean") ||
      value.photosStatus !== "PENDING" || value.nativeBuildStatus !== "PENDING") throw new ApiProtocolError();
  const snapshot = value as unknown as PlatformBootstrapSnapshot;
  const settings = value.settings;
  if (!isObject(settings) || protocolUuid(settings.restaurantId) !== restaurantId ||
      settings.currency !== snapshot.currency || typeof settings.timezone !== "string" ||
      ["acceptsOrders", "allowQrOrder", "allowDelivery", "allowTakeaway"].some(key => typeof settings[key] !== "boolean")) {
    throw new ApiProtocolError();
  }
  const ids = (items: { id: string }[]) => new Set(items.map(item => protocolUuid(item?.id)));
  const categories = ids(snapshot.categories), products = ids(snapshot.products), groups = ids(snapshot.modifierGroups);
  const variants = new Map(snapshot.variants.map(v => [protocolUuid(v?.id), protocolUuid(v?.productId)]));
  if (snapshot.products.some(p => !categories.has(protocolUuid(p.categoryId))) ||
      snapshot.variants.some(v => !products.has(protocolUuid(v.productId))) ||
      snapshot.modifierGroups.some(g => !Array.isArray(g.options) || g.options.some(o => protocolUuid(o.groupId) !== protocolUuid(g.id))) ||
      snapshot.productModifierGroups.some(a => !products.has(protocolUuid(a.productId)) || !groups.has(protocolUuid(a.modifierGroupId))) ||
      snapshot.blockers.some(b => typeof b !== "string")) throw new ApiProtocolError();
  snapshot.owners.forEach(owner => protocolUuid(owner?.userId));
  let mediaManifest: PlatformMediaManifestEntry[];
  try { mediaManifest = snapshot.mediaManifest.map(entry => manifestEntry(entry, restaurantId)); }
  catch { throw new ApiProtocolError(); }
  if (mediaManifest.some(m => (m.productId !== null && !products.has(m.productId)) ||
      (m.variantId !== null && variants.get(m.variantId) !== m.productId))) throw new ApiProtocolError();
  const branding = checkedBrandingResponse(snapshot.branding, restaurantId);
  return { restaurantId, currency: snapshot.currency, settings: snapshot.settings, steps: snapshot.steps.map(step => checkedBootstrapStepResponse(step)),
    categories: snapshot.categories, products: snapshot.products, variants: snapshot.variants,
    modifierGroups: snapshot.modifierGroups, productModifierGroups: snapshot.productModifierGroups,
    catalogComplete: snapshot.catalogComplete, mediaManifest, branding, owners: snapshot.owners,
    ownerOnboardingConfirmed: snapshot.ownerOnboardingConfirmed, photosStatus: "PENDING", nativeBuildStatus: "PENDING",
    handoffReady: snapshot.handoffReady, handedOff: snapshot.handedOff, blockers: snapshot.blockers };
}
