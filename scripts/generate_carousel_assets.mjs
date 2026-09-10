import fs from "node:fs/promises";
import path from "node:path";

const slides = [
  ["first-post", "17 IDEAS.", "0 FINISHED.", "Ideas start karna easy hai. Finish karna game hai."],
  ["carousel-2", "IDEA BAHUT HAIN", "", "AI • Freelancing • Business • Coding • Content"],
  ["carousel-3", "PROBLEM IDEAS NAHI HAIN", "FOCUS NAHI HAI", "Too many tabs. Too little execution."],
  ["carousel-4", "EK TIME PAR", "EK PROJECT", "One target. One deadline. No distraction."],
  ["carousel-5", "7 DIN.", "EK GOAL.", "Ship something real this week."],
  ["carousel-6", "AB TUMHARI BAARI", "", "Choose one idea. Finish it. Then start the next."],
];

await fs.mkdir("assets-src", { recursive: true });

function esc(s) {
  return s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

for (let i = 0; i < slides.length; i += 1) {
  const [name, line1, line2, sub] = slides[i];
  const accent = i % 2 === 0 ? "#7C3AED" : "#2563EB";
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0B1020"/><stop offset="1" stop-color="#161B2E"/></linearGradient>
    <radialGradient id="glow"><stop offset="0" stop-color="${accent}" stop-opacity=".72"/><stop offset="1" stop-color="${accent}" stop-opacity="0"/></radialGradient>
    <filter id="shadow"><feDropShadow dx="0" dy="24" stdDeviation="26" flood-color="#000" flood-opacity=".45"/></filter>
  </defs>
  <rect width="1080" height="1080" fill="url(#bg)"/>
  <circle cx="860" cy="170" r="360" fill="url(#glow)"/>
  <circle cx="180" cy="920" r="300" fill="url(#glow)" opacity=".45"/>
  <rect x="100" y="105" width="880" height="870" rx="56" fill="#111827" fill-opacity=".78" stroke="#FFFFFF" stroke-opacity=".08" filter="url(#shadow)"/>
  <rect x="154" y="154" width="190" height="54" rx="27" fill="${accent}"/>
  <text x="249" y="190" fill="#fff" font-family="Arial,Helvetica,sans-serif" font-size="26" font-weight="700" text-anchor="middle">BUILD KAR BRO</text>
  <text x="154" y="430" fill="#F8FAFC" font-family="Arial,Helvetica,sans-serif" font-size="82" font-weight="800">${esc(line1)}</text>
  ${line2 ? `<text x="154" y="535" fill="${accent}" font-family="Arial,Helvetica,sans-serif" font-size="82" font-weight="800">${esc(line2)}</text>` : ""}
  <text x="154" y="650" fill="#CBD5E1" font-family="Arial,Helvetica,sans-serif" font-size="34" font-weight="500">${esc(sub)}</text>
  <rect x="154" y="760" width="772" height="2" fill="#FFFFFF" opacity=".12"/>
  <text x="154" y="842" fill="#94A3B8" font-family="Arial,Helvetica,sans-serif" font-size="28">@buildkarbro</text>
  <text x="924" y="842" fill="#64748B" font-family="Arial,Helvetica,sans-serif" font-size="28" text-anchor="end">${i + 1}/6</text>
</svg>`;
  await fs.writeFile(path.join("assets-src", `${name}.svg`), svg);
}

console.log("Generated 6 SVG carousel source files.");
