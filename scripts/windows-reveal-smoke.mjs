import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import readline from "node:readline/promises";

import { revealPath } from "../src/publish.js";

if (process.platform !== "win32") {
  process.stdout.write("Skipped: Windows Explorer smoke test only runs on win32.\n");
  process.exitCode = 0;
} else {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), "edit-html-report-reveal-smoke-"));
  const reportPath = path.join(sandbox, "report.html");
  const prompt = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    await writeFile(reportPath, "<!doctype html><title>Explorer reveal smoke test</title>", "utf8");
    const result = await revealPath(reportPath);
    const answer = await prompt.question(`Confirm Explorer opened with ${path.basename(reportPath)} selected (y/N): `);
    if (answer.trim().toLowerCase() !== "y") {
      throw new Error("Explorer selection was not confirmed");
    }
    process.stdout.write(`Passed: requested Explorer selection for ${result.targetPath}.\n`);
  } finally {
    prompt.close();
    await rm(sandbox, { recursive: true, force: true });
  }
}
