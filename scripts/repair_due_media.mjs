import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { selectDuePost } from "./social_queue.mjs";

const POSTS_FILE = process.env.POSTS_FILE || "posts.json";
const REPO = process.env.GITHUB_REPOSITORY || "Avi-2024/buildkarbro";
const BRANCH = process.env.GITHUB_REF_NAME || "main";

function escapeXml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function wrapWords(text, maxChars = 30, maxLines = 8) {
  const words = String(text || "").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const lines = [];
  let line = "";

  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (line && next.length > maxChars) {
      lines.push(line);
      line = word;
      if (lines.length >= maxLines) break;
    } else {
      line = next;
    }
  }

  if (line && lines.length < maxLines) lines.push(line);
  return lines;
}

function textLines(lines, x, y, size, fill, weight = 700, gap = 1.18) {
  return lines.map((line, index) =>
    `<text x="${x}" y="${y + index * size * gap}" fill="${fill}" font-family="Arial, Helvetica, sans-serif" font-size="${size}" font-weight="${weight}">${escapeXml(line)}</text>`
  ).join("\\n");
}

function safeId(value) {
  return String(value || "recovered-post")
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120) || "recovered-post";
}

function splitCaption(post, slideCount) {
  const caption = String(post.caption || "").replace(/\r/g, "").trim();
  const blocks = caption.split(/\n+/).map((part) => part.trim()).filter(Boolean);
  const headline = blocks[0] || String(post.id || "Build Kar Bro").replaceAll("-", " ");
  const body = blocks.slice(1).join(" ").replace(/#[A-Za-z0-9_]+/g, "").trim();

  const sentences = body
    .split(/(?<=[.!?])\\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

  const slideBodies = Array.from({ length: slideCount }, () => []);
  for (let index = 0; index < sentences.length; index += 1) {
    const target = Math.min(slideCount - 1, Math.floor(index * slideCount / Math.max(sentences.length, 1)));
    slideBodies[target].push(sentences[index]);
  }

  return {
    headline,
    bodies: slideBodies.map((parts, index) =>
      parts.join(" ") || (index === 0 ? "Practical ideas. Clear execution. Build, test, improve." : "Keep it simple, useful and consistent.")
    ),
  };
}

async function inspectJpeg(imageUrl) {
  let parsed;
  try {
    parsed = new URL(imageUrl);
  } catch {
    return { ok: false, reason: "invalid URL" };
  }

  if (parsed.protocol !== "https:") return { ok: false, reason: "URL is not HTTPS" };
  if (!/\.jpe?g$/i.test(parsed.pathname)) return { ok: false, reason: "URL is not .jpg/.jpeg" };

  let response;
  try {
    response = await fetch(imageUrl, { redirect: "follow" });
  } catch (error) {
    return { ok: false, reason: `fetch failed: ${error.message}` };
  }

  if (!response.ok) return { ok: false, reason: `HTTP ${response.status}` };

  const contentType = (response.headers.get("content-type") || "").toLowerCase();
  if (!contentType.startsWith("image/jpeg")) {
    return { ok: false, reason: `content-type ${contentType || "unknown"}` };
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  const complete =
    bytes.length >= 10_000 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes.at(-2) === 0xff &&
    bytes.at(-1) === 0xd9;

  return complete
    ? { ok: true, bytes: bytes.length }
    : { ok: false, reason: `invalid/incomplete JPEG (${bytes.length} bytes)` };
}

async function validatePostMedia(post) {
  if (!Array.isArray(post.image_urls) || post.image_urls.length < 1 || post.image_urls.length > 10) {
    return { ok: false, reason: "image_urls must contain 1-10 items" };
  }

  for (let index = 0; index < post.image_urls.length; index += 1) {
    const result = await inspectJpeg(post.image_urls[index]);
    if (!result.ok) {
      return { ok: false, reason: `image ${index + 1}: ${result.reason}` };
    }
  }

  return { ok: true };
}

async function renderRecoveredSlide({ headline, body, index, slideCount, outDir }) {
  const titleLines = wrapWords(headline.toUpperCase(), 23, 4);
  const bodyLines = wrapWords(body, 42, 8);
  const titleSize = titleLines.length >= 4 ? 54 : 64;

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080">
  <defs>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#2563EB"/>
      <stop offset="1" stop-color="#F97316"/>
    </linearGradient>
    <radialGradient id="blueGlow"><stop offset="0" stop-color="#DBEAFE"/><stop offset="1" stop-color="#DBEAFE" stop-opacity="0"/></radialGradient>
    <radialGradient id="orangeGlow"><stop offset="0" stop-color="#FFEDD5"/><stop offset="1" stop-color="#FFEDD5" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="1080" height="1080" fill="#F8FAFC"/>
  <circle cx="940" cy="100" r="310" fill="url(#blueGlow)"/>
  <circle cx="120" cy="940" r="320" fill="url(#orangeGlow)"/>
  <rect x="62" y="62" width="956" height="956" rx="58" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="2"/>
  <rect x="104" y="104" width="218" height="52" rx="26" fill="#111827"/>
  <text x="213" y="139" fill="#FFFFFF" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="800" text-anchor="middle">BUILD KAR BRO</text>
  <text x="976" y="139" fill="#64748B" font-family="Arial, Helvetica, sans-serif" font-size="23" font-weight="700" text-anchor="end">${index + 1}/${slideCount}</text>
  <rect x="104" y="205" width="96" height="10" rx="5" fill="url(#accent)"/>
  ${textLines(titleLines, 104, 315, titleSize, "#0F172A", 900, 1.06)}
  <rect x="104" y="585" width="872" height="250" rx="34" fill="#F8FAFC" stroke="#E2E8F0" stroke-width="2"/>
  ${textLines(bodyLines, 142, 650, 30, "#334155", 650, 1.36)}
  <rect x="104" y="904" width="872" height="1" fill="#E2E8F0"/>
  <text x="104" y="958" fill="#2563EB" font-family="Arial, Helvetica, sans-serif" font-size="27" font-weight="800">@buildkarbro</text>
  <text x="976" y="958" fill="#F97316" font-family="Arial, Helvetica, sans-serif" font-size="27" font-weight="800" text-anchor="end">SAVE THIS</text>
</svg>`;

  const target = path.join(outDir, `slide-${index + 1}.jpg`);
  await sharp(Buffer.from(svg))
    .jpeg({ quality: 92, chromaSubsampling: "4:4:4" })
    .toFile(target);

  return target;
}

const posts = JSON.parse(await fs.readFile(POSTS_FILE, "utf8"));
if (!Array.isArray(posts)) throw new Error("posts.json must contain a JSON array.");

const due = selectDuePost(posts);
if (!due) {
  console.log("No due Instagram post to inspect.");
  process.exit(0);
}

const validation = await validatePostMedia(due);
if (validation.ok) {
  console.log(`Due post ${due.id} already has valid public JPEG media.`);
  process.exit(0);
}

console.log(`Repairing media for ${due.id}: ${validation.reason}`);

const slideCount = Math.min(10, Math.max(1, Array.isArray(due.image_urls) ? due.image_urls.length : 6));
const outDir = path.join("assets", "recovered", safeId(due.id));
await fs.mkdir(outDir, { recursive: true });

const content = splitCaption(due, slideCount);
const generated = [];

for (let index = 0; index < slideCount; index += 1) {
  generated.push(await renderRecoveredSlide({
    headline: content.headline,
    body: content.bodies[index],
    index,
    slideCount,
    outDir,
  }));
}

due.image_urls = generated.map((file) =>
  `https://raw.githubusercontent.com/${REPO}/${BRANCH}/${file.replaceAll(path.sep, "/")}`
);
due.media_repaired_at = new Date().toISOString();
due.media_repair_reason = validation.reason;

await fs.writeFile(POSTS_FILE, `${JSON.stringify(posts, null, 2)}\n`);
console.log(`Recovered ${generated.length} JPEG slide(s) for ${due.id}.`);
