import fs from "node:fs/promises";

const PAGE_ID = process.env.FACEBOOK_PAGE_ID || "61594437443124";
const ACCESS_TOKEN = (process.env.FACEBOOK_PAGE_ACCESS_TOKEN || "").trim();
const GRAPH_VERSION = process.env.META_GRAPH_VERSION || "v23.0";
const GRAPH_HOST = "https://graph.facebook.com/";
const POSTS_FILE = process.env.POSTS_FILE || "posts.json";

if (!ACCESS_TOKEN) {
  console.log("FACEBOOK_PAGE_ACCESS_TOKEN secret is not configured. Skipping Facebook publish.");
  process.exit(0);
}

if (/^Bearer\s+/i.test(ACCESS_TOKEN)) {
  throw new Error("FACEBOOK_PAGE_ACCESS_TOKEN must contain only the raw Page access token, without a Bearer prefix.");
}

function graphError(response, data) {
  const error = data?.error || {};
  const details = [
    error.type && `type=${error.type}`,
    error.code != null && `code=${error.code}`,
    error.error_subcode != null && `subcode=${error.error_subcode}`,
    error.fbtrace_id && `fbtrace_id=${error.fbtrace_id}`,
  ].filter(Boolean).join(", ");

  return `${error.message || `Facebook Graph API request failed (${response.status})`}${details ? ` (${details})` : ""}`;
}

async function graphGet(path, params = {}) {
  const url = new URL(`${GRAPH_HOST}${GRAPH_VERSION}/${path}`);
  url.searchParams.set("access_token", ACCESS_TOKEN);

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
  }

  const response = await fetch(url);
  const data = await response.json();

  if (!response.ok || data.error) throw new Error(graphError(response, data));
  return data;
}

async function graphPost(path, params = {}) {
  const url = new URL(`${GRAPH_HOST}${GRAPH_VERSION}/${path}`);
  const body = new URLSearchParams({ access_token: ACCESS_TOKEN });

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) body.set(key, String(value));
  }

  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = await response.json();

  if (!response.ok || data.error) throw new Error(graphError(response, data));
  return data;
}

async function savePosts(posts) {
  await fs.writeFile(POSTS_FILE, JSON.stringify(posts, null, 2) + "\n");
}

const posts = JSON.parse(await fs.readFile(POSTS_FILE, "utf8"));
if (!Array.isArray(posts)) throw new Error("posts.json must contain a JSON array.");

const target = posts
  .filter((post) =>
    post.published_at &&
    post.instagram_media_id &&
    post.verified_at &&
    !post.facebook_post_id &&
    Array.isArray(post.image_urls) &&
    post.image_urls.length >= 1
  )
  .sort((a, b) => new Date(b.published_at) - new Date(a.published_at))[0];

if (!target) {
  console.log("No Instagram-verified post pending Facebook publishing.");
  process.exit(0);
}

if (target.facebook_status === "publishing") {
  console.log(`Facebook publish was already in progress for ${target.id}; retrying safely.`);
}

const page = await graphGet(PAGE_ID, { fields: "id,name,link" });
console.log(`Facebook Page verified: ${page.name || "unknown"} (${page.id}).`);
console.log(`Publishing Facebook Page post for ${target.id} with ${target.image_urls.length} image(s).`);

target.facebook_status = "publishing";
target.facebook_started_at = new Date().toISOString();
delete target.facebook_error;
delete target.facebook_failed_at;
await savePosts(posts);

try {
  const photoIds = [];

  for (const [index, imageUrl] of target.image_urls.entries()) {
    const uploaded = await graphPost(`${PAGE_ID}/photos`, {
      url: imageUrl,
      published: "false",
    });

    if (!uploaded.id) throw new Error(`Facebook did not return an id for uploaded photo ${index + 1}.`);
    photoIds.push(uploaded.id);
    console.log(`Uploaded Facebook photo ${index + 1}/${target.image_urls.length}: ${uploaded.id}`);
  }

  const feedParams = {
    message: target.facebook_caption || target.caption || "",
    published: "true",
  };

  for (const [index, photoId] of photoIds.entries()) {
    feedParams[`attached_media[${index}]`] = JSON.stringify({ media_fbid: photoId });
  }

  const feed = await graphPost(`${PAGE_ID}/feed`, feedParams);
  if (!feed.id) throw new Error("Facebook did not return a post id after publishing the feed post.");

  let permalink = null;
  try {
    const details = await graphGet(feed.id, { fields: "id,permalink_url,created_time" });
    permalink = details.permalink_url || null;
  } catch (error) {
    console.warn(`Facebook post published, but permalink lookup failed: ${error.message}`);
  }

  target.facebook_status = "published";
  target.facebook_post_id = feed.id;
  target.facebook_page_id = PAGE_ID;
  target.facebook_page_name = page.name || null;
  target.facebook_photo_ids = photoIds;
  target.facebook_posted_at = new Date().toISOString();
  target.facebook_permalink = permalink;
  delete target.facebook_started_at;
  delete target.facebook_error;
  delete target.facebook_failed_at;

  await savePosts(posts);
  console.log(`Published Facebook Page post ${target.id} as ${feed.id}.`);
  if (permalink) console.log(`Facebook permalink: ${permalink}`);
} catch (error) {
  target.facebook_status = "failed";
  target.facebook_error = error.message;
  target.facebook_failed_at = new Date().toISOString();
  delete target.facebook_started_at;
  await savePosts(posts);
  throw error;
}
