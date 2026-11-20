import type { IsoDateTime, Uuid } from "./api.js";
import type { RestaurantBrandingResponse } from "./branding-api.js";
import type {
  CategoryRequest, CategoryResponse, ProductRequest, ProductManagementResponse,
  ProductVariantRequest, ProductVariantResponse, ModifierGroupRequest, ModifierGroupResponse,
  ModifierOptionRequest, RestaurantSettingsRequest, RestaurantSettingsResponse,
} from "./member-api.js";
import type { PlatformRestaurantOwnerResponse } from "./platform-api.js";

/** Private, platform-allowlist-only initial setup. No media upload or native publication contract. */
export type PlatformBootstrapStepKind = "CATEGORY" | "PRODUCT" | "VARIANT" | "MODIFIER_GROUP" |
  "MODIFIER_OPTION" | "ATTACH_MODIFIER_GROUP" | "ORDERING_SETTINGS" | "MEDIA_MANIFEST" | "COMPLETE_CATALOG" | "HANDOFF";

export interface PlatformMediaManifestEntry {
  originalFilename: string;
  restaurantId: Uuid;
  productId: Uuid | null;
  variantId: Uuid | null;
  intendedAssociation: "PRODUCT_IMAGE" | "VARIANT_IMAGE";
  reviewStatus: "PENDING" | "APPROVED";
  originalContentHash: string | null;
  /** Mapping approval does not prove an upload. Uploads are excluded from UXI-04. */
  uploadStatus: "PENDING";
}

/** Keep the exact operation key and reviewed payload when reconciling/retrying an uncertain result. */
export interface PlatformBootstrapStepRequest {
  operationKey: string;
  kind: PlatformBootstrapStepKind;
  currency?: string;
  category?: CategoryRequest;
  product?: Omit<ProductRequest, "imageUrl">;
  productId?: Uuid;
  variant?: Omit<ProductVariantRequest, "imageUrl">;
  modifierGroup?: ModifierGroupRequest;
  modifierGroupId?: Uuid;
  modifierOption?: ModifierOptionRequest;
  settings?: RestaurantSettingsRequest;
  mediaManifest?: PlatformMediaManifestEntry[];
  /** MEDIA_MANIFEST replacement is conditional on the last reviewed manifest receipt, null initially. */
  expectedMediaOperationKey?: string | null;
}

export interface PlatformBootstrapStepResponse {
  operationKey: string;
  kind: PlatformBootstrapStepKind;
  resourceId: Uuid | null;
  result: Record<string, unknown>;
  actorId: Uuid;
  completedAt: IsoDateTime;
}

export interface PlatformBootstrapSnapshot {
  restaurantId: Uuid;
  currency: string;
  settings: RestaurantSettingsResponse;
  steps: PlatformBootstrapStepResponse[];
  categories: CategoryResponse[];
  products: ProductManagementResponse[];
  variants: ProductVariantResponse[];
  modifierGroups: ModifierGroupResponse[];
  productModifierGroups: { productId: Uuid; modifierGroupId: Uuid }[];
  catalogComplete: boolean;
  mediaManifest: PlatformMediaManifestEntry[];
  branding: RestaurantBrandingResponse;
  owners: PlatformRestaurantOwnerResponse[];
  ownerOnboardingConfirmed: boolean;
  photosStatus: "PENDING";
  nativeBuildStatus: "PENDING";
  handoffReady: boolean;
  handedOff: boolean;
  blockers: string[];
}
