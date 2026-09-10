import fs from "node:fs/promises";

const IG_USER_ID = "17841424749134562";
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

  if (!response.ok || data.error) throw new Error(formatGraphError(response, data));
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

  if (!response.ok || data.error) throw new Error(formatGraphError(response, data));
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
      return;
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

const posts = JSON.parse(await fs.readFile(POSTS_FILE, "utf8"));
if (!Array.isArray(posts)) throw new Error("posts.json must contain a JSON array.");

const due = posts.find(
  (post) => !post.published_at && post.publish_at && new Date(post.publish_at).getTime() <= Date.now()
);

if (!due) {
  console.log("No due Instagram post.");
  process.exit(0);
}

if (!Array.isArray(due.image_urls) || due.image_urls.length < 1 || due.image_urls.length > 10) {
  throw new Error("Due post must contain between 1 and 10 image_urls.");
}

console.log(`Publishing ${due.id} with ${due.image_urls.length} image(s).`);

let creation;

if (due.image_urls.length === 1) {
  creation = await graphPost(`${IG_USER_ID}/media`, {
    image_url: due.image_urls[0],
    caption: due.caption || "",
  });
  await waitForContainer(creation.id, "Image");
} else {
  const childIds = [];

  for (const imageUrl of due.image_urls) {
    const child = await graphPost(`${IG_USER_ID}/media`, {
      image_url: imageUrl,
      is_carousel_item: "true",
    });
    childIds.push(child.id);
  }

  await Promise.all(
    childIds.map((childId, index) => waitForContainer(childId, `Carousel item ${index + 1}`))
  );

  creation = await graphPost(`${IG_USER_ID}/media`, {
    media_type: "CAROUSEL",
    children: childIds,
    caption: due.caption || "",
  });
  await waitForContainer(creation.id, "Carousel");
}

const published = await graphPost(`${IG_USER_ID}/media_publish`, {
  creation_id: creation.id,
});

due.published_at = new Date().toISOString();
due.instagram_media_id = published.id;

await fs.writeFile(POSTS_FILE, JSON.stringify(posts, null, 2) + "\n");
console.log(`Published Instagram post ${due.id} as media ${published.id}`);
