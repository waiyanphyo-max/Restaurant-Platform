"use strict";

const fs = require("node:fs");
const path = require("node:path");

// Return only validation facts and the already-approved public native metadata.
// Never include file paths, raw JSON, keys, or actual/expected project values in diagnostics.
function inspectClientConfig(file, applicationId, expectedProject) {
  const result = { androidClientJson: false, matchingAndroidClients: 0,
    expectedProjectMatches: null, clientMetadataValid: false, firebase: null };
  let config;
  try {
    config = JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
  } catch {
    return result;
  }
  if (!config || typeof config !== "object" || config.type === "service_account" ||
      Object.hasOwn(config, "private_key")) return result;
  result.androidClientJson = Array.isArray(config.client);
  const { project_id: projectId, project_number: senderId } = config.project_info ?? {};
  result.expectedProjectMatches = expectedProject && typeof projectId === "string" ? projectId === expectedProject : null;
  const clients = Array.isArray(config.client) ? config.client.filter((client) =>
    client?.client_info?.android_client_info?.package_name === applicationId) : [];
  result.matchingAndroidClients = clients.length;
  if (typeof projectId !== "string" || !/^[a-z][a-z0-9-]+$/.test(projectId) ||
      typeof senderId !== "string" || !/^\d+$/.test(senderId) || clients.length !== 1) return result;
  const [client] = clients;
  const appId = client.client_info.mobilesdk_app_id;
  const hasApiKey = Array.isArray(client.api_key) && client.api_key.some((key) =>
    typeof key?.current_key === "string" && /^AIza[A-Za-z0-9_-]{35}$/.test(key.current_key));
  if (typeof appId !== "string" || !new RegExp(`^1:${senderId}:android:[a-f0-9]+$`).test(appId) || !hasApiKey) return result;
  return { ...result, clientMetadataValid: true, firebase: { projectId, senderId, appId } };
}

function selectFirebaseAndroid(kind, appDirectory, applicationId, env, environment = env.MOBILE_ENV) {
  const prefix = kind.toUpperCase();
  if (env[`${prefix}_NOTIFICATIONS_ENABLED`] !== "true") return null;
  const pathVariable = `${prefix}_GOOGLE_SERVICES_FILE`;
  const file = env[pathVariable];
  const expectedProject = env.MOBILE_FIREBASE_PROJECT_ID;
  const inspection = inspectClientConfig(file ? path.resolve(appDirectory, file) : "", applicationId, expectedProject);
  const { firebase, ...facts } = inspection;
  if (!expectedProject || !firebase || !facts.expectedProjectMatches) {
    const diagnostic = { status: "BLOCKED", appKind: kind,
      environment: ["development", "staging", "production"].includes(environment) ? environment : "unspecified",
      applicationId, fileConfigured: Boolean(file), expectedProjectConfigured: Boolean(expectedProject), ...facts };
    const details = Object.entries(diagnostic).map(([key, value]) => `${key}=${value}`).join("; ");
    const error = new Error(`Firebase Android preflight ${details}. ${pathVariable} must reference Firebase Android client JSON for ${applicationId} in MOBILE_FIREBASE_PROJECT_ID. ` +
      `Operator action: in the approved Firebase project's Project settings > General > Your apps, select or register this exact Android application ID; download its Android google-services.json, set ${pathVariable} to that ignored file (relative to this app workspace), and set MOBILE_FIREBASE_PROJECT_ID to the same approved project. Rerun the original command. Duplicate matching clients or invalid app/sender/key metadata require a fresh client download. Preserve the native application ID and notification settings.`);
    error.firebaseDiagnostic = diagnostic;
    throw error;
  }
  return { file, firebase };
}

module.exports = { selectFirebaseAndroid };
