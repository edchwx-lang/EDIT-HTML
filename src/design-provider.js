import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

const defaultRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export async function validateSkillMetadata(skillPath) {
  const text = await readFile(skillPath, "utf8");
  const frontmatter = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!frontmatter) throw new Error("Skill requires YAML frontmatter");
  const data = parse(frontmatter[1]);
  const allowed = new Set(["name", "description", "license", "allowed-tools", "metadata"]);
  if (!data || Object.keys(data).some((key) => !allowed.has(key))) throw new Error("Unsupported Skill frontmatter field (use metadata.version)");
  if (typeof data.name !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(data.name) || data.name.length > 64) throw new Error("Skill name must be lower-case hyphenated");
  if (typeof data.description !== "string" || !data.description.trim() || data.description.length > 1024 || /[<>]/.test(data.description)) throw new Error("Invalid Skill description");
  return { name: data.name, version: data.metadata?.version ?? null };
}

export async function resolveHuashuProvider({ packageRoot = defaultRoot } = {}) {
  const vendorRoot = path.join(packageRoot, "skills", "edit-html", "vendor");
  const root = path.join(vendorRoot, "huashu-design");
  const manifest = JSON.parse(await readFile(path.join(vendorRoot, "huashu-design.manifest.json"), "utf8"));
  if (manifest.name !== "huashu-design" || manifest.license !== "MIT" || !manifest.files?.["SKILL.md"] || !manifest.files?.LICENSE) throw new Error("Invalid Huashu bundle manifest");
  const actualFiles = await list(root);
  const expectedFiles = Object.keys(manifest.files).sort();
  if (JSON.stringify(actualFiles) !== JSON.stringify(expectedFiles)) throw new Error("Huashu bundle integrity failed: missing or unexpected files");
  for (const name of expectedFiles) {
    if (name.includes("\\") || name.split("/").some((part) => part === ".." || !part) || path.isAbsolute(name)) throw new Error("Unsafe Huashu bundle path");
    const bytes = await readFile(path.join(root, ...name.split("/")));
    if (sha256(bytes) !== manifest.files[name]) throw new Error(`Huashu bundle hash integrity failed: ${name}`);
  }
  const skillPath = path.join(root, "SKILL.md");
  if ((await validateSkillMetadata(skillPath)).name !== "huashu-design") throw new Error("Invalid Huashu Skill identity");
  return { name: manifest.name, skillPath, skillSha256: manifest.files["SKILL.md"], fileCount: expectedFiles.length, license: manifest.license, provenance: manifest.provenance };
}

async function list(root, prefix = "") {
  const result = [];
  for (const entry of await readdir(path.join(root, prefix), { withFileTypes: true })) {
    const name = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) result.push(...await list(root, name));
    else if (entry.isFile()) result.push(name);
    else throw new Error(`Huashu bundle integrity rejects links: ${name}`);
  }
  return result.sort();
}
function sha256(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
