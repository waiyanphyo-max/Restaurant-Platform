"use strict";

// Local-only provider/API bridge. Secrets and QR capabilities remain in memory.
// This complements the UXI-13A database/HTTP harness; it does not replace its acceptance class.
const assert = require("node:assert/strict");
const { randomBytes, randomUUID } = require("node:crypto");

function localOrigin(value) {
  if (typeof value !== "string" || !/^http:\/\/127\.0\.0\.1:[1-9][0-9]{0,4}\/?$/.test(value)) {
    throw new Error("Local integration requires an exact HTTP 127.0.0.1 origin with an explicit port");
  }
  let url;
  try { url = new URL(value); } catch { throw new Error("Local integration origin is invalid"); }
  if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || !url.port ||
      url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    throw new Error("Local integration requires an exact HTTP 127.0.0.1 origin with an explicit port");
  }
  return url.origin;
}

async function jsonRequest({ origin, path, method = "GET", headers = {}, body, status = 200, fetchImpl = globalThis.fetch }) {
  const safeOrigin = localOrigin(origin);
  let response;
  try {
    response = await fetchImpl(safeOrigin + path, {
      method, headers: { Accept: "application/json", ...(body === undefined ? {} : { "Content-Type": "application/json" }), ...headers },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), redirect: "error", signal: globalThis.AbortSignal.timeout(30000),
    });
  } catch {
    throw new Error(`Local ${method} request could not complete`);
  }
  // Provider bodies can contain passwords, JWTs, capabilities and private details. Never echo them.
  if (response.status !== status) throw new Error(`Local ${method} ${path.split("?")[0]} returned HTTP ${response.status}; expected ${status}`);
  if (status === 204) return null;
  try { return await response.json(); } catch { throw new Error("Local service returned an invalid JSON response"); }
}

async function createIdentity({ authOrigin, serviceRoleKey, label, fetchImpl }) {
  localOrigin(authOrigin);
  if (!serviceRoleKey || !/^[a-z0-9-]+$/.test(label)) throw new Error("Local Auth fixture configuration is incomplete");
  const email = `uxi13b-${label}-${randomUUID()}@example.test`;
  const password = `${randomBytes(24).toString("base64url")}aA7!`;
  const user = await jsonRequest({ origin: authOrigin, path: "/auth/v1/admin/users", method: "POST",
    headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
    body: { email, password, email_confirm: true, user_metadata: { full_name: `UXI-13B ${label}` } }, fetchImpl });
  assert.match(user.id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  assert.equal(user.email, email);
  assert.ok(user.email_confirmed_at, "Synthetic exact-UUID owner must be locally confirmed");
  return { id: user.id, email, password };
}

async function signIn({ authOrigin, anonKey, email, password, fetchImpl }) {
  if (!anonKey || !email?.endsWith("@example.test") || !password) throw new Error("Synthetic local sign-in configuration is incomplete");
  const session = await jsonRequest({ origin: authOrigin, path: "/auth/v1/token?grant_type=password", method: "POST",
    headers: { apikey: anonKey }, body: { email, password }, fetchImpl });
  assert.ok(session.access_token && session.refresh_token && session.user?.id, "Local Auth must return a real restorable session");
  return session;
}

async function prepareIdentities({ authOrigin, serviceRoleKey, anonKey, fetchImpl }) {
  const identities = {};
  for (const label of ["admin", "owner-a", "owner-b"]) {
    const identity = await createIdentity({ authOrigin, serviceRoleKey, label, fetchImpl });
    identity.session = await signIn({ authOrigin, anonKey, email: identity.email, password: identity.password, fetchImpl });
    assert.equal(identity.session.user.id, identity.id, "Sign-in must preserve the exact created Auth UUID");
    identities[label === "owner-a" ? "ownerA" : label === "owner-b" ? "ownerB" : label] = identity;
  }
  return identities;
}

async function provisionTenant({ request, admin, call, provisionRestaurant }) {
  let id;
  if (provisionRestaurant) {
    // The callback submits the real Admin form/server action and returns only its persisted UUID.
    // Its result is never treated as a fabricated Spring provisioning response.
    ({ id } = await provisionRestaurant(request));
  } else {
    const provision = await call("POST", "/platform/restaurants", admin, request, 201);
    id = provision.restaurant.id;
    assert.equal(provision.ownerUserId, request.ownerUserId);
    assert.equal(provision.invitationSent, false);
    assert.equal(provision.ownerInvitationStatus, "ACCEPTED");
  }
  assert.ok(typeof id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id),
    "Provisioning must return a persisted restaurant UUID");
  // Independently resolve the actual row and exact Auth-backed Owner through Spring.
  const detail = await call("GET", `/platform/restaurants/${id}`, admin);
  assert.equal(detail.restaurant.id, id);
  assert.equal(detail.restaurant.name, request.restaurant.name);
  assert.equal(detail.restaurant.slug, request.restaurant.slug);
  assert.equal(detail.currency, request.restaurant.currency);
  assert.equal(detail.timezone, request.restaurant.timezone);
  assert.equal(detail.owners.length, 1, "Disposable provisioning must create exactly the reviewed Owner");
  assert.equal(detail.owners[0].userId, request.ownerUserId);
  assert.equal(detail.owners[0].email, request.ownerEmail);
  assert.equal(detail.owners[0].invitationStatus, "ACCEPTED");
  return id;
}

async function runApiJourney({ apiOrigin, identities, guestOrigins = { a: "http://a.localhost:3000", b: "http://b.localhost:3000" },
  fetchImpl, provisionRestaurant }) {
  localOrigin(apiOrigin);
  for (const identity of Object.values(identities)) assert.ok(identity.id && identity.session?.access_token);
  let requests = 0;
  const call = async (method, path, actor, body, status = 200, headers = {}) => {
    const result = await jsonRequest({ origin: apiOrigin, path: `/api/v1${path}`, method, body, status,
      headers: { ...(actor ? { Authorization: `Bearer ${actor.session.access_token}` } : {}), ...headers }, fetchImpl });
    requests++;
    return result;
  };
  const tenants = [];
  const privateFixtures = [];
  const admin = identities.admin;
  const ownerList = [identities.ownerA, identities.ownerB];
  for (const [index, label] of ["a", "b"].entries()) {
    const owner = ownerList[index];
    const currency = index === 0 ? "MMK" : "THB";
    const timezone = index === 0 ? "Asia/Yangon" : "Asia/Bangkok";
    const name = `UXI-13B Restaurant ${label.toUpperCase()}`;
    const slug = `uxi13b-${label}-${admin.id}`;
    const id = await provisionTenant({ admin, call, provisionRestaurant, request: {
      ownerEmail: owner.email, ownerUserId: owner.id,
      restaurant: { name, slug, township: "Tamwe", city: "Yangon", currency, timezone },
    } });
    const base = `/restaurants/${id}`;
    const bootstrap = `/platform/restaurants/${id}/bootstrap`;
    const step = (operationKey, kind, fields = {}) => call("POST", `${bootstrap}/steps`, admin, { operationKey, kind, ...fields });
    await call("POST", `/platform/restaurants/${id}/branding`, admin, { expectedRevision: 0,
      palette: { primaryColor: index === 0 ? "#9B2226" : "#234D3C", secondaryColor: "#F4EEDD", backgroundColor: "#FFFFFF" } });
    const categoryBody = { category: { name: `Local ${label.toUpperCase()} meals`, active: true } };
    const category = await step(`${label}-category`, "CATEGORY", categoryBody);
    // A committed operation-key replay must recover the same durable receipt.
    const recoveredCategory = await step(`${label}-category`, "CATEGORY", categoryBody);
    for (const field of ["operationKey", "kind", "resourceId", "actorId", "result"]) assert.deepEqual(recoveredCategory[field], category[field]);
    const categoryId = category.resourceId;
    const productName = `Local ${label.toUpperCase()} ${index === 0 ? "rice" : "bowl"}`;
    const basePrice = index === 0 ? 4500 : 125;
    const product = await step(`${label}-product`, "PRODUCT", { currency,
      product: { categoryId, name: productName, price: basePrice, trackStock: true, stockQuantity: 20, available: true } });
    const productId = product.resourceId;
    const variantPrice = index === 0 ? 6500 : 150;
    const variant = await step(`${label}-variant`, "VARIANT", { currency, productId,
      variant: { name: "Large", price: variantPrice, available: true } });
    const group = await step(`${label}-group`, "MODIFIER_GROUP", {
      modifierGroup: { name: "Spice", required: true, minSelections: 1, maxSelections: 1, active: true } });
    const modifierPrice = index === 0 ? 500 : 10;
    const option = await step(`${label}-option`, "MODIFIER_OPTION", { currency, modifierGroupId: group.resourceId,
      modifierOption: { name: "Mild", additionalPrice: modifierPrice, available: true } });
    await step(`${label}-attach`, "ATTACH_MODIFIER_GROUP", { productId, modifierGroupId: group.resourceId });
    await step(`${label}-complete`, "COMPLETE_CATALOG");
    await step(`${label}-ordering`, "ORDERING_SETTINGS", {
      settings: { currency, timezone, minimumOrder: 0, defaultDeliveryFee: 0, acceptsOrders: true,
        allowQrOrder: true, allowDelivery: false, allowTakeaway: true } });
    const pending = await call("GET", bootstrap, admin);
    assert.equal(pending.ownerOnboardingConfirmed, false);
    assert.equal(pending.handoffReady, false);
    await call("POST", "/owner-onboarding/complete", owner, {});
    const reviewed = await call("GET", bootstrap, admin);
    assert.equal(reviewed.ownerOnboardingConfirmed, true);
    assert.equal(reviewed.handoffReady, true);
    await step(`${label}-handoff`, "HANDOFF");
    await call("PUT", `${base}/featured-product`, owner, { productId, expectedRevision: 0 });
    const commonQr = await call("POST", `${base}/settings/common-qr-token/rotate`, owner);
    const table = await call("POST", `${base}/tables`, owner, { tableNumber: "Local T1", active: true });
    const menu = await call("GET", `/public${base}/menu`);
    assert.equal(menu.restaurantId, id);
    assert.equal(menu.featuredProduct.productId, productId);
    const publicProduct = menu.categories.flatMap(category => category.products).find(product => product.id === productId);
    assert.equal(publicProduct.name, productName);
    assert.equal(publicProduct.variants[0].id, variant.resourceId);
    assert.equal(publicProduct.modifierGroups[0].options[0].id, option.resourceId);
    const branding = await call("GET", `/public${base}/branding`);
    assert.equal(branding.restaurantId, id);
    assert.equal(branding.palette.primaryColor, index === 0 ? "#9B2226" : "#234D3C");
    const items = [{ productId, variantId: variant.resourceId, quantity: 1,
      modifiers: [{ modifierOptionId: option.resourceId, quantity: 1 }] }];
    for (const [kind, qrToken, tableId] of [["COMMON_QR", commonQr.commonQrToken ?? commonQr.qrToken, null],
      ["TABLE_QR", table.qrToken, table.tableId]]) {
      assert.ok(qrToken, "Disposable QR credential must be returned once");
      const context = await call("POST", `/public${base}/qr-context`, null, { kind, qrToken });
      assert.equal(context.restaurantId, id);
      assert.equal(context.kind, kind);
      privateFixtures.push({ restaurantId: id, kind, qrToken, tableId, items, expectedTotal: variantPrice + modifierPrice });
    }
    const guest = new URL(guestOrigins[label]);
    assert.ok(guest.hostname.endsWith(".localhost"), "Synthetic Guest host must remain local");
    tenants.push({ id, slug, host: `${slug}.localhost`, name, productId, productName, categoryId,
      variantId: variant.resourceId, modifierOptionId: option.resourceId, currency, expectedTotal: variantPrice + modifierPrice });
  }
  await call("GET", `/restaurants/${tenants[0].id}/products`, identities.ownerB, undefined, 403);
  await call("GET", `/restaurants/${tenants[1].id}/products`, identities.ownerA, undefined, 403);
  await call("GET", `/platform/restaurants/${tenants[0].id}/bootstrap`, identities.ownerA, undefined, 403);
  await call("GET", `/restaurants/${tenants[0].id}/products`, null, undefined, 401);
  const signedParts = identities.ownerA.session.access_token.split(".");
  assert.equal(signedParts.length, 3, "Local Auth must issue a signed JWT");
  signedParts[2] = (signedParts[2][0] === "A" ? "B" : "A") + signedParts[2].slice(1);
  await jsonRequest({ origin: apiOrigin, path: `/api/v1/restaurants/${tenants[0].id}/products`, status: 401,
    headers: { Authorization: `Bearer ${signedParts.join(".")}` }, fetchImpl });
  requests++;
  assert.equal((await call("GET", "/my/restaurants", admin)).length, 0, "Platform Admin receives no restaurant membership");
  return { manifest: { schemaVersion: 1, tenants, evidence: { status: "PASS", httpRequests: requests,
    provider: "REAL_LOCAL_SUPABASE_AUTH", provisioning: provisionRestaurant ? "REAL_ADMIN_UI" : "REAL_SPRING_HTTP",
    invitationRequests: 0, receiptRecovery: "PASS", ownerHandoff: "PASS",
    isolation: "PASS", checkout: "NOT RUN", browser: "NOT RUN", native: "NOT RUN" } }, privateFixtures };
}

module.exports = { localOrigin, jsonRequest, createIdentity, signIn, prepareIdentities, provisionTenant, runApiJourney };
