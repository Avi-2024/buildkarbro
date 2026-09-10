import fs from "node:fs/promises";

const PAGE_ID = process.env.FACEBOOK_PAGE_ID || "1392360773951187";
const RAW_ACCESS_TOKEN = (process.env.FACEBOOK_PAGE_ACCESS_TOKEN || "").trim();
const GRAPH_VERSION = process.env.META_GRAPH_VERSION || "v23.0";
const GRAPH_HOST = "https://graph.facebook.com/";
const POSTS_FILE = process.env.POSTS_FILE || "posts.json";

if (!RAW_ACCESS_TOKEN) {
  console.log("FACEBOOK_PAGE_ACCESS_TOKEN secret is not configured. Skipping Facebook publish.");
  process.exit(0);
}

if (/^Bearer\s+/i.test(RAW_ACCESS_TOKEN)) {
  throw new Error("FACEBOOK_PAGE_ACCESS_TOKEN must contain only the raw access token, without a Bearer prefix.");
}

if (/\s/.test(RAW_ACCESS_TOKEN)) {
  throw new Error("FACEBOOK_PAGE_ACCESS_TOKEN contains whitespace. Save only the raw token in the GitHub secret.");
}

if (/^[\"'`]|[\"'`]$/.test(RAW_ACCESS_TOKEN)) {
  throw new Error("FACEBOOK_PAGE_ACCESS_TOKEN appears to be quoted. Save only the raw token in the GitHub secret.");
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

async function graphGet(accessToken, path, params = {}) {
  const url = new URL(`${GRAPH_HOST}${GRAPH_VERSION}/${path}`);
  url.searchParams.set("access_token", accessToken);

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
  }

  const response = await fetch(url);
  const data = await response.json();

  if (!response.ok || data.error) throw new Error(graphError(response, data));
  return data;
}

async function graphPost(accessToken, path, params = {}) {
  const url = new URL(`${GRAPH_HOST}${GRAPH_VERSION}/${path}`);
  const body = new URLSearchParams({ access_token: accessToken });

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

function publicPage(page) {
  return {
    id: page.id,
    name: page.name || null,
    link: page.link || null,
  };
}

async function resolvePageContext() {
  let directError = null;
  let accountsError = null;
  let directPage = null;

  // Important: a System User/User token can sometimes read the Page but still cannot
  // create unpublished photos. For multi-photo posts we must publish as the Page,
  // so first try to exchange/resolve an embedded Page access token.
  try {
    const page = await graphGet(RAW_ACCESS_TOKEN, PAGE_ID, {
      fields: "id,name,link,access_token",
    });

    directPage = publicPage(page);
    console.log(`Facebook Page verified directly: ${page.name || "unknown"} (${page.id}).`);

    if (page.access_token) {
      console.log("Resolved Page access token from direct Page lookup.");
      return { pageAccessToken: page.access_token, page: directPage, tokenSource: "page_lookup" };
    }

    console.log("Direct Page lookup did not return an embedded Page token; checking /me/accounts next.");
  } catch (error) {
    directError = error;
    console.warn(`Direct Page lookup failed with provided token: ${error.message}`);
  }

  try {
    const accounts = await graphGet(RAW_ACCESS_TOKEN, "me/accounts", {
      fields: "id,name,access_token,tasks,link",
      limit: 100,
    });

    const page = (accounts.data || []).find((item) => String(item.id) === String(PAGE_ID));

    if (!page) {
      throw new Error(
        `Page ${PAGE_ID} was not returned by /me/accounts. Assign the Build Kar Bro Page asset to this token's user/system user with CREATE_CONTENT or Full Control, then generate a fresh token.`
      );
    }

    if (!page.access_token) {
      throw new Error(
        `Page ${PAGE_ID} was returned by /me/accounts, but no Page access_token was returned. Regenerate the token with pages_show_list, pages_read_engagement, and pages_manage_posts.`
      );
    }

    console.log(`Resolved Facebook Page token from /me/accounts: ${page.name || "unknown"} (${page.id}).`);
    if (Array.isArray(page.tasks)) console.log(`Page tasks: ${page.tasks.join(", ") || "none"}.`);

    return {
      pageAccessToken: page.access_token,
      page: publicPage(page),
      tokenSource: "me_accounts",
    };
  } catch (error) {
    accountsError = error;
  }

  // Last fallback: if the secret itself is already a real Page access token,
  // direct lookup succeeds but access_token may not be returned. Use it and let
  // the write call prove it. If it is only a System User token, Facebook will
  // return #200 with a clearer custom message below.
  if (directPage) {
    console.log("Using provided token as the Page token because the Page lookup succeeded.");
    return { pageAccessToken: RAW_ACCESS_TOKEN, page: directPage, tokenSource: "provided_token" };
  }

  throw new Error(
    [
      "Facebook Page access failed.",
      `Target Page ID: ${PAGE_ID}.`,
      "Use a real Page access token, or a system/user token that can access the Page and return its Page token via /me/accounts or /{page-id}?fields=access_token.",
      "For a System User token: Business Settings -> Users -> System Users -> select user -> Add Assets -> Pages -> Build Kar Bro -> Full Control/CREATE_CONTENT, then Generate New Token with pages_manage_posts, pages_read_engagement, pages_show_list, business_management.",
      `Direct Page error: ${directError?.message || "not checked"}`,
      `me/accounts error: ${accountsError?.message || "not checked"}`,
    ].join("\n")
  );
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

try {
  if (target.facebook_status === "publishing") {
    console.log(`Facebook publish was already in progress for ${target.id}; retrying safely.`);
  }

  const { pageAccessToken, page, tokenSource } = await resolvePageContext();

  console.log(`Publishing Facebook Page post for ${target.id} with ${target.image_urls.length} image(s).`);
  console.log(`Facebook token source: ${tokenSource}.`);

  target.facebook_status = "publishing";
  target.facebook_started_at = new Date().toISOString();
  delete target.facebook_error;
  delete target.facebook_failed_at;
  await savePosts(posts);

  const photoIds = [];

  for (const [index, imageUrl] of target.image_urls.entries()) {
    let uploaded;

    try {
      uploaded = await graphPost(pageAccessToken, `${PAGE_ID}/photos`, {
        url: imageUrl,
        published: "false",
      });
    } catch (error) {
      if (String(error.message).includes("Unpublished posts must be posted to a page as the page itself")) {
        throw new Error(
          [
            "The token can read the Page, but it is not acting as the Page for unpublished photo uploads.",
            "Use the actual Page access token, not only the System User/User token.",
            "In Graph API Explorer or API, run: GET /" + PAGE_ID + "?fields=id,name,access_token",
            "Copy the returned access_token from the Page object into GitHub secret FACEBOOK_PAGE_ACCESS_TOKEN.",
            `Original Facebook error: ${error.message}`,
          ].join("\n")
        );
      }

      if (String(error.message).includes("pages_manage_posts")) {
        throw new Error(
          [
            "Facebook publishing permission is missing from this Meta app/token.",
            "Required permission: pages_manage_posts.",
            "Open Meta Developers -> Build Kar Bro Auto Publisher -> Use cases / Permissions and Features, then add/request pages_manage_posts.",
            "After enabling it, generate a fresh System User/Page token and update GitHub secret FACEBOOK_PAGE_ACCESS_TOKEN.",
            `Original Facebook error: ${error.message}`,
          ].join("\n")
        );
      }

      throw error;
    }

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

  const feed = await graphPost(pageAccessToken, `${PAGE_ID}/feed`, feedParams);
  if (!feed.id) throw new Error("Facebook did not return a post id after publishing the feed post.");

  let permalink = null;
  try {
    const details = await graphGet(pageAccessToken, feed.id, { fields: "id,permalink_url,created_time" });
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
  target.facebook_token_source = tokenSource;
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
