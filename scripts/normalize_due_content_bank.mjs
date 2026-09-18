import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { selectDuePost } from "./social_queue.mjs";

const POSTS_FILE = process.env.POSTS_FILE || "posts.json";

function localContentBankPath(imageUrl) {
  const parsed = new URL(imageUrl);
  const marker = "/assets/content-bank/";
  const idx = parsed.pathname.indexOf(marker);
  if (idx === -1) throw new Error("Refusing to normalize non-content-bank media: " + imageUrl);
  const relative = decodeURIComponent(parsed.pathname.slice(idx + 1));
  if (relative.includes("..")) throw new Error("Unsafe content-bank path.");
  return relative;
}

function isCompleteJpeg(bytes) {
  return bytes.length >= 10000 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes.at(-2) === 0xff && bytes.at(-1) === 0xd9;
}

function looksLikeJpeg(bytes) {
  return bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8;
}

function decodeEmbeddedBase64(original) {
  const text = Buffer.from(original).toString("utf8").trim();
  const start = text.includes("/9j/") ? text.indexOf("/9j/") : -1;
  if (start === -1) return null;
  const candidateText = text.slice(start).replace(/[^A-Za-z0-9+/=]/g, "");
  if (candidateText.length < 1000) return null;
  try {
    const decoded = Buffer.from(candidateText, "base64");
    return looksLikeJpeg(decoded) ? decoded : null;
  } catch {
    return null;
  }
}

async function normalizeOriginal(bytes, localPath) {
  const attempts = [];
  if (looksLikeJpeg(bytes)) attempts.push(Buffer.concat([Buffer.from(bytes), Buffer.from([0xff, 0xd9])]));
  const embedded = decodeEmbeddedBase64(bytes);
  if (embedded) attempts.push(isCompleteJpeg(embedded) ? embedded : Buffer.concat([embedded, Buffer.from([0xff, 0xd9])]));

  for (const candidate of attempts) {
    const tmpPath = localPath + ".normalized.jpg";
    try {
      await sharp(candidate, { failOn: "none" }).jpeg({ quality: 100, chromaSubsampling: "4:4:4" }).toFile(tmpPath);
      const normalized = new Uint8Array(await fs.readFile(tmpPath));
      if (!isCompleteJpeg(normalized)) {
        await fs.rm(tmpPath, { force: true });
        continue;
      }
      await fs.rename(tmpPath, localPath);
      return normalized.length;
    } catch {
      await fs.rm(tmpPath, { force: true }).catch(() => {});
    }
  }
  throw new Error("original pushed bytes are not recoverable as the same JPEG artwork");
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
    console.log("Pushed slide " + (index + 1) + "/" + due.image_urls.length + " already valid: " + localPath);
    continue;
  }
  const prefix = Buffer.from(original.slice(0, 12)).toString("hex");
  const suffix = Buffer.from(original.slice(-12)).toString("hex");
  console.log("Repairing original pushed slide " + (index + 1) + "/" + due.image_urls.length + ": " + localPath + " (bytes=" + original.length + ", prefix=" + prefix + ", suffix=" + suffix + ")");
  try {
    const normalizedSize = await normalizeOriginal(original, localPath);
    console.log("Repaired original pushed slide without replacement content: " + localPath + " (" + normalizedSize + " bytes)");
  } catch (error) {
    throw new Error("Pushed carousel asset " + localPath + " cannot be repaired without changing its artwork. Replace the original GitHub asset. " + error.message);
  }
}
