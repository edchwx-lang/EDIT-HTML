import assert from "node:assert/strict";
import { mkdtemp, cp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { launchDesignBrowser, probeDesignBrowser } from "../src/browser-runtime.js";
import { resolveHuashuProvider, validateSkillMetadata } from "../src/design-provider.js";
import { diagnoseInstallation } from "../src/doctor.js";
import { beginHuashuDesign } from "../src/v5-huashu-attestation.js";
import { writeHuashuInputManifest } from "../src/v5-stage-boundary.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("V5.5 ships a hash-verified real Huashu provider, without a global Skill", async () => {
  const provider = await resolveHuashuProvider({ packageRoot: root });
  assert.match(provider.skillPath, /vendor[\\/]huashu-design[\\/]SKILL.md$/);
  assert.match(provider.skillSha256, /^[a-f0-9]{64}$/);
  assert.ok(provider.fileCount > 20);
  assert.equal(provider.license, "MIT");
});

test("Huashu bundle rejects a changed original reference", async (t) => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "edit-html-huashu-integrity-"));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  await cp(path.join(root, "skills", "edit-html"), path.join(temporary, "skills", "edit-html"), { recursive: true });
  const skill = path.join(temporary, "skills", "edit-html", "vendor", "huashu-design", "SKILL.md");
  await writeFile(skill, (await readFile(skill, "utf8")) + "\nchanged\n");
  await assert.rejects(resolveHuashuProvider({ packageRoot: temporary }), /integrity|hash/i);
});

test("Huashu begin binds the bundled real Skill by default", async (t) => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "edit-html-default-provider-"));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const input = path.join(temporary, "variants", "v", "design", "huashu-input");
  await mkdir(input, { recursive: true });
  for (const name of ["readable-source.md", "fact-ledger.json", "source-map.json", "tables-and-datasets.json", "asset-contact-sheet.html", "extraction-warnings.json", "interview.json", "content-brief.json"]) {
    await writeFile(path.join(input, name), "{}");
  }
  await writeHuashuInputManifest(temporary, "v");
  const invocation = await beginHuashuDesign(temporary, "v", "candidate");
  assert.equal(invocation.skillSha256, (await resolveHuashuProvider()).skillSha256);
  assert.equal(invocation.owner, "huashu-design");
});

test("Skill frontmatter uses a legal name and metadata.version", async () => {
  const result = await validateSkillMetadata(path.join(root, "skills", "edit-html", "SKILL.md"));
  assert.equal(result.name, "edit-html");
  assert.equal(result.version, "5.5.0");
});

test("auto browser falls back to installed Edge and keeps launch diagnostics", async () => {
  const calls = [];
  const browser = { close: async () => {} };
  const playwright = { chromium: { launch: async (options) => {
    calls.push(options.channel ?? "chromium");
    if (options.channel !== "msedge") throw new Error("browser absent");
    return browser;
  } } };
  const result = await launchDesignBrowser({ playwright, env: {} });
  assert.equal(result.browser, browser);
  assert.equal(result.selected, "msedge");
  assert.deepEqual(calls, ["chromium", "msedge"]);
  assert.equal(result.attempts[0].ok, false);
});

test("explicit browser failure never silently changes browser", async () => {
  const calls = [];
  const playwright = { chromium: { launch: async (options) => {
    calls.push(options.channel);
    throw new Error("missing selected browser");
  } } };
  await assert.rejects(launchDesignBrowser({ playwright, env: { EDIT_HTML_BROWSER: "msedge" } }), /setup browser|msedge/i);
  assert.deepEqual(calls, ["msedge"]);
});

test("invalid browser config is actionable and fails without launch", async () => {
  await assert.rejects(launchDesignBrowser({ env: { EDIT_HTML_BROWSER: "firefox" } }), /EDIT_HTML_BROWSER/);
  await assert.rejects(launchDesignBrowser({ env: { EDIT_HTML_BROWSER_EXECUTABLE_PATH: path.join(os.tmpdir(), "not-a-browser.exe") } }), /EXECUTABLE_PATH/);
});

test("browser probe executes DOM JavaScript and always closes browser", async () => {
  let closed = false;
  const playwright = { chromium: { launch: async () => ({
    newPage: async () => ({ setContent: async () => {}, evaluate: async () => true }),
    close: async () => { closed = true; }
  }) } };
  assert.equal((await probeDesignBrowser({ playwright, env: {} })).ready, true);
  assert.equal(closed, true);
});

test("doctor distinguishes basic installation from full workflow readiness", async () => {
  const result = await diagnoseInstallation({ packageRoot: root, executablePath: path.join(root, "bin", "edit-html-report.js"),
    browserProbe: async () => ({ ready: false, error: "No browser; run edit-html-report setup browser" }) });
  assert.equal(result.basicReady, true);
  assert.equal(result.workflowReady, false);
  assert.equal(result.checks.huashuBundle, true);
  assert.equal(result.ok, false);
  assert.match(result.errors.join(" "), /setup browser/);
});

test("doctor CLI fails when an explicitly selected browser is missing", async (t) => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "edit-html-no-browser-"));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const result = spawnSync(process.execPath, [path.join(root, "bin", "edit-html-report.js"), "doctor", "--json"], {
    encoding: "utf8", timeout: 60000,
    env: { ...process.env, EDIT_HTML_BROWSER: "chromium", EDIT_HTML_BROWSER_EXECUTABLE_PATH: "", PLAYWRIGHT_BROWSERS_PATH: temporary }
  });
  assert.equal(result.status, 1, result.stderr);
  const diagnostic = JSON.parse(result.stdout);
  assert.equal(diagnostic.basicReady, true);
  assert.equal(diagnostic.workflowReady, false);
  assert.match(diagnostic.errors.join(" "), /setup browser/);
});
