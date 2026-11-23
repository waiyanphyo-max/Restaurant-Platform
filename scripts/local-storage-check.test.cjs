"use strict";
const assert = require("node:assert/strict");
const http = require("node:http");
const { Buffer } = require("node:buffer");
const test = require("node:test");
const { verifyLocalStorage } = require("./local-storage-check.cjs");

test("storage probe refuses hosted URLs and missing public keys before making requests", async () => {
  await assert.rejects(verifyLocalStorage({ authOrigin: "https://hosted.supabase.co", serviceRoleKey: "private", publishableKey: "sb_publishable_fixture" }), /exact HTTP 127/);
  await assert.rejects(verifyLocalStorage({ authOrigin: "http://127.0.0.1:54321", serviceRoleKey: "private" }), /LOCAL_STORAGE_KEYS_REQUIRED/);
});

async function withStorageAssertionFixture(operation, { anonymousWrite = false } = {}) {
  const buckets = new Map(), objects = new Map(), deletions = [];
  const privateKey = "synthetic-server-key-never-report";
  const server = http.createServer(async (req, res) => {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const bytes = Buffer.concat(chunks), url = req.url.replace(/^\/storage\/v1/, "");
    const admin = req.headers.apikey === privateKey;
    const send = (status, value) => { res.statusCode = status; res.setHeader("content-type", "application/json"); res.end(JSON.stringify(value)); };
    if (url.startsWith("/bucket/") && req.method === "GET") {
      const bucket = buckets.get(url.slice("/bucket/".length));
      return send(bucket ? 200 : 404, bucket ?? { message: "Bucket not found" });
    }
    if (url === "/bucket" && req.method === "POST" && admin) {
      const bucket = JSON.parse(bytes.toString()); buckets.set(bucket.id, bucket); return send(200, { name: bucket.name });
    }
    const read = /^\/object\/(public|authenticated)\/([^/]+)\/(.+)$/.exec(url);
    if (read) {
      if (buckets.get(read[2])?.public && read[1] === "public") { res.end(objects.get(`${read[2]}/${read[3]}`)); return; }
      return send(400, { error: "Bucket not found" });
    }
    const upload = /^\/object\/([^/]+)\/(.+)$/.exec(url);
    if (upload && req.method === "POST") {
      if (admin || anonymousWrite) { objects.set(`${upload[1]}/${upload[2]}`, bytes); return send(200, { Key: `${upload[1]}/${upload[2]}` }); }
      return send(400, { statusCode: "403", error: "Unauthorized", message: `new row violates row-level security policy ${privateKey}` });
    }
    const remove = /^\/object\/([^/]+)$/.exec(url);
    if (remove && req.method === "DELETE" && admin) {
      const prefixes = JSON.parse(bytes.toString()).prefixes;
      for (const object of prefixes) { objects.delete(`${remove[1]}/${object}`); deletions.push(object); }
      return send(200, []);
    }
    send(500, { private: privateKey });
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  try { await operation({ authOrigin: `http://127.0.0.1:${server.address().port}`, serviceRoleKey: privateKey, publishableKey: "sb_publishable_fixture" }, { buckets, objects, deletions, privateKey }); }
  finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}

test("permission probes inspect exact public/private buckets and clean only random task objects", async () => {
  await withStorageAssertionFixture(async (input, state) => {
    const result = await verifyLocalStorage(input);
    assert.equal(result.status, "PASS", JSON.stringify(result));
    assert.equal(result.checks.length, 15);
    assert.deepEqual([...state.buckets].map(([name, value]) => [name, value.public]), [["restaurant-logos", true], ["menu-images", true], ["customer-avatars", false]]);
    assert.equal(state.objects.size, 0);
    assert.equal(state.deletions.length, 6);
    assert.ok(state.deletions.every(value => /^uxi13b-permission-check\/[0-9a-f-]+\/(server|anonymous)\.png$/.test(value)));
    assert.equal(JSON.stringify(result).includes(state.privateKey), false);
  });
});

test("unexpected anonymous uploads fail acceptance and still receive owned-object cleanup", async () => {
  await withStorageAssertionFixture(async (input, state) => {
    const result = await verifyLocalStorage(input);
    assert.equal(result.status, "FAIL");
    assert.equal(result.checks.filter(item => item.code === "LOCAL_ANONYMOUS_WRITE_NOT_DENIED").length, 3);
    assert.equal(state.objects.size, 0);
    assert.equal(JSON.stringify(result).includes(state.privateKey), false);
  }, { anonymousWrite: true });
});
