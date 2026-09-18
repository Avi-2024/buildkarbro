import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { selectDuePost } from "./social_queue.mjs";

const POSTS_FILE = process.env.POSTS_FILE || "posts.json";

function localContentBankPath(imageUrl) {
  const parsed = new URL(imageUrl);
  const marker = "/assets/content-bank/";
  const idx = parsed.pathname.indexOf(marker);
  if (idx === -1) {
    throw new Error(`Refusing to normalize non-content-bank media: ${imageUrl}`);
  }

  const relative = decodeURIComponent(parsed.pathname.slice(idx + 1));
  if (relative.includes("..")) throw new Error("Unsafe content-bank path.");
  return relative;
}

function isCompleteJpeg(bytes) {
  return (
    bytes.length >= 10_000 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes.at(-2) === 0xff &&
    bytes.at(-1) === 0xd9
  );
}

const posts = JSON.parse(await fs.readFile(POSTS_FILE, "utf8"));
if (!Array.isArray(posts)) throw new Error("posts.json must contain a JSON array.");

const due = selectDuePost(posts);
if (!due) {
  console.log("No due pushed content-bank carousel.");
  process.exit(0);
}

for (let index = 0; index < due.image_urls.length; index += 1) {
  const localPath = localContentBankPath(due.image_urls[index]);
  const original = new Uint8Array(await fs.readFile(localPath));

  if (isCompleteJpeg(original)) {
    console.log(`Pushed slide ${index + 1}/${due.image_urls.length} already valid: ${localPath}`);
    continue;
  }

  console.log(`Normalizing pushed slide ${index + 1}/${due.image_urls.length}: ${localPath}`);
  const tmpPath = `${localPath}.normalized.jpg`;

  try {
    await sharp(Buffer.from(original), { failOn: "none" })
      .jpeg({ quality: 100, chromaSubsampling: "4:4:4" })
      .toFile(tmpPath);

    const normalized = new Uint8Array(await fs.readFile(tmpPath));
    if (!isCompleteJpeg(normalized)) {
      throw new Error("normalized output is still not a complete JPEG");
    }

    await fs.rename(tmpPath, localPath);
    console.log(`Repaired original pushed slide without generating replacement content: ${localPath}`);
  } catch (error) {
    await fs.rm(tmpPath, { force: true }).catch(() => {});
    throw new Error(
      `Pushed carousel asset ${localPath} is unreadable and cannot be normalized. Replace that original GitHub asset. ${error.message}`
    );
  }
}
