"use strict";

// Caller must establish ownership of the disposable CLI stack first. This helper
// has no hosted mode, custom bucket names, policy changes or developer-data reset.
const { Buffer } = require("node:buffer");
const { randomUUID } = require("node:crypto");
const { localOrigin } = require("./local-api-journey.cjs");
const { fetch, AbortSignal } = globalThis;
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aY1sAAAAASUVORK5CYII=", "base64");
const BUCKETS = [
  { id: "restaurant-logos", public: true, file_size_limit: 5 * 1024 * 1024 },
  { id: "menu-images", public: true, file_size_limit: 5 * 1024 * 1024 },
  { id: "customer-avatars", public: false, file_size_limit: 2 * 1024 * 1024 },
];
function expect(value, code) {
  if (!value) { const error = new Error(code); error.storageCheckCode = code; throw error; }
}

/** Create/reuse local buckets, test permissions with a tiny synthetic PNG, and
 * remove only this invocation's random object paths. Keys/bodies stay in memory.
 */
async function verifyLocalStorage({ authOrigin, serviceRoleKey, publishableKey }) {
  const origin = localOrigin(authOrigin);
  if (!serviceRoleKey || !/^sb_publishable_[A-Za-z0-9_-]+$/.test(publishableKey ?? "")) {
    throw new Error("LOCAL_STORAGE_KEYS_REQUIRED");
  }
  const checks = [];
  const request = async (pathname, { method = "GET", key, json, image } = {}) => {
    const response = await fetch(origin + "/storage/v1" + pathname, {
      method, headers: { ...(key ? { apikey: key, Authorization: `Bearer ${key}` } : {}),
        ...(json === undefined ? {} : { "Content-Type": "application/json" }),
        ...(image ? { "Content-Type": "image/png" } : {}) },
      ...(json === undefined ? {} : { body: JSON.stringify(json) }), ...(image ? { body: PNG } : {}),
      redirect: "error", cache: "no-store", signal: AbortSignal.timeout(15000),
    });
    const bytes = Buffer.from(await response.arrayBuffer());
    return { status: response.status, bytes,
      json() { try { return JSON.parse(bytes.toString("utf8")); } catch { return null; } } };
  };
  const check = async (name, operation) => {
    try { await operation(); checks.push({ name, status: "PASS" }); return true; }
    catch (error) { checks.push({ name, status: "FAIL", code: error.storageCheckCode ?? "LOCAL_STORAGE_REQUEST_FAILED" }); return false; }
  };
  for (const bucket of BUCKETS) {
    const ready = await check(`storage-${bucket.id}-bucket-configuration`, async () => {
      let found = await request(`/bucket/${bucket.id}`, { key: serviceRoleKey });
      if (found.status === 404 || (found.status === 400 && /not found/i.test(found.json()?.message ?? ""))) {
        const created = await request("/bucket", { method: "POST", key: serviceRoleKey,
          json: { ...bucket, name: bucket.id, allowed_mime_types: ["image/png", "image/jpeg", "image/webp"] } });
        expect(created.status >= 200 && created.status < 300, "LOCAL_BUCKET_CREATE_FAILED");
        found = await request(`/bucket/${bucket.id}`, { key: serviceRoleKey });
      }
      const value = found.json();
      expect(found.status === 200 && value?.id === bucket.id && value?.public === bucket.public, "LOCAL_BUCKET_CONFIGURATION_MISMATCH");
      // Existing bucket metadata is inspected, never overwritten.
    });
    if (!ready) continue;
    const prefix = `uxi13b-permission-check/${randomUUID()}`;
    const object = `${prefix}/server.png`, deniedObject = `${prefix}/anonymous.png`;
    try {
      const uploaded = await check(`storage-${bucket.id}-server-upload`, async () => {
        const result = await request(`/object/${bucket.id}/${object}`, { method: "POST", key: serviceRoleKey, image: true });
        expect(result.status >= 200 && result.status < 300, "LOCAL_SERVER_UPLOAD_FAILED");
      });
      if (uploaded) await check(`storage-${bucket.id}-anonymous-read-policy`, async () => {
        const result = await request(`/object/public/${bucket.id}/${object}`);
        if (bucket.public) expect(result.status === 200 && result.bytes.equals(PNG), "LOCAL_PUBLIC_IMAGE_READ_FAILED");
        else {
          expect([400, 401, 403, 404].includes(result.status), "LOCAL_PRIVATE_IMAGE_PUBLICLY_READABLE");
          const authenticatedPath = await request(`/object/authenticated/${bucket.id}/${object}`, { key: publishableKey });
          expect([400, 401, 403, 404].includes(authenticatedPath.status), "LOCAL_PRIVATE_IMAGE_ANONYMOUSLY_READABLE");
        }
      });
      await check(`storage-${bucket.id}-anonymous-write-denial`, async () => {
        const result = await request(`/object/${bucket.id}/${deniedObject}`, { method: "POST", key: publishableKey, image: true });
        const error = result.json();
        const denied = [401, 403].includes(result.status) || (result.status === 400 &&
          (["401", "403"].includes(String(error?.statusCode)) || /unauthorized|row.level security|permission denied/i.test(`${error?.error ?? ""} ${error?.message ?? ""}`)));
        expect(denied, "LOCAL_ANONYMOUS_WRITE_NOT_DENIED");
      });
    } finally {
      await check(`storage-${bucket.id}-owned-object-cleanup`, async () => {
        const result = await request(`/object/${bucket.id}`, { method: "DELETE", key: serviceRoleKey, json: { prefixes: [object, deniedObject] } });
        expect(result.status >= 200 && result.status < 300, "LOCAL_OWNED_OBJECT_CLEANUP_FAILED");
      });
    }
  }
  return { status: checks.every(item => item.status === "PASS") ? "PASS" : "FAIL", acceptanceClass: "disposable-local-storage",
    checks, scope: "Local CLI bucket configuration and synthetic PNG permission probes; task object cleanup only. No hosted or Spring upload-route acceptance." };
}

module.exports = { verifyLocalStorage };
