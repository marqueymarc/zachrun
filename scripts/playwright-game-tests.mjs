#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

async function loadPlaywright() {
  try {
    return await import("playwright");
  } catch (_error) {
    const fallbackPath =
      process.env.PLAYWRIGHT_MODULE_PATH || path.join(process.env.HOME || "", "node_modules", "playwright", "index.mjs");
    return import(pathToFileURL(fallbackPath).href);
  }
}

function parseArgs(argv) {
  const args = {
    url: "http://127.0.0.1:5173",
    outDir: null,
  };
  for (let i = 2; i < argv.length; i += 1) {
    if (argv[i] === "--url" && argv[i + 1]) {
      args.url = argv[i + 1];
      i += 1;
    } else if (argv[i] === "--out-dir" && argv[i + 1]) {
      args.outDir = argv[i + 1];
      i += 1;
    }
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  if (!args.outDir) args.outDir = path.resolve("output", `playwright-tests-${stamp}`);
  return args;
}

async function ensureDir(p) {
  await fs.mkdir(p, { recursive: true });
}

async function waitForMode(page, mode, timeoutMs = 7000) {
  await page.waitForFunction(
    (expected) => window.__zackTest?.getState?.()?.mode === expected,
    mode,
    { timeout: timeoutMs }
  );
}

async function gotoTestPage(page, url) {
  const testUrl = `${url}${url.includes("?") ? "&" : "?"}test=1`;
  await page.goto(testUrl, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Boolean(window.__zackTest?.enabled), null, { timeout: 10000 });
}

async function runScenario(name, page, outDir, fn) {
  const scenarioDir = path.join(outDir, name);
  await ensureDir(scenarioDir);
  await fn({ page, scenarioDir });
  await page.screenshot({ path: path.join(scenarioDir, "full.png"), fullPage: true });
  const state = await page.evaluate(() => window.__zackTest.getState());
  await fs.writeFile(path.join(scenarioDir, "state.json"), JSON.stringify(state, null, 2));
}

async function scenarioTapStartRestart({ page }) {
  const initial = await page.evaluate(() => window.__zackTest.getState());
  assert.equal(initial.mode, "menu", "expected menu mode on load");

  const vp = page.viewportSize();
  await page.mouse.click(Math.round(vp.width * 0.52), Math.round(vp.height * 0.52));
  await waitForMode(page, "running");

  await page.evaluate(() => window.__zackTest.forceFail("hit a tumbleweed", "tumbleweed"));
  await waitForMode(page, "failed");

  await page.mouse.click(Math.round(vp.width * 0.08), Math.round(vp.height * 0.15));
  await waitForMode(page, "running");
}

async function scenarioTouchGuideHides({ page, scenarioDir }) {
  await page.evaluate(() => window.__zackTest.resetRun());
  await waitForMode(page, "running");

  const startDisplay = await page.evaluate(() => getComputedStyle(document.getElementById("touch-guide")).display);
  assert.equal(startDisplay, "flex", "touch guide should be visible when run begins");

  await page.evaluate(() => window.__zackTest.setElapsed(5));
  const laterDisplay = await page.evaluate(() => getComputedStyle(document.getElementById("touch-guide")).display);
  assert.equal(laterDisplay, "none", "touch guide should hide after intro period");

  await fs.writeFile(
    path.join(scenarioDir, "touch-guide.json"),
    JSON.stringify({ startDisplay, laterDisplay }, null, 2)
  );
}

async function scenarioTouchHolds({ page }) {
  await page.evaluate(() => window.__zackTest.resetRun());
  await waitForMode(page, "running");

  let sample = await page.evaluate(() => {
    window.__zackTest.setTouches({ left: 0, right: 1 });
    return window.__zackTest.getInput();
  });
  assert.equal(sample.jumpHeld, true, "right touch should hold jump");
  assert.equal(sample.diveHeld, false, "right touch should not hold dive");

  sample = await page.evaluate(() => {
    window.__zackTest.setTouches({ left: 1, right: 0 });
    return window.__zackTest.getInput();
  });
  assert.equal(sample.jumpHeld, false, "left touch should release jump hold");
  assert.equal(sample.diveHeld, true, "left touch should hold dive");

  sample = await page.evaluate(() => {
    window.__zackTest.setTouches({ left: 1, right: 1 });
    return window.__zackTest.getInput();
  });
  assert.equal(sample.jumpHeld, true, "both touches should keep jump held");
  assert.equal(sample.diveHeld, true, "both touches should keep dive held");

  await page.evaluate(() => window.__zackTest.setTouches({ left: 0, right: 0 }));
}

async function scenarioDoubleTapAutoplay({ page }) {
  await page.evaluate(() => window.__zackTest.resetRun({ autoPlay: false }));
  await waitForMode(page, "running");
  const vp = page.viewportSize();

  await page.mouse.dblclick(Math.round(vp.width * 0.22), Math.round(vp.height * 0.62), { delay: 45 });
  await page.waitForTimeout(70);
  await page.mouse.dblclick(Math.round(vp.width * 0.78), Math.round(vp.height * 0.62), { delay: 45 });
  await page.waitForTimeout(60);
  let autoPlay = await page.evaluate(() => window.__zackTest.getState().autoPlay);
  assert.equal(autoPlay, true, "double-left then double-right should enable autoplay");

  await page.mouse.dblclick(Math.round(vp.width * 0.22), Math.round(vp.height * 0.62), { delay: 45 });
  await page.waitForTimeout(70);
  await page.mouse.dblclick(Math.round(vp.width * 0.78), Math.round(vp.height * 0.62), { delay: 45 });
  await page.waitForTimeout(60);
  autoPlay = await page.evaluate(() => window.__zackTest.getState().autoPlay);
  assert.equal(autoPlay, false, "double-left then double-right should disable autoplay");
}

async function scenarioHazardQueue({ page, scenarioDir }) {
  const spawned = await page.evaluate(() => {
    window.__zackTest.resetRun();
    window.__zackTest.clearHazards();
    window.__zackTest.queueHazards(["snake", "eagle", "tumbleweed"]);
    return [
      window.__zackTest.spawnNextHazard(),
      window.__zackTest.spawnNextHazard(),
      window.__zackTest.spawnNextHazard(),
    ];
  });
  const types = spawned.map((h) => h?.type || null);
  assert.deepEqual(types, ["snake", "eagle", "tumbleweed"], "queued hazards should spawn in requested order");
  await fs.writeFile(path.join(scenarioDir, "spawned.json"), JSON.stringify(spawned, null, 2));
}

async function scenarioRockArchDuck({ page, scenarioDir }) {
  const failCheck = await page.evaluate(async () => {
    await window.__zackTest.resetRun({ autoPlay: false });
    window.__zackTest.clearHazards();
    window.__zackTest.spawnHazard("rockarch", { x: 545, speedMul: 0.74 });
    for (let i = 0; i < 170; i += 1) {
      await window.__zackTest.step(16);
      const state = window.__zackTest.getState();
      if (state.mode === "failed") break;
    }
    return window.__zackTest.getState();
  });
  assert.equal(failCheck.mode, "failed", "expected failure if player does not duck under rock arch");
  assert.equal(failCheck.failReason, "hit a rock arch", `expected rock arch fail reason, got ${failCheck.failReason}`);

  const passCheck = await page.evaluate(async () => {
    await window.__zackTest.resetRun({ autoPlay: false });
    window.__zackTest.clearHazards();
    window.__zackTest.spawnHazard("rockarch", { x: 560, speedMul: 0.72 });
    window.__zackTest.setTouches({ left: 1, right: 0 });
    for (let i = 0; i < 210; i += 1) {
      await window.__zackTest.step(16);
      const state = window.__zackTest.getState();
      if (state.mode === "failed") break;
      if ((state.hazards || []).length === 0) break;
    }
    window.__zackTest.setTouches({ left: 0, right: 0 });
    const state = window.__zackTest.getState();
    return {
      mode: state.mode,
      failReason: state.failReason || "",
      hazardsRemaining: (state.hazards || []).length,
    };
  });
  assert.equal(passCheck.mode, "running", `expected duck to survive rock arch, got ${JSON.stringify(passCheck)}`);
  assert.ok(passCheck.hazardsRemaining === 0 || passCheck.hazardsRemaining === 1, `unexpected rock arch pass state: ${JSON.stringify(passCheck)}`);
  await page.screenshot({ path: path.join(scenarioDir, "rock-arch-duck.png"), fullPage: true });
  await fs.writeFile(path.join(scenarioDir, "rock-arch.json"), JSON.stringify({ failCheck, passCheck }, null, 2));
}

async function scenarioComboJumpAndBigTumbleweed({ page, scenarioDir }) {
  const normalJumpMinY = await page.evaluate(async () => {
    await window.__zackTest.resetRun({ autoPlay: false });
    let minY = window.__zackTest.getState().player.y;
    await window.__zackTest.tap("right");
    for (let i = 0; i < 70; i += 1) {
      await window.__zackTest.step(16);
      minY = Math.min(minY, window.__zackTest.getState().player.y);
    }
    return minY;
  });

  const comboJumpMinY = await page.evaluate(async () => {
    await window.__zackTest.resetRun({ autoPlay: false });
    window.__zackTest.setTouches({ left: 1, right: 0 });
    await window.__zackTest.step(70);
    window.__zackTest.setTouches({ left: 0, right: 0 });
    await window.__zackTest.tap("right");
    let minY = window.__zackTest.getState().player.y;
    for (let i = 0; i < 70; i += 1) {
      await window.__zackTest.step(16);
      minY = Math.min(minY, window.__zackTest.getState().player.y);
    }
    return minY;
  });

  assert.ok(
    comboJumpMinY < normalJumpMinY - 45,
    `expected combo jump to be higher (normal minY=${normalJumpMinY}, combo minY=${comboJumpMinY})`
  );

  const big = await page.evaluate(() => {
    window.__zackTest.resetRun({ autoPlay: false });
    window.__zackTest.clearHazards();
    window.__zackTest.spawnHazard("tumbleweed", { big: true, x: 1050 });
    return window.__zackTest.getState().hazards[0];
  });
  assert.ok((big?.w || 0) >= 230, `expected big tumbleweed width to be large, got ${big?.w || 0}`);

  const leap = await page.evaluate(async () => {
    await window.__zackTest.resetRun({ autoPlay: false });
    await window.__zackTest.clearHazards();
    const spawned = window.__zackTest.spawnHazard("tumbleweed", { big: true, x: 530, speedMul: 0.74 });
    window.__zackTest.setTouches({ left: 1, right: 0 });
    await window.__zackTest.step(80);
    window.__zackTest.setTouches({ left: 0, right: 0 });
    await window.__zackTest.tap("right");

    let best = null;
    for (let i = 0; i < 120; i += 1) {
      await window.__zackTest.step(16);
      const state = window.__zackTest.getState();
      const hazard = state.hazards.find((h) => h.id === spawned.id) || state.hazards[0];
      if (!hazard) continue;
      const overlap = state.player.x + 20 > hazard.x && state.player.x - 20 < hazard.x + hazard.w;
      if (!overlap) continue;
      const clearancePx = 655 - state.player.y;
      const sample = {
        y: state.player.y,
        clearancePx,
        hazardX: hazard.x,
        hazardW: hazard.w,
        comboJumpActive: state.player.comboJumpActive,
      };
      if (!best || clearancePx > best.clearancePx) best = sample;
    }
    return best;
  });
  assert.ok(leap && leap.clearancePx > 150, `expected leap clearance over giant tumbleweed, got ${JSON.stringify(leap)}`);
  await page.screenshot({ path: path.join(scenarioDir, "leap-over-big-tumbleweed.png"), fullPage: true });

  await fs.writeFile(
    path.join(scenarioDir, "combo-jump.json"),
    JSON.stringify({ normalJumpMinY, comboJumpMinY, bigHazard: big, leap }, null, 2)
  );
}

async function scenarioSnakeFailSequence({ page, scenarioDir }) {
  await page.evaluate(() => {
    window.__zackTest.resetRun();
    window.__zackTest.clearHazards();
    window.__zackTest.forceFail("killed by a snake bite", "snake");
  });
  await waitForMode(page, "failed");

  const timeline = [];
  for (let i = 0; i < 90; i += 1) {
    const sample = await page.evaluate(async () => {
      await window.__zackTest.step(120);
      return {
        phase: window.__zackTest.getKillerSnakePhase()?.phase || "",
        jolt: window.__zackTest.getPlayerDeathJolt()?.offset || 0,
      };
    });
    timeline.push(sample);
  }
  await fs.writeFile(path.join(scenarioDir, "snake-timeline.json"), JSON.stringify(timeline, null, 2));

  const phases = timeline.map((s) => s.phase).filter(Boolean);
  const expected = ["bite-near", "retreat-right", "return-for-last", "bite-final", "wander-left"];
  let cursor = -1;
  for (const step of expected) {
    const index = phases.findIndex((v, i) => i > cursor && v === step);
    assert.ok(index > cursor, `missing snake fail phase: ${step}`);
    cursor = index;
  }

  const minJolt = timeline.reduce((min, s) => Math.min(min, s.jolt), 0);
  assert.ok(minJolt < -1.5, `expected visible body jolt on bite, got min offset ${minJolt}`);
}

async function scenarioEagleFlightVariety({ page, scenarioDir }) {
  const metrics = await page.evaluate(async () => {
    await window.__zackTest.resetRun({ autoPlay: false });
    window.__zackTest.clearHazards();
    const samples = [];
    for (let i = 0; i < 20; i += 1) {
      const spawn = window.__zackTest.spawnHazard("eagle", { x: 900 + i * 22, speedMul: 0.95 });
      const eagle = window.__zackTest.getEagleHazards().find((e) => e.id === spawn.id);
      if (eagle) {
        samples.push({
          id: eagle.id,
          yBase: eagle.yBase,
          autoAction: eagle.autoAction,
          flightBand: eagle.flightBand,
        });
      }
    }
    const ys = samples.map((s) => s.yBase);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const actions = Object.fromEntries(["jump", "duck"].map((k) => [k, samples.filter((s) => s.autoAction === k).length]));
    const bands = [...new Set(samples.map((s) => s.flightBand).filter(Boolean))];
    return {
      sampleCount: samples.length,
      minY,
      maxY,
      spread: maxY - minY,
      actions,
      bands,
      samples,
    };
  });

  assert.ok(metrics.sampleCount >= 18, `expected >=18 eagle samples, got ${metrics.sampleCount}`);
  assert.ok(metrics.spread >= 70, `expected varied eagle heights, got spread ${metrics.spread}`);
  assert.ok(metrics.actions.jump > 0 && metrics.actions.duck > 0, `expected both jump and duck eagle actions, got ${JSON.stringify(metrics.actions)}`);
  assert.ok(metrics.bands.length >= 2, `expected multiple flight bands, got ${JSON.stringify(metrics.bands)}`);
  await fs.writeFile(path.join(scenarioDir, "eagle-flight-variety.json"), JSON.stringify(metrics, null, 2));
}

async function scenarioFailEaglePeckCadence({ page, scenarioDir }) {
  const stats = await page.evaluate(async () => {
    await window.__zackTest.resetRun({ autoPlay: false });
    window.__zackTest.clearHazards();
    window.__zackTest.forceFail("hit a tumbleweed", "tumbleweed");
    window.__zackTest.clearHazards();
    await window.__zackTest.step(4300);
    const preDelayPasses = window.__zackTest.getFailEaglePassCount();
    await window.__zackTest.step(1400);
    const postDelayPasses = window.__zackTest.getFailEaglePassCount();

    let maxPasses = 0;
    let maxPecks = 0;
    const peckStylesSeen = { dive: 0, glide: 0 };
    for (let i = 0; i < 520; i += 1) {
      await window.__zackTest.step(70);
      maxPasses = Math.max(maxPasses, window.__zackTest.getFailEaglePassCount());
      maxPecks = Math.max(maxPecks, window.__zackTest.getFailEaglePeckEvents());
      const eagles = window.__zackTest.getEagleHazards();
      for (const e of eagles) {
        if (e.failSwoopPhase === "dive") peckStylesSeen.dive += 1;
        if (e.failSwoopPhase === "glide") peckStylesSeen.glide += 1;
      }
      if (maxPasses >= 8 && maxPecks >= 3) break;
    }
    const subsequentRate = maxPasses > 1 ? (maxPecks - 1) / (maxPasses - 1) : 0;
    return {
      failReason: window.__zackTest.getState().failReason,
      preDelayPasses,
      postDelayPasses,
      maxPasses,
      maxPecks,
      subsequentRate,
      peckStylesSeen,
      eagleSnapshot: window.__zackTest.getEagleHazards(),
    };
  });

  assert.equal(stats.failReason, "hit a tumbleweed", "expected non-eagle fail reason for peck cadence test");
  assert.equal(stats.preDelayPasses, 0, `expected no fail eagles before first-delay window, got ${stats.preDelayPasses}`);
  assert.ok(stats.postDelayPasses >= 1, `expected first fail eagle after delay window, got ${stats.postDelayPasses}`);
  assert.ok(stats.maxPasses >= 1, `expected at least 1 fail-state eagle pass, got ${stats.maxPasses}`);
  assert.ok(stats.maxPecks >= 1, `expected at least one peck event, got ${stats.maxPecks}`);
  if (stats.maxPasses >= 4) {
    assert.ok(stats.maxPecks >= 2, `expected repeated pecks after first pass, got ${stats.maxPecks}`);
  }
  assert.ok(
    stats.subsequentRate >= 0 && stats.subsequentRate <= 1.0,
    `expected bounded subsequent peck rate, got ${(stats.subsequentRate * 100).toFixed(1)}%`
  );
  if (stats.maxPasses >= 4 && stats.maxPecks >= 2) {
    assert.ok(stats.peckStylesSeen.glide > 0, `expected at least one glide peck approach, got ${JSON.stringify(stats.peckStylesSeen)}`);
  }

  await page.screenshot({ path: path.join(scenarioDir, "eagle-peck-cadence.png"), fullPage: true });
  await fs.writeFile(path.join(scenarioDir, "eagle-peck-cadence.json"), JSON.stringify(stats, null, 2));
}

async function scenarioAutoplayDiagnostics({ page, scenarioDir }) {
  const result = await page.evaluate(async () => {
    await window.__zackTest.resetRun({ autoPlay: true });
    let failedAtStep = -1;
    for (let i = 0; i < 780; i += 1) {
      await window.__zackTest.step(60);
      const state = window.__zackTest.getState();
      if (state.mode === "failed") {
        failedAtStep = i;
        break;
      }
    }
    const state = window.__zackTest.getState();
    const diagnostics = window.__zackTest.getAutoFailureDiagnostics();
    return {
      mode: state.mode,
      failedAtStep,
      score: state.score,
      speed: state.speed,
      failReason: state.failReason || "",
      diagnostics,
      recentAutoEvents: state.autoDebug?.events || [],
    };
  });

  if (result.mode === "failed") {
    assert.ok(result.diagnostics, "expected autoplay failure diagnostics when autoplay dies");
  }
  await fs.writeFile(path.join(scenarioDir, "autoplay-diagnostics.json"), JSON.stringify(result, null, 2));
}

async function main() {
  const args = parseArgs(process.argv);
  await ensureDir(args.outDir);
  const { chromium } = await loadPlaywright();

  const browser = await chromium.launch({
    headless: true,
    args: ["--use-gl=angle", "--use-angle=swiftshader"],
  });

  const context = await browser.newContext({
    viewport: { width: 1792, height: 1024 },
  });
  const page = await context.newPage();
  const results = [];
  try {
    await gotoTestPage(page, args.url);

    const scenarios = [
      ["tap-start-restart", scenarioTapStartRestart],
      ["touch-guide-hide", scenarioTouchGuideHides],
      ["touch-holds", scenarioTouchHolds],
      ["double-tap-autoplay", scenarioDoubleTapAutoplay],
      ["hazard-queue", scenarioHazardQueue],
      ["rock-arch-duck", scenarioRockArchDuck],
      ["combo-jump-big-tumbleweed", scenarioComboJumpAndBigTumbleweed],
      ["snake-fail-sequence", scenarioSnakeFailSequence],
      ["eagle-flight-variety", scenarioEagleFlightVariety],
      ["fail-eagle-peck-cadence", scenarioFailEaglePeckCadence],
      ["autoplay-diagnostics", scenarioAutoplayDiagnostics],
    ];

    for (const [name, fn] of scenarios) {
      await runScenario(name, page, args.outDir, fn);
      results.push({ scenario: name, ok: true });
      console.log(`PASS ${name}`);
    }
  } catch (error) {
    const message = String(error?.stack || error?.message || error);
    results.push({ scenario: "failed", ok: false, error: message });
    await fs.writeFile(path.join(args.outDir, "failure.txt"), `${message}\n`);
    throw error;
  } finally {
    await fs.writeFile(path.join(args.outDir, "summary.json"), JSON.stringify(results, null, 2));
    await context.close();
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
