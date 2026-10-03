import assert from "node:assert/strict";
import test from "node:test";
import { publishDueQueue } from "../scripts/publish_social_queue.mjs";
import { selectDuePost } from "../scripts/social_queue.mjs";

function fixture() {
  const posts = [1, 2, 3, 4].map(day => ({
    id: `post-${day}`, publish_at: day === 4 ? "2099-01-01T09:00:00+05:30" : `2026-01-0${day}T09:00:00+05:30`,
    manual_approved: true, ai_visual_used: true,
    image_urls: [`https://example.com/assets/approved/day-${day}/slide-1.jpg`],
  }));
  const published = [];
  const readPosts = async () => structuredClone(posts);
  const run = async script => {
    if (script === "publish_instagram.mjs") {
      const post = selectDuePost(posts);
      published.push(post.id);
      Object.assign(post, {published_at: new Date().toISOString(), instagram_media_id: `media-${post.id}`});
    }
    if (script === "verify_instagram_publish.mjs") for (const post of posts.filter(p => p.instagram_media_id)) Object.assign(post, {verified_at: "verified", instagram_permalink: `https://instagram.com/${post.id}`});
    if (script === "publish_facebook.mjs") for (const post of posts.filter(p => p.verified_at)) Object.assign(post, {facebook_post_id: `facebook-${post.id}`});
  };
  return {posts, published, readPosts, run};
}

test("clears three overdue entries in order and leaves tomorrow unpublished", async () => {
  const f = fixture();
  const completed = await publishDueQueue({...f, requireFacebook: true});
  assert.deepEqual(f.published, ["post-1", "post-2", "post-3"]);
  assert.equal(completed.length, 3);
  assert.equal(f.posts[3].published_at, undefined);
  assert.ok(completed.every(p => p.verified_at && p.facebook_post_id));
});

test("already published entries are not reposted", async () => {
  const f = fixture();
  Object.assign(f.posts[0], {published_at: "2026-01-01T10:00:00Z", instagram_media_id: "old-media"});
  await publishDueQueue({...f, requireFacebook: true});
  assert.deepEqual(f.published, ["post-2", "post-3"]);
  assert.equal(f.posts[0].instagram_media_id, "old-media");
});

test("no-op rate-limit response stops without claiming completion or advancing", async () => {
  const f = fixture();
  await assert.rejects(publishDueQueue({...f, run: async script => { if (script !== "publish_instagram.mjs") await f.run(script); }}), /still unpublished/);
  assert.deepEqual(f.published, []);
});

test("failed Facebook publish stops before starting the next Instagram post", async () => {
  const f = fixture();
  await assert.rejects(publishDueQueue({...f, requireFacebook: true, run: async script => { if (script !== "publish_facebook.mjs") await f.run(script); }}), /not been published to Facebook/);
  assert.deepEqual(f.published, ["post-1"]);
});

test("unapproved or fallback entries are not published", async () => {
  const f = fixture();
  f.posts[0].ai_visual_used = false;
  f.posts[1].manual_approved = false;
  await publishDueQueue(f);
  assert.deepEqual(f.published, ["post-3"]);
});
