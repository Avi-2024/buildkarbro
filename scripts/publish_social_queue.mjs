import fs from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { selectDuePost } from "./social_queue.mjs";

export async function publishDueQueue({ readPosts, run, maxPosts = 3, requireFacebook = false }) {
  const completed = [];
  // Resume verification or Facebook publishing interrupted by an earlier run.
  await run("verify_instagram_publish.mjs");
  await run("publish_facebook.mjs");
  for (let index = 0; index < maxPosts; index++) {
    const due = selectDuePost(await readPosts());
    if (!due) break;
    await run("preflight_instagram.mjs");
    await run("publish_instagram.mjs");
    let saved = (await readPosts()).find(post => post.id === due.id);
    if (!saved?.published_at || !saved.instagram_media_id) {
      throw new Error(`Post ${due.id} is still unpublished${saved?.instagram_retry_after ? `; cooldown until ${saved.instagram_retry_after}` : ""}. Stopping without advancing the queue.`);
    }
    await run("verify_instagram_publish.mjs");
    await run("publish_facebook.mjs");
    saved = (await readPosts()).find(post => post.id === due.id);
    if (!saved?.verified_at || !saved.instagram_permalink) throw new Error(`Post ${due.id} has not been verified on Instagram.`);
    if (requireFacebook && !saved.facebook_post_id) throw new Error(`Post ${due.id} has not been published to Facebook.`);
    completed.push(saved);
  }
  return completed;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const postsFile = process.env.POSTS_FILE || "posts.json";
  const completed = await publishDueQueue({
    readPosts: async () => JSON.parse(await fs.readFile(postsFile, "utf8")),
    requireFacebook: Boolean(process.env.FACEBOOK_PAGE_ACCESS_TOKEN?.trim()),
    run: async (script) => {
      const result = spawnSync(process.execPath, [fileURLToPath(new URL(script, import.meta.url))], { stdio: "inherit", env: process.env });
      if (result.error) throw result.error;
      if (result.status !== 0) throw new Error(`${script} failed (${result.status ?? result.signal}).`);
    },
  });
  console.log(`Completed ${completed.length} due queue post(s).`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    const rows = completed.map(post => `| ${post.publish_at} | ${post.id} | [View](${post.instagram_permalink}) | ${post.facebook_permalink ? `[View](${post.facebook_permalink})` : "Not published"} |`);
    await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, `Completed ${completed.length} due queue post(s).\n\n| Scheduled | Post | Instagram | Facebook |\n| --- | --- | --- | --- |\n${rows.join("\n")}\n`);
  }
}
