"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { localOrigin, jsonRequest, createIdentity, signIn, provisionTenant } = require("./local-api-journey.cjs");

test("privileged local provider credentials cannot leave the exact loopback origin", async () => {
  let calls = 0;
  const fetchImpl = async () => { calls++; throw new Error("must not be called"); };
  for (const origin of ["https://project.supabase.co", "http://192.168.1.5:54321", "http://localhost:54321",
    "http://127.0.0.2:54321", "http://127.1:54321", "http://2130706433:54321", "http://0x7f000001:54321",
    "http://127.0.0.1", "http://user@127.0.0.1:54321",
    "http://127.0.0.1:54321/other", "http://127.0.0.1:54321?token=secret", "http://127.0.0.1:54321#secret"]) {
    await assert.rejects(createIdentity({ authOrigin: origin, serviceRoleKey: "private", label: "owner-a", fetchImpl }));
  }
  assert.equal(calls, 0);
  assert.equal(localOrigin("http://127.0.0.1:54321/"), "http://127.0.0.1:54321");
});

test("provider identity creation confirms only reserved synthetic email without an invitation", async () => {
  const id = "00000000-0000-4000-8000-000000000123";
  const created = await createIdentity({ authOrigin: "http://127.0.0.1:54321", serviceRoleKey: "local-service-secret", label: "owner-a",
    fetchImpl: async (url, options) => {
      assert.equal(url, "http://127.0.0.1:54321/auth/v1/admin/users");
      assert.equal(options.redirect, "error", "A provider redirect must never forward privileged credentials");
      const payload = JSON.parse(options.body);
      assert.match(payload.email, /^uxi13b-owner-a-[0-9a-f-]+@example\.test$/);
      assert.equal(payload.email_confirm, true);
      assert.ok(payload.password.length >= 32);
      assert.equal(payload.invite, undefined);
      return { status: 200, json: async () => ({ id, email: payload.email, email_confirmed_at: "2026-11-22T00:00:00Z" }) };
    } });
  assert.equal(created.id, id);
});

test("provider and transport failures never expose response bodies or credentials", async () => {
  const privateText = "private-jwt-password-qr-capability";
  for (const fetchImpl of [async () => ({ status: 500, json: async () => ({ privateText }) }),
    async () => { throw new Error(privateText); }]) {
    await assert.rejects(jsonRequest({ origin: "http://127.0.0.1:54321", path: "/auth/v1/admin/users", fetchImpl }),
      error => !String(error.stack).includes(privateText));
  }
});

test("sign-in requires a restorable real-provider session and refuses ordinary email", async () => {
  let calls = 0;
  const fetchImpl = async () => { calls++; return { status: 200, json: async () => ({ access_token: "private", user: { id: "id" } }) }; };
  await assert.rejects(signIn({ authOrigin: "http://127.0.0.1:54321", anonKey: "anon", email: "real@example.com", password: "private", fetchImpl }));
  assert.equal(calls, 0);
  await assert.rejects(signIn({ authOrigin: "http://127.0.0.1:54321", anonKey: "anon", email: "owner@example.test", password: "private", fetchImpl }), /restorable session/);
});

test("Admin form provisioning reuses its returned UUID only after independent exact Owner verification", async () => {
  const id = "00000000-0000-4000-8000-000000000123";
  const ownerId = "00000000-0000-4000-8000-000000000124";
  const request = { ownerUserId: ownerId, ownerEmail: "owner@example.test",
    restaurant: { name: "Local A", slug: "local-a", currency: "MMK", timezone: "Asia/Yangon" } };
  const detail = { restaurant: { id, ...request.restaurant }, currency: "MMK", timezone: "Asia/Yangon",
    owners: [{ userId: ownerId, email: request.ownerEmail, invitationStatus: "ACCEPTED" }] };
  const calls = [];
  const admin = { id: "synthetic-admin" };
  const provisionRestaurant = async received => { assert.deepEqual(received, request); return { id }; };
  const call = async (method, route, actor) => { calls.push({ method, route }); assert.equal(actor, admin); return detail; };
  assert.equal(await provisionTenant({ request, admin, call, provisionRestaurant }), id);
  assert.deepEqual(calls, [{ method: "GET", route: `/platform/restaurants/${id}` }], "The bridge must not POST a second restaurant");

  // A UI callback cannot turn a foreign row or an unconfirmed Owner into a valid handoff fixture.
  for (const invalid of [
    { ...detail, restaurant: { ...detail.restaurant, slug: "another-tenant" } },
    { ...detail, currency: "THB" },
    { ...detail, owners: [{ ...detail.owners[0], userId: id }] },
    { ...detail, owners: [{ ...detail.owners[0], email: "other@example.test" }] },
    { ...detail, owners: [{ ...detail.owners[0], invitationStatus: "INVITED" }] },
  ]) {
    await assert.rejects(provisionTenant({ request, admin, provisionRestaurant, call: async () => invalid }));
  }
});
