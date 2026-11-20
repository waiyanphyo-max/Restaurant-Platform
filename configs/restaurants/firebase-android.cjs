"use strict";

const fs = require("node:fs");
const path = require("node:path");

function readClientConfig(file, applicationId) {
  let config;
  try {
    config = JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
  } catch {
    return null;
  }
  if (!config || config.type === "service_account" || Object.hasOwn(config, "private_key")) return null;
  const { project_id: projectId, project_number: senderId } = config.project_info ?? {};
  if (typeof projectId !== "string" || !/^[a-z][a-z0-9-]+$/.test(projectId) ||
      typeof senderId !== "string" || !/^\d+$/.test(senderId) || !Array.isArray(config.client)) return null;
  const clients = config.client.filter((client) => client?.client_info?.android_client_info?.package_name === applicationId);
  if (clients.length !== 1) return null;
  const [client] = clients;
  const appId = client.client_info.mobilesdk_app_id;
  const hasApiKey = Array.isArray(client.api_key) && client.api_key.some((key) =>
    typeof key?.current_key === "string" && /^AIza[A-Za-z0-9_-]{35}$/.test(key.current_key));
  if (typeof appId !== "string" || !new RegExp(`^1:${senderId}:android:[a-f0-9]+$`).test(appId) || !hasApiKey) return null;
  return { projectId, senderId, appId };
}

function selectFirebaseAndroid(kind, appDirectory, applicationId, env) {
  const prefix = kind.toUpperCase();
  if (env[`${prefix}_NOTIFICATIONS_ENABLED`] !== "true") return null;
  const pathVariable = `${prefix}_GOOGLE_SERVICES_FILE`;
  const file = env[pathVariable];
  const expectedProject = env.MOBILE_FIREBASE_PROJECT_ID;
  const firebase = file ? readClientConfig(path.resolve(appDirectory, file), applicationId) : null;
  if (!expectedProject || !firebase || firebase.projectId !== expectedProject) {
    throw new Error(`${pathVariable} must reference Firebase Android client JSON for ${applicationId} in MOBILE_FIREBASE_PROJECT_ID`);
  }
  return { file, firebase };
}

module.exports = { selectFirebaseAndroid };
