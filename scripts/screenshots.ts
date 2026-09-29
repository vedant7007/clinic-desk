/**
 * Captures the README screenshots from the running app with real memory.
 *   npm run build && npm start          (in another terminal)
 *   npm run screenshots                 (APP_URL defaults to http://localhost:3000)
 *   npm run screenshots -- --keep       (keep the demo visit and outcome in memory)
 *
 * The learning screenshot follows Priya (P008), a new patient: a generic first brief,
 * then a real visit and outcome are written, then her follow-up brief uses them. Unless
 * --keep is passed, the documents written by this run are deleted afterwards so the
 * live demo still starts from the seeded chart. Fails if the browser logs an error.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { chromium, type Page } from "playwright";
import { CLINIC_BANK, PATIENT_BANK, getHindsight } from "../lib/hindsight";

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";
const keep = process.argv.includes("--keep");
const BRIEF_TIMEOUT = 120_000;

async function prepareBrief(page: Page) {
  await page.getByRole("button", { name: /Prepare brief|Re-run the brief/ }).first().click();
  await page.locator(".brief-memory").waitFor({ timeout: BRIEF_TIMEOUT });
}

/** Delete the documents this run wrote: today's P008 visit/outcome and clinic cases created since `since`. */
async function cleanup(since: number) {
  const hs = getHindsight();
  const day = new Date().toISOString().slice(0, 10);
  const targets: [string, (id: string) => boolean][] = [
    [PATIENT_BANK, (id) => id.startsWith(`P008-visit-${day}`) || id.startsWith(`P008-outcome-${day}`)],
    [CLINIC_BANK, (id) => id.startsWith(`case-${day}`)],
  ];
  for (const [bank, match] of targets) {
    const { items } = await hs.listDocuments(bank, { limit: 100, timeField: "created_at", startDate: new Date(since - 60_000).toISOString() });
    for (const doc of items.filter((d) => match(d.id))) {
      await hs.deleteDocument(bank, doc.id);
      console.log(`  removed ${bank}/${doc.id}`);
    }
  }
}

async function main() {
  const started = Date.now();
  const browser = await chromium.launch();
  // 1400px puts the two briefs side by side (above it the memory rail takes the third
  // column and the briefs stack), which is what the README caption describes.
  const page = await browser.newPage({ viewport: { width: 1400, height: 2300 }, deviceScaleFactor: 1 });
  const problems: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") problems.push(`${m.type()}: ${m.text()}`);
  });
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));

  try {
    await page.goto(`${APP_URL}/consult`, { waitUntil: "domcontentloaded" });
    await page.locator(".rail-item", { hasText: "Ravi Kumar Reddy" }).click();
    await page.locator(".bank-patient b").waitFor({ timeout: 30_000 });

    console.log("1. Ravi's brief");
    await prepareBrief(page);
    await page.locator(".brief-memory .ref-clinic").first().hover();
    await page.waitForTimeout(600);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: "docs/screenshot-brief.png", fullPage: true });

    console.log("2. Priya, first visit: no chart yet");
    await page.locator(".rail-item", { hasText: "Priya Nair" }).click();
    // Comparison mode is a switch button, not a checkbox: turn it off only if it is on.
    const compare = page.getByRole("switch", { name: /Comparison mode/ });
    if ((await compare.getAttribute("aria-checked")) === "true") await compare.click();
    await prepareBrief(page);

    console.log("3. Close the visit and teach the outcome");
    await page.getByLabel("Findings").fill("Pale conjunctiva. Ferritin 9, vitamin D 14, TSH normal");
    await page.getByLabel("Plan").fill("Started iron and vitamin D supplements, review in 6 weeks");
    await page.getByRole("button", { name: "Save visit to memory" }).click();
    await page.locator(".learn-cta").waitFor({ timeout: 60_000 });
    await page.getByLabel("Problem").fill("tiredness and hair fall with low ferritin and vitamin D");
    await page.getByLabel("Treatment").fill("iron and vitamin D supplements");
    await page.getByRole("button", { name: "Improved" }).click();
    await page.getByLabel("Detail (optional)").fill("Energy better at 6 weeks, hair fall reduced");
    await page.getByRole("button", { name: "Teach Clinic Desk" }).click();
    await page.locator(".learned-writes").waitFor({ timeout: 60_000 });

    console.log("4. Follow-up brief with what it learned");
    await page.getByLabel("Reason for visit · from reception").fill("Follow-up for tiredness and hair fall. Feels more energetic, asks whether to continue the tablets.");
    await page.getByRole("button", { name: "Prepare brief" }).click();
    await page.locator(".brief-memory").waitFor({ timeout: BRIEF_TIMEOUT });
    await page.locator(".learned-banner").waitFor({ timeout: 10_000 });
    // The success toast is fixed-position and lands mid-page in a full-page capture.
    await page.locator(".toast").waitFor({ state: "detached", timeout: 15_000 }).catch(() => {});
    await page.screenshot({ path: "docs/screenshot-learning.png", fullPage: true });
    console.log(`   ${await page.locator(".learned-banner").innerText()}`);
  } finally {
    await browser.close();
    if (!keep) {
      console.log("Cleaning up the demo memories written by this run");
      await cleanup(started);
    }
  }

  if (problems.length) {
    console.error(`Browser console reported ${problems.length} problem(s):\n  ${problems.join("\n  ")}`);
    process.exit(1);
  }
  console.log("Saved docs/screenshot-brief.png and docs/screenshot-learning.png. Browser console was clean.");
}

main().catch((err) => {
  console.error("Screenshots failed:", err?.message ?? err);
  process.exit(1);
});
