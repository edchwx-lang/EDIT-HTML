// Maintainer-only snapshot operation; never run by the installer.
import { cp, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const source = path.resolve(process.argv[2] ?? "");
if (!process.argv[2]) throw new Error("Usage: node scripts/vendor-huashu.mjs <local-huashu-design>");
const target = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../skills/edit-html/vendor/huashu-design");
try { await readdir(target); throw new Error("Refusing to overwrite an existing snapshot"); }
catch (error) { if (error.code !== "ENOENT") throw error; }
const excluded = new Set([".git", ".gitignore", "package-lock.json", "node_modules", ".env", ".env.local", ".DS_Store", "Thumbs.db", ".idea", ".vscode", "personal-asset-index.json"]);
const files = {};
async function copy(directory, prefix = "") {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (excluded.has(entry.name) || entry.name.startsWith("_narration") || entry.name.startsWith("video-tmp") || /\.(?:mp4|swp)$/.test(entry.name)) continue;
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) await copy(path.join(directory, entry.name), relative);
    else if (entry.isFile()) {
      const destination = path.join(target, ...relative.split("/"));
      await mkdir(path.dirname(destination), { recursive: true });
      await cp(path.join(directory, entry.name), destination);
      files[relative] = createHash("sha256").update(await readFile(destination)).digest("hex");
    } else throw new Error(`Refusing symlink in provider: ${relative}`);
  }
}
await copy(source);
const manifest = {
  schemaVersion: 1, name: "huashu-design", license: "MIT",
  provenance: { type: "local-file-snapshot", author: "alchaincyf (花叔 · 花生)", capturedAt: new Date().toISOString(), modified: false },
  exclusions: [...excluded, "temporary narration/video outputs", "*.mp4", "*.swp"],
  files: Object.fromEntries(Object.entries(files).sort(([a], [b]) => a.localeCompare(b, "en")))
};
await writeFile(path.join(target, "../huashu-design.manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log(`Vendored ${Object.keys(files).length} original files; SHA256 ${files["SKILL.md"]}`);
