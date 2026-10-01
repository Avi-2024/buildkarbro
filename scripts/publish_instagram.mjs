import fs from "node:fs/promises";
import { selectDuePost } from "./social_queue.mjs";

const IG_USER_ID = "17841424749134562";
const EXPECTED_USERNAME = "buildkarbro";
const ACCESS_TOKEN = (process.env.META_ACCESS_TOKEN || "").trim();
const GRAPH_VERSION = process.env.META_GRAPH_VERSION || "v23.0";
const POSTS_FILE = process.env.POSTS_FILE || "posts.json";
const GRAPH_HOST = "https://graph.instagram.com/";

if (!ACCESS_TOKEN) throw new Error("Missing META_ACCESS_TOKEN repository secret.");
if (/^Bearer\s+/i.test(ACCESS_TOKEN)) {
  throw new Error("META_ACCESS_TOKEN must contain only the raw Instagram access token, without a Bearer prefix.");
}
if (/\s/.test(ACCESS_TOKEN)) {
  throw new Error("META_ACCESS_TOKEN contains whitespace. Save only the raw Instagram access token in the GitHub secret.");
}
if (/^[\"'`]|[\"'`]$/.test(ACCESS_TOKEN)) {
  throw new Error("META_ACCESS_TOKEN appears to be quoted. Save only the raw Instagram access token in the GitHub secret.");
}

let posts;
let due;
async function saveQueue() {
  await fs.writeFile(POSTS_FILE, JSON.stringify(posts, null, 2) + "\n");
}

async function handleGraphFailure(response, data) {
  const code = Number(data?.error?.code);
  if (due && (response.status === 429 || [4, 17, 32, 613].includes(code))) {
    due.instagram_retry_after = new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString();
    due.instagram_last_error = formatGraphError(response, data);
    await saveQueue();
  }
  throw new Error(formatGraphError(response, data));
}

function formatGraphError(response, data) {
  const error = data?.error || {};
  const details = [
    error.type && `type=${error.type}`,
    error.code != null && `code=${error.code}`,
    error.error_subcode != null && `subcode=${error.error_subcode}`,
  ].filter(Boolean).join(", ");

  return `${error.message || `Instagram Graph API request failed (${response.status})`}${details ? ` (${details})` : ""}`;
}

async function graphPost(path, params = {}) {
  const url = new URL(GRAPH_HOST + GRAPH_VERSION + "/" + path);
  const body = new URLSearchParams({ access_token: ACCESS_TOKEN });

  for (const [key, value] of Object.entries(params)) {
    body.set(key, Array.isArray(value) ? value.join(",") : String(value));
  }

  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = await response.json();

  if (!response.ok || data.error) await handleGraphFailure(response, data);
  return data;
}

async function graphGet(path, params = {}) {
  const url = new URL(GRAPH_HOST + GRAPH_VERSION + "/" + path);
  url.searchParams.set("access_token", ACCESS_TOKEN);

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, Array.isArray(value) ? value.join(",") : String(value));
  }

  const response = await fetch(url);
  const data = await response.json();

  if (!response.ok || data.error) await handleGraphFailure(response, data);
  return data;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForContainer(containerId, label) {
  const maxChecks = 5;

  for (let check = 1; check <= maxChecks; check += 1) {
    const status = await graphGet(containerId, { fields: "status_code,status" });
    const code = status.status_code;

    if (code === "FINISHED" || code === "PUBLISHED") {
      console.log(`${label} container is ready (${code}).`);
      return code;
    }

    if (code === "ERROR" || code === "EXPIRED") {
      throw new Error(`${label} container failed: ${status.status || code}`);
    }

    if (check === maxChecks) {
      throw new Error(`${label} container was not ready after ${maxChecks} status checks (last status: ${code || "unknown"}).`);
    }

    console.log(`${label} container status: ${code || "processing"}; waiting 60 seconds.`);
    await sleep(60_000);
  }
}

posts = JSON.parse(await fs.readFile(POSTS_FILE, "utf8"));
if (!Array.isArray(posts)) throw new Error("posts.json must contain a JSON array.");
due = selectDuePost(posts);
if (!due) { console.log("No due Instagram post."); process.exit(0); }
if (new Date(due.instagram_retry_after).getTime() > Date.now()) {
  console.log(`Instagram rate-limit cooldown until ${due.instagram_retry_after}; no API requests made.`);
  process.exit(0);
}
const account = await graphGet(IG_USER_ID, { fields: "id,username" });
if (String(account.username || "").toLowerCase() !== EXPECTED_USERNAME.toLowerCase()) {
  throw new Error(`Instagram account mismatch: expected @${EXPECTED_USERNAME}.`);
}
console.log(`Instagram publishing account verified: @${account.username} (${account.id}).`);

if (!Array.isArray(due.image_urls) || due.image_urls.length < 1 || due.image_urls.length > 10) {
  throw new Error("Due post must contain between 1 and 10 image_urls.");
}

// Clear stale verification/publish fields before this fresh publish attempt.
due.instagram_media_id = null;
due.instagram_permalink = null;
due.instagram_username = null;
due.verified_at = null;
due.media_type = null;
due.media_product_type = null;
delete due.verification_error;
delete due.verification_failed_at;

console.log(`Publishing ${due.id} with ${due.image_urls.length} image(s).`);

// Persist each container so a retry does not create another six children.
const signature = JSON.stringify([due.image_urls, due.caption]);
let attempt = due.instagram_attempt;
if (attempt?.publish_requested_at && Date.now() - new Date(attempt.started_at).getTime() > 23 * 60 * 60 * 1000) {
  throw new Error("An older publish attempt has an uncertain result. Verify existing Instagram media before creating new containers.");
}
if (!attempt || attempt.signature !== signature || Date.now() - new Date(attempt.started_at).getTime() > 23 * 60 * 60 * 1000) {
  attempt = { signature, started_at: new Date().toISOString(), child_ids: [], creation_id: null };
  due.instagram_attempt = attempt;
  await saveQueue();
}
if (!attempt.creation_id) {
  if (due.image_urls.length === 1) {
    const created = await graphPost(`${IG_USER_ID}/media`, { image_url: due.image_urls[0], caption: due.caption || "" });
    attempt.creation_id = created.id;
    await saveQueue();
  } else {
    for (let index = attempt.child_ids.length; index < due.image_urls.length; index++) {
      const child = await graphPost(`${IG_USER_ID}/media`, { image_url: due.image_urls[index], is_carousel_item: "true" });
      attempt.child_ids.push(child.id);
      await saveQueue();
    }
    await Promise.all(attempt.child_ids.map((id, index) => waitForContainer(id, `Carousel item ${index + 1}`)));
    const created = await graphPost(`${IG_USER_ID}/media`, { media_type: "CAROUSEL", children: attempt.child_ids, caption: due.caption || "" });
    attempt.creation_id = created.id;
    await saveQueue();
  }
}
const status = await waitForContainer(attempt.creation_id, "Post");
if (status === "PUBLISHED") {
  throw new Error("Saved container is already published. Verify existing Instagram media before retrying; refusing a duplicate post.");
}
const creation = { id: attempt.creation_id };

attempt.publish_requested_at = new Date().toISOString();
await saveQueue();
const published = await graphPost(`${IG_USER_ID}/media_publish`, {
  creation_id: creation.id,
});

if (!published.id) throw new Error("Instagram media_publish did not return a media id.");

due.published_at = new Date().toISOString();
due.instagram_media_id = published.id;
delete due.instagram_attempt;
delete due.instagram_retry_after;
delete due.instagram_last_error;

await fs.writeFile(POSTS_FILE, JSON.stringify(posts, null, 2) + "\n");
console.log(`Published Instagram post ${due.id} as media ${published.id}`);
