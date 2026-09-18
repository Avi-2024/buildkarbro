import fs from "node:fs/promises";
import path from "node:path";

const root = "assets/content-bank";
const days = (await fs.readdir(root, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

const summary = [];
for (const day of days) {
  const dir = path.join(root, day);
  const files = (await fs.readdir(dir)).filter((name) => /\.jpe?g$/i.test(name)).sort();
  const results = [];
  for (const file of files) {
    const full = path.join(dir, file);
    const bytes = new Uint8Array(await fs.readFile(full));
    const valid = bytes.length >= 10000 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes.at(-2) === 0xff && bytes.at(-1) === 0xd9;
    results.push({ file, bytes: bytes.length, valid, prefix: Buffer.from(bytes.slice(0, 4)).toString("hex"), suffix: Buffer.from(bytes.slice(-4)).toString("hex") });
  }
  summary.push({ day, valid: results.length > 0 && results.every((r) => r.valid), results });
}
console.log(JSON.stringify(summary, null, 2));
if (summary.some((day) => !day.valid)) process.exitCode = 0;
