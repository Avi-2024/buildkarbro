import fs from "node:fs/promises";
import { isApprovedPost } from "./social_queue.mjs";

const posts = JSON.parse(await fs.readFile("posts.json", "utf8"));
const planFile = process.argv[2] || "content/approved-oct-23-29.json";
const plan = JSON.parse(await fs.readFile(planFile, "utf8"));
for (const entry of plan.posts) {
  const matches = posts.filter(post => post.publish_at?.slice(0, 10) === entry.date && !post.skipped_at);
  if (matches.length !== 1) throw new Error(`Expected exactly one post for ${entry.date}.`);
  const post = matches[0];
  if (!isApprovedPost(post) || post.image_urls.length !== 6) throw new Error(`Unapproved or incomplete carousel: ${entry.date}`);
  if (post.publish_at !== `${entry.date}T09:00:00+05:30`) throw new Error(`Wrong publish time: ${entry.date}`);
  for (let n = 1; n <= 6; n++) {
    const file = `assets/approved/${entry.date}/slide-${n}.jpg`;
    const bytes = await fs.readFile(file);
    if (post.image_urls[n - 1] !== `https://raw.githubusercontent.com/Avi-2024/buildkarbro/main/${file}`) throw new Error(`Wrong image URL: ${file}`);
    if (bytes.length < 10000 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes.at(-2) !== 0xff || bytes.at(-1) !== 0xd9) throw new Error(`Invalid JPEG: ${file}`);
  }
  console.log(`Verified ${entry.date}: six approved AI images, 09:00 IST.`);
}
