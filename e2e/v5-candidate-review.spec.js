import { expect, test } from "playwright/test";
import { mkdtemp, readdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

test("candidate review captures one interactive 1440x900 non-full-page screenshot", async ({ page }) => {
  const outputDir = await mkdtemp(path.join(os.tmpdir(), "edit-html-v53-review-"));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.setContent(`<!doctype html><html><style>
    html,body{margin:0} body{height:2400px} main{height:900px;padding:48px;box-sizing:border-box}
    .focus{height:420px;background:#dde8f2}.focus[data-state=selected]{outline:8px solid #204060}
  </style><body><main><h1>Network atlas</h1><p>Core evidence</p><figure class="focus">Representative visualization</figure><button class="interaction">Select evidence</button></main>
  <script>document.querySelector('.interaction').onclick=()=>document.querySelector('.focus').dataset.state='selected'</script></body></html>`);
  await page.locator(".interaction").click();
  await expect(page.locator(".focus")).toHaveAttribute("data-state", "selected");
  for (const selector of ["h1", "p", ".focus", ".interaction"]) {
    const box = await page.locator(selector).boundingBox();
    expect(box).not.toBeNull();
    expect(box.y + box.height).toBeLessThanOrEqual(900);
  }
  await page.screenshot({ path: path.join(outputDir, "desktop.png"), fullPage: false });
  expect(await readdir(outputDir)).toEqual(["desktop.png"]);
});
