import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { buildYearContentCalendar } from "./build_year_content_calendar.mjs";

const REPO = process.env.GITHUB_REPOSITORY || "Avi-2024/buildkarbro";
const BRANCH = process.env.GITHUB_REF_NAME || "main";
const POSTS_FILE = process.env.POSTS_FILE || "posts.json";
const TIMEZONE = process.env.TIMEZONE || "Asia/Kolkata";
const REQUIRE_AI_IMAGE = process.env.REQUIRE_AI_IMAGE === "true";

function todayInTimezone(timeZone = TIMEZONE) {
  if (process.env.TARGET_DATE) return process.env.TARGET_DATE;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function escapeXml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function wrapWords(text, maxChars) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > maxChars && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, 5);
}

function textLines(lines, x, y, size, fill, weight = 800, gap = 1.08) {
  return lines.map((line, index) => (
    `<text x="${x}" y="${y + index * size * gap}" fill="${fill}" font-family="Inter, Arial, Helvetica, sans-serif" font-size="${size}" font-weight="${weight}">${escapeXml(line)}</text>`
  )).join("\n");
}

async function maybeGenerateAiHero(entry, outDir) {
  const provider = (process.env.IMAGE_PROVIDER || "").toLowerCase();
  const apiKey = process.env.IMAGE_API_KEY || process.env.OPENAI_API_KEY;
  if (!provider || !apiKey) return null;

  const prompt = `${entry.visualPrompt}\nBrand style: faceless premium creator, orange hoodie, minimal white studio, subtle blue/orange gradients. No words, no letters, no logos, no watermark.`;

  if (provider !== "openai") {
    console.log(`IMAGE_PROVIDER=${provider} is not implemented in this repo yet. Falling back to branded vector art.`);
    if (REQUIRE_AI_IMAGE) throw new Error(`Unsupported IMAGE_PROVIDER: ${provider}`);
    return null;
  }

  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: process.env.OPENAI_IMAGE_MODEL || "gpt-image-1",
      prompt,
      size: process.env.OPENAI_IMAGE_SIZE || "1024x1024",
      quality: process.env.OPENAI_IMAGE_QUALITY || "medium",
      n: 1
    })
  });

  if (!response.ok) {
    const body = await response.text();
    console.log(`OpenAI image generation failed: HTTP ${response.status} ${body.slice(0, 500)}`);
    if (REQUIRE_AI_IMAGE) throw new Error("AI image generation failed.");
    return null;
  }

  const data = await response.json();
  const image = data?.data?.[0];
  const heroPath = path.join(outDir, "hero.png");

  if (image?.b64_json) {
    await fs.writeFile(heroPath, Buffer.from(image.b64_json, "base64"));
    return heroPath;
  }

  if (image?.url) {
    const imageResponse = await fetch(image.url);
    if (!imageResponse.ok) throw new Error(`Generated image URL failed: HTTP ${imageResponse.status}`);
    await fs.writeFile(heroPath, Buffer.from(await imageResponse.arrayBuffer()));
    return heroPath;
  }

  if (REQUIRE_AI_IMAGE) throw new Error("AI image response did not contain b64_json or url.");
  return null;
}

function vectorCharacter() {
  return `
  <g transform="translate(692 455)">
    <ellipse cx="96" cy="320" rx="190" ry="54" fill="#E5E7EB" opacity=".65"/>
    <path d="M3 274c17-103 55-161 119-174 68 13 107 70 126 174 7 40-19 80-59 85-47 6-90 8-132 0-40-7-61-47-54-85Z" fill="#F97316"/>
    <path d="M48 270c19 19 49 30 88 30s67-10 85-30l10 69c-76 30-144 30-207 0l24-69Z" fill="#EA580C" opacity=".78"/>
    <circle cx="123" cy="81" r="70" fill="#F9A8D4"/>
    <path d="M69 70c14-47 78-74 124-33 25 23 27 60 6 89-39-21-83-34-130-56Z" fill="#111827"/>
    <path d="M79 108c29 23 68 33 118 22-11 34-36 54-74 54-36 0-59-24-44-76Z" fill="#FBCFE8"/>
    <path d="M86 198h75l21 63H61l25-63Z" fill="#111827" opacity=".16"/>
    <rect x="-35" y="250" width="97" height="28" rx="14" fill="#111827" opacity=".12"/>
    <rect x="146" y="250" width="110" height="28" rx="14" fill="#111827" opacity=".12"/>
  </g>`;
}

async function imageTag(heroPath) {
  if (!heroPath) return vectorCharacter();
  const raw = await fs.readFile(heroPath);
  const optimized = await sharp(raw).resize(430, 430, { fit: "cover" }).png().toBuffer();
  const b64 = optimized.toString("base64");
  return `
  <defs>
    <clipPath id="heroClip"><rect x="630" y="408" width="390" height="390" rx="54"/></clipPath>
  </defs>
  <rect x="622" y="400" width="406" height="406" rx="62" fill="#FFFFFF" opacity=".92" stroke="#FED7AA" stroke-width="6"/>
  <image href="data:image/png;base64,${b64}" x="630" y="408" width="390" height="390" clip-path="url(#heroClip)"/>`;
}

async function renderSlide(entry, slide, index, outDir, heroPath) {
  const titleLines = wrapWords(index === 0 ? entry.hook.toUpperCase() : slide.text.toUpperCase(), index === 0 ? 18 : 19);
  const body = index === 0 ? entry.title : `${slide.label}: ${slide.text}`;
  const bodyLines = wrapWords(body, 38);
  const titleSize = titleLines.length > 3 ? 56 : 66;
  const visual = await imageTag(heroPath);

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080">
  <defs>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#2563EB"/>
      <stop offset="1" stop-color="#F97316"/>
    </linearGradient>
    <radialGradient id="glowA"><stop offset="0" stop-color="#DBEAFE"/><stop offset="1" stop-color="#DBEAFE" stop-opacity="0"/></radialGradient>
    <radialGradient id="glowB"><stop offset="0" stop-color="#FFEDD5"/><stop offset="1" stop-color="#FFEDD5" stop-opacity="0"/></radialGradient>
    <filter id="shadow"><feDropShadow dx="0" dy="22" stdDeviation="22" flood-color="#1E293B" flood-opacity=".12"/></filter>
  </defs>
  <rect width="1080" height="1080" fill="#F8FAFC"/>
  <circle cx="950" cy="120" r="330" fill="url(#glowA)"/>
  <circle cx="90" cy="930" r="330" fill="url(#glowB)"/>
  <rect x="62" y="64" width="956" height="952" rx="58" fill="#FFFFFF" filter="url(#shadow)"/>
  <rect x="104" y="105" width="205" height="50" rx="25" fill="#111827"/>
  <text x="206" y="138" fill="#FFFFFF" font-family="Inter, Arial, Helvetica, sans-serif" font-size="22" font-weight="800" text-anchor="middle">BUILD KAR BRO</text>
  <text x="920" y="138" fill="#64748B" font-family="Inter, Arial, Helvetica, sans-serif" font-size="24" font-weight="700" text-anchor="end">${index + 1}/6</text>
  <rect x="104" y="205" width="88" height="10" rx="5" fill="url(#accent)"/>
  ${textLines(titleLines, 104, 305, titleSize, "#0F172A", 900, 1.04)}
  ${textLines(bodyLines, 108, 660, 31, "#475569", 600, 1.35)}
  ${visual}
  <rect x="104" y="900" width="872" height="1" fill="#E2E8F0"/>
  <text x="104" y="952" fill="#2563EB" font-family="Inter, Arial, Helvetica, sans-serif" font-size="27" font-weight="800">@buildkarbro</text>
  <text x="976" y="952" fill="#F97316" font-family="Inter, Arial, Helvetica, sans-serif" font-size="27" font-weight="800" text-anchor="end">SAVE THIS</text>
</svg>`;

  const target = path.join(outDir, `slide-${index + 1}.jpg`);
  await sharp(Buffer.from(svg)).jpeg({ quality: 92, mozjpeg: true }).toFile(target);
  return target;
}

async function main() {
  const calendar = buildYearContentCalendar();
  const targetDate = todayInTimezone();
  const entry = calendar.posts.find((post) => post.date === targetDate);

  if (!entry) {
    console.log(`No fixed calendar post found for ${targetDate}. Nothing queued.`);
    return;
  }

  const posts = JSON.parse(await fs.readFile(POSTS_FILE, "utf8"));
  if (!Array.isArray(posts)) throw new Error("posts.json must contain an array.");

  const alreadyExists = posts.some((post) => post.id === entry.queueId);
  if (alreadyExists) {
    console.log(`${entry.queueId} already exists in posts.json. Nothing to queue.`);
    return;
  }

  const outDir = path.join("assets", "daily", entry.date);
  await fs.mkdir(outDir, { recursive: true });
  const heroPath = await maybeGenerateAiHero(entry, outDir);

  const imagePaths = [];
  for (let index = 0; index < entry.slides.length; index += 1) {
    imagePaths.push(await renderSlide(entry, entry.slides[index], index, outDir, heroPath));
  }

  const imageUrls = imagePaths.map((file) => `https://raw.githubusercontent.com/${REPO}/${BRANCH}/${file.replaceAll(path.sep, "/")}`);

  posts.push({
    id: entry.queueId,
    publish_at: entry.publishAt,
    image_urls: imageUrls,
    caption: entry.caption,
    content_source: "content/buildkarbro-365-calendar.json",
    calendar_day: entry.dayNumber,
    pillar: entry.pillar,
    format: entry.format,
    ai_visual_used: Boolean(heroPath),
    published_at: null,
    instagram_media_id: null,
    instagram_permalink: null,
    instagram_username: null,
    verified_at: null,
    media_type: null,
    media_product_type: null,
    facebook_status: null,
    facebook_post_id: null,
    facebook_permalink: null
  });

  await fs.writeFile(POSTS_FILE, `${JSON.stringify(posts, null, 2)}\n`);
  console.log(`Queued ${entry.queueId} for ${entry.publishAt}`);
  console.log(`Generated ${imagePaths.length} carousel slide(s) in ${outDir}`);
}

await main();
