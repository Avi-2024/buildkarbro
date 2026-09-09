import fs from "node:fs/promises";

const IG_USER_ID = process.env.IG_USER_ID;
const ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;
const GRAPH_VERSION = process.env.META_GRAPH_VERSION || "v23.0";
const POSTS_FILE = process.env.POSTS_FILE || "posts.json";

if (!IG_USER_ID || !ACCESS_TOKEN) throw new Error("Missing IG_USER_ID or META_ACCESS_TOKEN secret.");

async function graph(path, params = {}) {
  const url = new URL("https://graph.facebook.com/" + GRAPH_VERSION + "/" + path);
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) body.set(key, Array.isArray(value) ? value.join(",") : String(value));
  const response = await fetch(url, { method: "POST", headers: {"content-type":"application/x-www-form-urlencoded"}, body });
  const data = await response.json();
  if (!response.ok || data.error) throw new Error(data.error?.message || ("Graph API request failed (" + response.status + ")"));
  return data;
}

const posts = JSON.parse(await fs.readFile(POSTS_FILE, "utf8"));
const due = posts.find(p => !p.published_at && p.publish_at && new Date(p.publish_at).getTime() <= Date.now());
if (!due) { console.log("No due Instagram post."); process.exit(0); }
if (!Array.isArray(due.image_urls) || due.image_urls.length === 0) throw new Error("Post has no image_urls.");

let creation;
if (due.image_urls.length === 1) {
  creation = await graph(IG_USER_ID + "/media", {image_url: due.image_urls[0], caption: due.caption || ""});
} else {
  const childIds = [];
  for (const imageUrl of due.image_urls) {
    const child = await graph(IG_USER_ID + "/media", {image_url: imageUrl, is_carousel_item: "true"});
    childIds.push(child.id);
  }
  creation = await graph(IG_USER_ID + "/media", {media_type: "CAROUSEL", children: childIds, caption: due.caption || ""});
}
const published = await graph(IG_USER_ID + "/media_publish", {creation_id: creation.id});
due.published_at = new Date().toISOString();
due.instagram_media_id = published.id;
await fs.writeFile(POSTS_FILE, JSON.stringify(posts, null, 2) + "\n");
console.log("Published Instagram post " + due.id);
