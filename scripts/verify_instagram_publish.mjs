import fs from "node:fs/promises";

const IG_USER_ID = "17841424749134562";
const ACCESS_TOKEN = (process.env.META_ACCESS_TOKEN || "").trim();
const GRAPH_VERSION = process.env.META_GRAPH_VERSION || "v23.0";
const GRAPH_HOST = "https://graph.instagram.com/";
const POSTS_FILE = process.env.POSTS_FILE || "posts.json";

if (!ACCESS_TOKEN) throw new Error("Missing META_ACCESS_TOKEN repository secret.");

function graphError(response, data) {
  const error = data?.error || {};
  const details = [
    error.type && `type=${error.type}`,
    error.code != null && `code=${error.code}`,
    error.error_subcode != null && `subcode=${error.error_subcode}`,
  ].filter(Boolean).join(", ");
  return `${error.message || `Instagram Graph API request failed (${response.status})`}${details ? ` (${details})` : ""}`;
}

async function graphGet(path, params = {}) {
  const url = new URL(`${GRAPH_HOST}${GRAPH_VERSION}/${path}`);
  url.searchParams.set("access_token", ACCESS_TOKEN);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
  const response = await fetch(url);
  const data = await response.json();
  if (!response.ok || data.error) throw new Error(graphError(response, data));
  return data;
}

const posts = JSON.parse(await fs.readFile(POSTS_FILE, "utf8"));
const published = posts
  .filter((post) => post.instagram_media_id && post.published_at)
  .sort((a, b) => new Date(b.published_at) - new Date(a.published_at))[0];

if (!published) {
  console.log("No published Instagram media record to verify.");
  process.exit(0);
}

const account = await graphGet(IG_USER_ID, { fields: "id,username" });
console.log(`Authenticated Instagram account: @${account.username || "unknown"} (${account.id})`);

const media = await graphGet(published.instagram_media_id, {
  fields: "id,media_type,media_product_type,permalink,timestamp,username",
});

if (account.username && media.username && account.username !== media.username) {
  throw new Error(`Published media belongs to @${media.username}, expected @${account.username}.`);
}

if (!media.permalink) throw new Error("Published media exists but Meta did not return a permalink.");

published.instagram_permalink = media.permalink;
published.instagram_username = media.username || account.username || null;
published.verified_at = new Date().toISOString();
published.media_type = media.media_type || null;
published.media_product_type = media.media_product_type || null;

await fs.writeFile(POSTS_FILE, JSON.stringify(posts, null, 2) + "\n");
console.log(`Verified Instagram media ${media.id}.`);
console.log(`Published username: @${published.instagram_username || "unknown"}`);
console.log(`Instagram permalink: ${media.permalink}`);
