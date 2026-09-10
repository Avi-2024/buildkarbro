#!/usr/bin/env bash
set -euo pipefail

RAW_PREFIX="https://raw.githubusercontent.com/Avi-2024/buildkarbro/main/"
MANIFEST="$(mktemp)"
trap 'rm -f "$MANIFEST"' EXIT

node --input-type=module > "$MANIFEST" <<'NODE'
import fs from "node:fs";

const prefix = "https://raw.githubusercontent.com/Avi-2024/buildkarbro/main/";
const posts = JSON.parse(fs.readFileSync("posts.json", "utf8"));
const seen = new Set();

for (const post of posts) {
  if (post.published_at || !Array.isArray(post.image_urls)) continue;

  for (const imageUrl of post.image_urls) {
    if (typeof imageUrl !== "string" || !imageUrl.startsWith(prefix)) continue;
    if (!/\.(png|webp)$/i.test(imageUrl)) continue;

    const source = decodeURIComponent(imageUrl.slice(prefix.length));
    if (!source || source.startsWith("/") || source.split("/").includes("..") || /[\t\r\n]/.test(source)) continue;

    const target = source.replace(/\.(png|webp)$/i, ".jpg");
    const key = `${source}\t${target}`;
    if (!seen.has(key)) {
      seen.add(key);
      process.stdout.write(`${key}\n`);
    }
  }
}
NODE

if [[ ! -s "$MANIFEST" ]]; then
  echo "No PNG/WebP Instagram assets need conversion."
  exit 0
fi

if ! command -v convert >/dev/null 2>&1; then
  echo "Installing ImageMagick..."
  sudo apt-get update -qq
  sudo apt-get install -y -qq imagemagick
fi

while IFS=$'\t' read -r source target; do
  [[ -f "$source" ]] || { echo "Missing source asset: $source" >&2; exit 1; }
  mkdir -p "$(dirname "$target")"

  echo "Converting $source -> $target"
  convert "$source" \
    -background white \
    -alpha remove \
    -alpha off \
    -resize '1080x1350>' \
    -strip \
    -sampling-factor 4:2:0 \
    -quality 92 \
    "$target"
done < "$MANIFEST"

node --input-type=module <<'NODE'
import fs from "node:fs";

const prefix = "https://raw.githubusercontent.com/Avi-2024/buildkarbro/main/";
const posts = JSON.parse(fs.readFileSync("posts.json", "utf8"));
let changed = false;

for (const post of posts) {
  if (post.published_at || !Array.isArray(post.image_urls)) continue;

  post.image_urls = post.image_urls.map((imageUrl) => {
    if (typeof imageUrl !== "string" || !imageUrl.startsWith(prefix) || !/\.(png|webp)$/i.test(imageUrl)) {
      return imageUrl;
    }

    changed = true;
    return imageUrl.replace(/\.(png|webp)$/i, ".jpg");
  });
}

if (changed) {
  fs.writeFileSync("posts.json", JSON.stringify(posts, null, 2) + "\n");
  console.log("Updated posts.json to use JPEG media URLs.");
}
NODE
