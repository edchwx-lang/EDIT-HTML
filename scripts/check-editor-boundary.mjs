import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export async function verifyEditorBoundary(root) {
  const lock = JSON.parse(await readFile(path.join(root, "editor-boundary.lock.json"), "utf8"));
  const mismatches = [];
  for (const [relative, expected] of Object.entries(lock.files)) {
    const actual = createHash("sha256")
      .update(await readFile(path.join(root, relative)))
      .digest("hex");
    if (actual !== expected) mismatches.push(`${relative}: expected ${expected}, got ${actual}`);
  }
  return { ok: mismatches.length === 0, checked: Object.keys(lock.files).length, mismatches };
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const result = await verifyEditorBoundary(root);
  if (!result.ok) {
    process.stderr.write(result.mismatches.join("\n") + "\n");
    process.exitCode = 1;
  } else {
    process.stdout.write(`editor boundary intact (${result.checked} files)\n`);
  }
}
