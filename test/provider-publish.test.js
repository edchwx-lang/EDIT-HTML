import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { finalizeVariant } from "../src/finalize.js";
import { createProject } from "../src/project.js";
import { publishProvider } from "../src/publish.js";
import { createVariant } from "../src/variants.js";

async function savedProject(t) {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), "edit-html-report-"));
  t.after(() => rm(sandbox, { recursive: true, force: true }));
  const source = path.join(sandbox, "brief.txt");
  const projectDir = path.join(sandbox, "report");
  await writeFile(source, "Evidence.", "utf8");
  await createProject(source, projectDir);
  const variant = await createVariant(projectDir, {
    mode: "evidence-first",
    theme: "editorial-light"
  });
  await writeFile(
    path.join(projectDir, "variants", variant.variantId, "artifact.html"),
    '<!doctype html><body data-report-mode="evidence-first"><p data-edit-id="body">Saved</p></body>',
    "utf8"
  );
  const version = await finalizeVariant(projectDir, variant.variantId);
  return { projectDir, version };
}

test("publishProvider deploys the selected version through Netlify CLI and records no credentials", async (t) => {
  const { projectDir, version } = await savedProject(t);
  const calls = [];
  const runner = async (request) => {
    calls.push(request);
    return {
      code: 0,
      stdout: JSON.stringify({
        deploy_url: "https://report.netlify.app",
        site_id: "site-123"
      }),
      stderr: ""
    };
  };

  const deployment = await publishProvider(
    projectDir,
    version.versionId,
    "netlify",
    { runner }
  );

  assert.equal(deployment.url, "https://report.netlify.app");
  assert.equal(calls[0].command, "npx");
  assert.deepEqual(calls[0].args.slice(0, 4), [
    "--yes",
    "netlify-cli",
    "deploy",
    "--prod"
  ]);
  assert.equal(calls[0].args.includes("--dir"), true);
  const metadata = JSON.parse(
    await readFile(path.join(projectDir, "deployments.json"), "utf8")
  );
  assert.equal(metadata.providers.netlify.versionId, version.versionId);
  assert.equal(JSON.stringify(metadata).toLowerCase().includes("token"), false);
});

test("publishProvider deploys the selected version through Vercel CLI", async (t) => {
  const { projectDir, version } = await savedProject(t);
  const calls = [];
  const runner = async (request) => {
    calls.push(request);
    return {
      code: 0,
      stdout: "https://report.vercel.app\n",
      stderr: ""
    };
  };

  const deployment = await publishProvider(
    projectDir,
    version.versionId,
    "vercel",
    { runner }
  );

  assert.equal(deployment.url, "https://report.vercel.app");
  assert.equal(calls[0].command, "npx");
  assert.deepEqual(calls[0].args.slice(0, 5), [
    "--yes",
    "vercel",
    "--prod",
    "--yes",
    "--cwd"
  ]);
  const metadata = JSON.parse(
    await readFile(path.join(projectDir, "deployments.json"), "utf8")
  );
  assert.equal(metadata.providers.vercel.versionId, version.versionId);
});
