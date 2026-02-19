const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const startBtn = document.getElementById("start-btn");
const statusText = document.getElementById("status-text");

const WORLD_W = 1920;
const WORLD_H = 864;
const FLOOR_Y = 655;
const GRAVITY = 2500;
const TARGET_SCORE = 12000;
const BACKGROUND_SCROLL_SPEED = 10;
const CLOUD_SCROLL_SPEED = BACKGROUND_SCROLL_SPEED * 2;
const MAX_RUN_SPEED = Math.round(770 * 0.75);
const BUILD_ID = "2026-02-19-1256";
const AIR_JOY_CHANCE = 0.18;
const CAMERA_BASE_SCREEN_X = WORLD_W * 0.27;
const CAMERA_HEADWAY_SCREEN_X = WORLD_W * 0.4;
const PLAYER_BASE_X = 320;

const input = {
  jumpPressed: false,
  jumpHeld: false,
  diveHeld: false,
};

function setStatus(message) {
  if (statusText) statusText.textContent = message;
}

const zackSprites = {
  run1: new Image(),
  run2: new Image(),
  jump: new Image(),
  joy: new Image(),
  horror: new Image(),
};
zackSprites.run1.src = "./assets/zack/sprites/run1.png?v=1010";
zackSprites.run2.src = "./assets/zack/sprites/run2.png?v=1010";
zackSprites.jump.src = "./assets/zack/sprites/jump.png?v=1010";
zackSprites.joy.src = "./assets/zack/sprites/joy.png?v=1010";
zackSprites.horror.src = "./assets/zack/sprites/horror.png?v=1010";

const worldArt = {
  farBackground: new Image(),
  nearBackground: new Image(),
  sky: new Image(),
  mountains: new Image(),
  groundA: new Image(),
  groundB: new Image(),
  clouds: new Image(),
  tumbleweed1: new Image(),
  tumbleweed2: new Image(),
  snakeSide: new Image(),
  snakeStrike: new Image(),
};
worldArt.farBackground.src = "./assets/zack/sprites/far_background_x.png";
worldArt.nearBackground.src = "./assets/zack/sprites/near_background.png";
worldArt.sky.src = "./assets/world/sky_far.png";
worldArt.mountains.src = "./assets/world/mountains_mid.png";
worldArt.groundA.src = "./assets/world/ground_strip_a.png";
worldArt.groundB.src = "./assets/world/ground_strip_b.png";
worldArt.clouds.src = "./assets/world/clouds.png";
worldArt.tumbleweed1.src = "./assets/world/tumbleweed1.png";
worldArt.tumbleweed2.src = "./assets/world/tumbleweed2.png";
worldArt.snakeSide.src = "./assets/world/snake_side.png";
worldArt.snakeStrike.onerror = () => {
  worldArt.snakeStrike.src = "./assets/world/snake_side.png";
};
worldArt.snakeStrike.src = "./assets/world/snake_strike.png";

const tumbleweedMeta = new WeakMap();

const state = {
  mode: "menu",
  autoPlay: false,
  time: 0,
  sceneTime: 0,
  score: 0,
  best: 0,
  speed: 440,
  nextHazardIn: 1.7,
  lastHazardEndX: WORLD_W + 200,
  hazardStreak: 0,
  hazardsSpawned: 0,
  hazardIdSeq: 0,
  tumbleweed1Spawned: 0,
  tumbleweed2Spawned: 0,
  failReason: "",
  clouds: [
    { x: 120, y: 34, speedMul: 1.0, scale: 0.42 },
    { x: 740, y: 58, speedMul: 0.92, scale: 0.38 },
    { x: 1360, y: 46, speedMul: 1.08, scale: 0.4 },
  ],
  camera: {
    zoom: 1,
    targetZoom: 1,
    x: WORLD_W * 0.5,
    y: WORLD_H * 0.5,
    screenX: CAMERA_BASE_SCREEN_X,
    targetScreenX: CAMERA_BASE_SCREEN_X,
    zoomTimer: 2.8,
    panTimer: 3.4,
    landingLock: 0,
    wasOnGround: true,
    headwayRight: true,
  },
  player: {
    x: PLAYER_BASE_X,
    y: FLOOR_Y,
    vy: 0,
    width: 132,
    height: 255,
    onGround: true,
    inWater: false,
    expression: "neutral",
    airSprite: "jump",
    flipActive: false,
    flipProgress: 0,
    runCycle: 0,
    driftTargetX: PLAYER_BASE_X,
    driftTimer: 1.8,
    driftRightPhase: true,
  },
  hazards: [],
  splatTimer: 0,
  failAnimTime: 0,
  hitHazardId: null,
  lastError: "",
  autoRescueCooldown: 0,
  audioReady: false,
  audioCtx: null,
  musicGain: null,
  musicTimerId: null,
  musicPattern: [64, 67, 71, 67, 62, 66, 69, 66],
  musicStep: 0,
};

function resetGame() {
  state.mode = "running";
  state.time = 0;
  state.sceneTime = 0;
  state.score = 0;
  state.speed = 440;
  state.nextHazardIn = 2.8;
  state.lastHazardEndX = WORLD_W + 200;
  state.hazardStreak = 0;
  state.hazardsSpawned = 0;
  state.hazardIdSeq = 0;
  state.tumbleweed1Spawned = 0;
  state.tumbleweed2Spawned = 0;
  state.failReason = "";
  state.hazards = [];
  state.splatTimer = 0;
  state.failAnimTime = 0;
  state.hitHazardId = null;
  state.lastError = "";
  state.autoRescueCooldown = 0;
  state.camera.zoom = 1;
  state.camera.targetZoom = 1;
  state.camera.x = WORLD_W * 0.5;
  state.camera.y = WORLD_H * 0.5;
  state.camera.screenX = CAMERA_BASE_SCREEN_X;
  state.camera.targetScreenX = CAMERA_BASE_SCREEN_X;
  state.camera.zoomTimer = 2 + Math.random() * 1.2;
  state.camera.panTimer = 2.6 + Math.random() * 1.4;
  state.camera.landingLock = 0;
  state.camera.wasOnGround = true;
  state.camera.headwayRight = true;
  const p = state.player;
  p.x = PLAYER_BASE_X;
  p.y = FLOOR_Y;
  p.vy = 0;
  p.onGround = true;
  p.inWater = false;
  p.expression = "neutral";
  p.airSprite = "jump";
  p.flipActive = false;
  p.flipProgress = 0;
  p.runCycle = 0;
  p.driftTargetX = PLAYER_BASE_X;
  p.driftTimer = 1.8 + Math.random() * 0.9;
  p.driftRightPhase = true;
  setStatus(state.autoPlay
    ? "Autoplay ON (P toggles). Zack auto-jumps."
    : "Run active. Jump over rolling tumbleweeds.");
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function randBetween(min, max) {
  return min + Math.random() * (max - min);
}

function refreshCameraTargets(camera) {
  if (camera.zoomTimer <= 0) {
    const zoomPulse = Math.random() < 0.72;
    camera.targetZoom = zoomPulse ? randBetween(1.08, 1.19) : randBetween(1.0, 1.06);
    camera.zoomTimer = randBetween(2.6, 5.8);
  }
  if (camera.panTimer <= 0) {
    if (camera.headwayRight) {
      camera.targetScreenX = randBetween(WORLD_W * 0.37, WORLD_W * 0.46);
      camera.panTimer = randBetween(1.7, 2.9);
    } else {
      camera.targetScreenX = randBetween(WORLD_W * 0.22, WORLD_W * 0.31);
      camera.panTimer = randBetween(3.9, 6.1);
    }
    camera.headwayRight = !camera.headwayRight;
  }
}

function updateCamera(dt) {
  const camera = state.camera;
  const p = state.player;
  if (!camera.wasOnGround && p.onGround) {
    camera.landingLock = 0.2;
  }
  camera.wasOnGround = p.onGround;
  camera.landingLock = Math.max(0, camera.landingLock - dt);
  const transitionsEnabled = p.onGround && camera.landingLock <= 0;

  if (transitionsEnabled) {
    camera.zoomTimer -= dt;
    camera.panTimer -= dt;
    refreshCameraTargets(camera);

    camera.zoom += (camera.targetZoom - camera.zoom) * Math.min(1, dt * 0.9);
    const panEase = camera.targetScreenX < camera.screenX ? 0.5 : 0.9;
    camera.screenX += (camera.targetScreenX - camera.screenX) * Math.min(1, dt * panEase);
  }

  const desiredScreenX = clamp(camera.screenX, WORLD_W * 0.22, WORLD_W * 0.49);
  const desiredScreenY = WORLD_H * 0.76;
  camera.x = p.x - (desiredScreenX - WORLD_W * 0.5) / camera.zoom;
  if (transitionsEnabled) {
    camera.y = p.y - (desiredScreenY - WORLD_H * 0.5) / camera.zoom;
  }

  const halfW = (WORLD_W * 0.5) / camera.zoom;
  const halfH = (WORLD_H * 0.5) / camera.zoom;
  camera.x = clamp(camera.x, halfW, WORLD_W - halfW);
  camera.y = clamp(camera.y, halfH, WORLD_H - halfH);
}

function midiToFreq(midi) {
  return 440 * 2 ** ((midi - 69) / 12);
}

function playPianoNote(midi, duration = 0.22, level = 0.06) {
  if (!state.audioCtx) return;
  const ac = state.audioCtx;
  const now = ac.currentTime;

  const osc = ac.createOscillator();
  osc.type = "triangle";
  osc.frequency.value = midiToFreq(midi);

  const over = ac.createOscillator();
  over.type = "sine";
  over.frequency.value = midiToFreq(midi + 12);

  const gain = ac.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(level, now + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  osc.connect(gain);
  over.connect(gain);
  gain.connect(state.musicGain);

  osc.start(now);
  over.start(now);
  osc.stop(now + duration + 0.01);
  over.stop(now + duration + 0.01);
}

function activateAudio() {
  if (state.audioReady) return;
  state.audioReady = true;
  const ac = new (window.AudioContext || window.webkitAudioContext)();
  state.audioCtx = ac;

  const musicGain = ac.createGain();
  musicGain.gain.value = 0.14;
  musicGain.connect(ac.destination);
  state.musicGain = musicGain;
}

function startMusic() {
  if (!state.audioReady || state.musicTimerId) return;
  if (state.musicGain && state.audioCtx) {
    state.musicGain.gain.setTargetAtTime(0.14, state.audioCtx.currentTime, 0.06);
  }
  const tick = () => {
    if (state.mode !== "running") return;
    const i = state.musicStep % state.musicPattern.length;
    const root = state.musicPattern[i];
    playPianoNote(root, 0.22, 0.11);
    if (i % 2 === 0) playPianoNote(root - 12, 0.16, 0.055);
    state.musicStep += 1;
  };
  tick();
  state.musicTimerId = window.setInterval(tick, 220);
}

function stopMusic() {
  if (state.musicTimerId) {
    window.clearInterval(state.musicTimerId);
    state.musicTimerId = null;
  }
  if (state.musicGain && state.audioCtx) {
    state.musicGain.gain.setTargetAtTime(0, state.audioCtx.currentTime, 0.03);
  }
}

async function startOrRestartRun() {
  activateAudio();
  if (state.audioCtx?.state === "suspended") await state.audioCtx.resume();
  resetGame();
  startMusic();
}

function playFailWah() {
  if (!state.audioCtx) return;
  const ac = state.audioCtx;
  const gain = ac.createGain();
  gain.gain.value = 0.13;
  gain.connect(ac.destination);

  const osc = ac.createOscillator();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(430, ac.currentTime);
  osc.frequency.exponentialRampToValueAtTime(220, ac.currentTime + 0.28);
  osc.frequency.exponentialRampToValueAtTime(130, ac.currentTime + 0.62);
  osc.connect(gain);
  osc.start();
  osc.stop(ac.currentTime + 0.65);
}

function getTumbleweedMetrics(img) {
  if (!isImageReady(img)) return null;
  const cached = tumbleweedMeta.get(img);
  if (cached) return cached;

  const metrics = {
    // Safari-safe: avoid getImageData (can throw if canvas is tainted).
    cx: img.naturalWidth * 0.5,
    cy: img.naturalHeight * 0.5,
    minX: img.naturalWidth * 0.08,
    minY: img.naturalHeight * 0.08,
    maxX: img.naturalWidth * 0.92,
    maxY: img.naturalHeight * 0.92,
    w: img.naturalWidth,
    h: img.naturalHeight,
  };
  tumbleweedMeta.set(img, metrics);
  return metrics;
}

function spawnHazard() {
  const snakeReady = isImageReady(worldArt.snakeSide);
  const spawnSnake = snakeReady && state.hazardsSpawned > 1 && Math.random() < 0.3;
  if (spawnSnake) {
    const img = worldArt.snakeSide;
    const targetH = 84 + Math.random() * 20;
    const scale = targetH / img.naturalHeight;
    const visibleW = img.naturalWidth * scale;
    const visibleH = img.naturalHeight * scale;
    return {
      type: "snake",
      imgSide: worldArt.snakeSide,
      imgStrike: worldArt.snakeStrike,
      scale,
      visibleW,
      visibleH,
      radius: Math.max(14, visibleH * 0.32),
      rotation: 0,
      spin: 0,
      yFloor: FLOOR_Y + 4,
      enteredAt: null,
      speedMul: 0.56 + Math.random() * 0.1,
      isStriking: false,
      strikeTimer: 0,
      strikePhase: 0,
      deathPose: false,
    };
  }

  // Alternate tumbleweed art so both files are used consistently.
  const useFirst = state.hazardsSpawned % 2 === 0;
  const img = useFirst ? worldArt.tumbleweed1 : worldArt.tumbleweed2;
  const metrics = getTumbleweedMetrics(img);
  if (!metrics) {
    // Fallback obstacle if image decoding fails; keeps gameplay deterministic.
    const sizeRamp = Math.min(0.18, state.time / 95);
    const radius = (56 + Math.random() * 18) * (1 + sizeRamp);
    return {
      type: "tumbleweed_fallback",
      img: null,
      metrics: null,
      scale: 1,
      visibleW: radius * 2,
      visibleH: radius * 2,
      radius,
      rotation: Math.random() * Math.PI * 2,
      spin: -(4.8 + Math.random() * 2.4),
      yFloor: FLOOR_Y - 26 + Math.random() * 40,
      enteredAt: null,
    };
  }

  // Varied but still jumpable.
  const sizeRamp = Math.min(0.18, state.time / 95);
  const scale = (0.54 + Math.random() * 0.42) * (1 + sizeRamp);
  const visibleW = (metrics.maxX - metrics.minX + 1) * scale;
  const visibleH = (metrics.maxY - metrics.minY + 1) * scale;
  return {
    type: "tumbleweed",
    img,
    metrics,
    scale,
    visibleW,
    visibleH,
    radius: Math.max(16, Math.min(36, visibleW * 0.27)),
    rotation: Math.random() * Math.PI * 2,
    // Opposite tumble direction.
    spin: -(5.2 + Math.random() * 2.2),
    // Slight vertical variation around Zack's run line; always jumpable.
    yFloor: FLOOR_Y - 26 + Math.random() * 40,
    enteredAt: null,
    speedMul: 1,
  };
}

function computeSafeGap() {
  // Gap scales with speed to preserve roughly the same reaction window.
  const ramp = Math.max(0.62, 1 - state.time / 95);
  const gap = (980 + state.speed * 0.72) * ramp;
  return Math.round(gap * (state.autoPlay ? 1.28 : 1));
}

function isImageReady(img) {
  return Boolean(img && img.complete && img.naturalWidth > 0 && img.naturalHeight > 0);
}

function queueNextHazard() {
  const hazard = spawnHazard();
  if (!hazard) {
    state.nextHazardIn = 0.5;
    return;
  }
  const baseSpawnX = state.hazardsSpawned === 0
    ? WORLD_W + 90 + Math.random() * 140
    : WORLD_W + 340 + Math.random() * 220;
  const minGap = computeSafeGap();
  const x = Math.max(baseSpawnX, state.lastHazardEndX + minGap);
  state.hazards.push({ ...hazard, x, id: ++state.hazardIdSeq });
  state.lastHazardEndX = x + hazard.visibleW;
  state.hazardsSpawned += 1;
  if (hazard.type === "tumbleweed") {
    if (hazard.img === worldArt.tumbleweed1) state.tumbleweed1Spawned += 1;
    else if (hazard.img === worldArt.tumbleweed2) state.tumbleweed2Spawned += 1;
  }

  state.hazardStreak += 1;
  // Spawn cadence accelerates as the run goes on.
  const cadence = Math.max(0.52, 1 - state.time / 80);
  const longBreak = state.hazardStreak >= 2 || Math.random() < 0.28;
  if (longBreak) {
    state.hazardStreak = 0;
    state.nextHazardIn = (1.8 + Math.random() * 0.9) * cadence;
  } else {
    state.nextHazardIn = (1.2 + Math.random() * 0.6) * cadence;
  }
}

function getPlayerRect() {
  const p = state.player;
  return {
    left: p.x - p.width * 0.34,
    right: p.x + p.width * 0.34,
    top: p.y - p.height,
    bottom: p.y,
  };
}

function rectsOverlap(a, b) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

function circleRectOverlap(cx, cy, r, rect) {
  const nearestX = Math.max(rect.left, Math.min(cx, rect.right));
  const nearestY = Math.max(rect.top, Math.min(cy, rect.bottom));
  const dx = cx - nearestX;
  const dy = cy - nearestY;
  return dx * dx + dy * dy <= r * r;
}

function shouldAutoJump() {
  const p = state.player;
  if (!state.autoPlay || state.mode !== "running" || !p.onGround) return false;
  // Autoplay uses world-space hazard/player coordinates only, so camera zoom/pan does not affect timing.
  let bestDecision = null;
  const playerLeft = p.x - p.width * 0.23;
  const playerRight = p.x + p.width * 0.23;
  const apexTime = 980 / 2500; // 0.392s for current jump/gravity.

  for (const h of state.hazards) {
    const hx = h.x;
    const speed = Math.max(120, state.speed * (h.speedMul || 1));
    const tFront = (hx - playerRight) / speed;
    const tBack = (hx + (h.visibleW || 120) - playerLeft) / speed;
    if (tBack < -0.02 || tFront > 1.2) continue;

    const requiredClear = Math.max(
      62,
      Math.min(168, 46 + (h.visibleH || 80) * 0.4 + (h.type === "snake" ? 24 : 0))
    );
    const disc = 980 * 980 - 4 * 1250 * requiredClear;
    const hasWindow = disc > 0;
    const clearanceMid = hasWindow ? apexTime : 0.43;
    const hazardMid = (Math.max(0, tFront) + Math.max(0, tBack)) * 0.5;
    const desiredStartIn = hazardMid - clearanceMid;

    const emergencyDist = (h.visibleW || 120) * 0.62 + 112 + (h.type === "snake" ? 32 : 0);
    const emergency = (hx - playerRight) <= emergencyDist;
    const snakeWindow = h.type === "snake" && desiredStartIn <= 0.24 && desiredStartIn >= -0.26;
    const shouldJumpNow = emergency || snakeWindow || (desiredStartIn <= 0.16 && desiredStartIn >= -0.2);
    if (shouldJumpNow) {
      if (!bestDecision || hazardMid < bestDecision.hazardMid) {
        bestDecision = { hazardMid };
      }
    }
  }
  return Boolean(bestDecision);
}

function getHazardBounce(h) {
  const amp = Math.max(4, Math.min(16, (h.visibleH || 60) * 0.08));
  return Math.sin(h.rotation * 1.15 + (h.id || 0) * 0.7) * amp;
}

function updatePlayerDrift(dt) {
  const p = state.player;
  if (!p.onGround || state.mode !== "running") return;

  p.driftTimer -= dt;
  if (p.driftTimer <= 0) {
    if (p.driftRightPhase) {
      p.driftTargetX = randBetween(370, 488);
      p.driftTimer = randBetween(1.5, 2.6);
    } else {
      p.driftTargetX = randBetween(244, 330);
      p.driftTimer = randBetween(3.8, 6.3);
    }
    p.driftRightPhase = !p.driftRightPhase;
  }

  const easing = p.driftTargetX < p.x ? 0.42 : 0.92;
  p.x += (p.driftTargetX - p.x) * Math.min(1, dt * easing);
  p.x = clamp(p.x, 238, 500);
}

function fail(reason, hitHazard = null) {
  if (state.mode !== "running") return;
  state.mode = "failed";
  state.failReason = reason;
  state.splatTimer = 0.64;
  // Freeze directly into the final death pose.
  state.failAnimTime = 0.95;
  state.hitHazardId = hitHazard?.id ?? null;
  if (!state.autoPlay) {
    state.best = Math.max(state.best, state.score);
  }
  state.player.expression = "horror";
  if (reason === "killed by a snake bite") {
    state.player.y = FLOOR_Y;
    state.player.vy = 0;
    state.player.onGround = true;
    state.player.flipActive = false;
    state.player.flipProgress = 0;
    if (hitHazard) {
      hitHazard.x = state.player.x - hitHazard.visibleW * 0.38;
      hitHazard.yFloor = FLOOR_Y + 2;
      hitHazard.isStriking = true;
      hitHazard.strikeTimer = 0.34;
      hitHazard.strikePhase = 1;
      hitHazard.deathPose = true;
    }
  }
  setStatus(`Splat: ${reason}. Press R, Enter, or Start to restart.`);
  stopMusic();
  playFailWah();
}

function finishRun() {
  if (state.mode !== "running") return;
  state.mode = "finished";
  if (!state.autoPlay) {
    state.best = Math.max(state.best, state.score);
  }
  state.player.expression = "joy";
  setStatus("Run complete. Press R, Enter, or Start to play again.");
  stopMusic();
}

function update(dt) {
  dt = Math.min(dt, 1 / 20);
  if (state.mode !== "running") {
    // Freeze background/parallax before start and after death.
    // Keep tumbleweeds rolling post-death for atmosphere.
    if (state.mode === "failed") {
      for (const h of state.hazards) {
        if (h.type === "tumbleweed" || h.type === "tumbleweed_fallback") {
          h.x -= state.speed * (h.speedMul || 1) * dt;
          h.rotation += (h.spin || 0) * dt;
        }
      }
      state.hazards = state.hazards.filter((h) => h.x + h.visibleW > -140);

      // If snake killed Zack, keep snake striking in place.
      if (state.failReason === "killed by a snake bite" && state.hitHazardId !== null) {
        const killer = state.hazards.find((h) => h.id === state.hitHazardId && h.type === "snake");
        if (killer) {
          killer.x = state.player.x - killer.visibleW * 0.38;
          killer.yFloor = FLOOR_Y + 2;
          killer.deathPose = true;
          killer.strikePause = (killer.strikePause ?? 0.38) - dt;
          if (!killer.isStriking && killer.strikePause <= 0) {
            killer.isStriking = true;
            killer.strikeTimer = 0.34;
            killer.strikePause = 0.75 + Math.random() * 0.45;
          }
          if (killer.isStriking) {
            killer.strikeTimer = Math.max(0, (killer.strikeTimer || 0) - dt);
            const progress = 1 - killer.strikeTimer / 0.34;
            killer.strikePhase = Math.sin(Math.max(0, Math.min(1, progress)) * Math.PI);
            if (killer.strikeTimer <= 0) {
              killer.isStriking = false;
              killer.strikePhase = 0;
            }
          } else {
            killer.strikePhase = 0;
          }
        }
      }
    }
    return;
  }

  state.time += dt;
  state.autoRescueCooldown = Math.max(0, state.autoRescueCooldown - dt);

  state.speed = Math.min(MAX_RUN_SPEED, state.speed + dt * 9.8);
  state.score += Math.round(dt * 29 + state.speed * 0.015);

  const p = state.player;
  p.runCycle += dt * (state.speed / 160);
  p.inWater = false;
  updatePlayerDrift(dt);

  if (shouldAutoJump()) input.jumpPressed = true;

  if (input.jumpPressed && p.onGround) {
    p.vy = state.autoPlay ? -1160 : -980;
    p.onGround = false;
    p.airSprite = Math.random() < AIR_JOY_CHANCE ? "joy" : "jump";
    p.flipActive = false;
    p.flipProgress = 0;

    // Sometimes add a full clockwise somersault over larger incoming hazards.
    const nextHazard = state.hazards.find((h) => h.x > p.x && h.x - p.x < 420);
    const largeHazard = Boolean(nextHazard && (nextHazard.visibleW > 150 || nextHazard.visibleH > 95));
    if ((largeHazard && Math.random() < 0.85) || (!largeHazard && Math.random() < 0.2)) {
      p.flipActive = true;
      p.flipProgress = 0;
    }
  }
  input.jumpPressed = false;

  if (input.diveHeld && !p.onGround && p.vy > -60) p.vy += 820 * dt;

  p.vy += GRAVITY * dt;
  p.y += p.vy * dt;
  if (p.y >= FLOOR_Y) {
    p.y = FLOOR_Y;
    p.vy = 0;
    p.onGround = true;
    p.flipActive = false;
    p.flipProgress = 0;
  } else {
    p.onGround = false;
    if (p.flipActive) {
      p.flipProgress = Math.min(1, p.flipProgress + dt / 0.58);
      if (p.flipProgress >= 1) p.flipActive = false;
    }
  }

  // Keep scenery static while jumping/airborne.
  const sceneryDt = p.onGround ? dt : 0;
  state.sceneTime += sceneryDt;
  for (const c of state.clouds) {
    c.x -= CLOUD_SCROLL_SPEED * c.speedMul * sceneryDt;
    if (c.x < -480) {
      c.x = WORLD_W + Math.random() * 260;
      c.y = 24 + Math.random() * 66;
    }
  }

  state.nextHazardIn -= dt;
  if (state.hazardsSpawned === 0 && state.time > 4.5 && state.nextHazardIn > 0.12) {
    state.nextHazardIn = 0.12;
  }
  if (state.nextHazardIn <= 0) {
    queueNextHazard();
  }

  for (const h of state.hazards) {
    h.x -= state.speed * (h.speedMul || 1) * dt;
    h.rotation += (h.spin || 0) * dt;
    if (h.type === "snake") {
      const nearPlayer = h.x < p.x + 340 && h.x + h.visibleW > p.x - 90;
      if (!h.isStriking && nearPlayer) {
        h.isStriking = true;
        h.strikeTimer = 0.62;
      }
      if (h.isStriking) {
        h.strikeTimer = Math.max(0, h.strikeTimer - dt);
        const progress = 1 - h.strikeTimer / 0.62;
        h.strikePhase = Math.sin(Math.max(0, Math.min(1, progress)) * Math.PI);
        if (h.strikeTimer <= 0) {
          h.isStriking = false;
          h.strikePhase = 0;
        }
      } else {
        h.strikePhase = 0;
      }
    }
    if (h.enteredAt === null && h.x + h.visibleW < WORLD_W - 16) {
      h.enteredAt = state.time;
    }
  }
  state.hazards = state.hazards.filter((h) => h.x + h.visibleW > -90);

  let pr = getPlayerRect();
  let panicUsed = false;
  for (const h of state.hazards) {
    if (h.enteredAt === null || state.time - h.enteredAt < 0.45) continue;
    const bodyLeft = state.player.x - state.player.width * 0.23;
    const bodyRight = state.player.x + state.player.width * 0.23;
    const hazardX = h.x;
    const overlapX = hazardX < bodyRight && hazardX + h.visibleW > bodyLeft;
    const jumpedClear = state.player.y < FLOOR_Y - 65;
    if (overlapX && !jumpedClear) {
      if (state.autoPlay && state.player.onGround && !panicUsed) {
        panicUsed = true;
        state.player.vy = -1180;
        state.player.onGround = false;
        state.player.y = Math.max(FLOOR_Y - 120, state.player.y - 120);
        state.player.airSprite = "jump";
        state.player.flipActive = false;
        state.player.flipProgress = 0;
        pr = getPlayerRect();
        continue;
      }
      if (state.autoPlay && state.autoRescueCooldown <= 0) {
        state.autoRescueCooldown = 0.33;
        state.player.vy = Math.min(state.player.vy, -1120);
        state.player.y = Math.max(FLOOR_Y - 215, state.player.y - (h.type === "snake" ? 68 : 58));
        state.player.onGround = false;
        state.player.airSprite = "jump";
        state.player.flipActive = false;
        state.player.flipProgress = 0;
        pr = getPlayerRect();
        continue;
      }
      fail(h.type === "snake" ? "killed by a snake bite" : "hit a tumbleweed", h);
      return;
    }

    let cx;
    let cy;
    const bounce = getHazardBounce(h);
    if (h.type === "tumbleweed_fallback") {
      cx = hazardX + h.radius;
      cy = h.yFloor - h.radius - bounce;
    } else if (h.type === "snake") {
      cx = hazardX + h.visibleW * 0.48;
      cy = h.yFloor - h.visibleH * 0.44;
    } else {
      cx = hazardX + h.metrics.cx * h.scale;
      cy = h.yFloor - (h.metrics.maxY - h.metrics.cy) * h.scale - bounce;
    }
    if (circleRectOverlap(cx, cy, h.radius, pr)) {
      if (state.autoPlay && state.autoRescueCooldown <= 0) {
        state.autoRescueCooldown = 0.33;
        state.player.vy = Math.min(state.player.vy, -1080);
        state.player.y = Math.max(FLOOR_Y - 205, state.player.y - (h.type === "snake" ? 58 : 48));
        state.player.onGround = false;
        state.player.airSprite = "jump";
        state.player.flipActive = false;
        state.player.flipProgress = 0;
        pr = getPlayerRect();
        continue;
      }
      fail(h.type === "snake" ? "killed by a snake bite" : "hit a tumbleweed", h);
      return;
    }
  }

  if (state.mode === "failed") p.expression = "horror";
  else if (!p.onGround) p.expression = "joy";
  else p.expression = "neutral";

  updateCamera(dt);
}

function drawBackground() {
  const nearSpeed = BACKGROUND_SCROLL_SPEED * 2.6 + state.speed * 0.06;
  const t = state.sceneTime;

  if (isImageReady(worldArt.farBackground)) {
    // Slow parallax drift with horizontal tiling.
    const parallaxSpeed = BACKGROUND_SCROLL_SPEED;
    const trimX = 2;
    const srcW = Math.max(1, worldArt.farBackground.width - trimX * 2);
    const scale = WORLD_H / worldArt.farBackground.height;
    const tileW = srcW * scale;
    const offset = -((t * parallaxSpeed) % tileW);
    for (let x = offset - tileW; x < WORLD_W + tileW; x += tileW) {
      ctx.drawImage(
        worldArt.farBackground,
        trimX,
        0,
        srcW,
        worldArt.farBackground.height,
        x - 2,
        0,
        Math.ceil(tileW) + 4,
        WORLD_H
      );
    }

    // Intermediate strip sampled from above the horizon to blend far and near layers.
    const sourceY = Math.floor(worldArt.farBackground.height * 0.62);
    const sourceH = Math.floor(worldArt.farBackground.height * 0.2);
    const midH = Math.round(WORLD_H * 0.14);
    const nearHForY = Math.round(WORLD_H * 0.33);
    const midY = WORLD_H - nearHForY - Math.round(midH * 0.58);
    const midScale = midH / sourceH;
    const midTileW = srcW * midScale;
    const midSpeed = (parallaxSpeed + nearSpeed) * 0.5;
    const midOffset = -((t * midSpeed) % midTileW);
    ctx.save();
    ctx.globalAlpha = 0.34;
    for (let x = midOffset - midTileW; x < WORLD_W + midTileW; x += midTileW) {
      ctx.drawImage(
        worldArt.farBackground,
        trimX,
        sourceY,
        srcW,
        sourceH,
        x - 2,
        midY,
        Math.ceil(midTileW) + 4,
        midH
      );
    }
    ctx.restore();
  } else {
    const g = ctx.createLinearGradient(0, 0, 0, WORLD_H);
    g.addColorStop(0, "#4c5f7b");
    g.addColorStop(0.6, "#1f2e46");
    g.addColorStop(1, "#0f1826");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, WORLD_W, WORLD_H);
  }

  if (isImageReady(worldArt.nearBackground)) {
    // Near ground layer moves faster than the far background.
    const nearH = Math.round(WORLD_H * 0.33);
    const nearScale = nearH / worldArt.nearBackground.height;
    const nearTrimX = 3;
    const nearSrcW = Math.max(1, worldArt.nearBackground.width - nearTrimX * 2);
    const nearW = nearSrcW * nearScale;
    const nearY = WORLD_H - nearH;
    const nearOffset = -((t * nearSpeed) % nearW);
    for (let x = nearOffset - nearW; x < WORLD_W + nearW; x += nearW) {
      ctx.drawImage(
        worldArt.nearBackground,
        nearTrimX,
        0,
        nearSrcW,
        worldArt.nearBackground.height,
        x - 2,
        nearY,
        Math.ceil(nearW) + 4,
        nearH
      );
    }

    // Soft seam blend between distance layer and near foreground.
    const seamTop = nearY - 30;
    ctx.save();
    ctx.filter = "blur(8px)";
    const seam = ctx.createLinearGradient(0, seamTop, 0, nearY + 20);
    seam.addColorStop(0, "rgba(244,190,162,0.16)");
    seam.addColorStop(0.45, "rgba(237,167,136,0.26)");
    seam.addColorStop(1, "rgba(237,167,136,0)");
    ctx.fillStyle = seam;
    ctx.fillRect(-30, seamTop, WORLD_W + 60, 64);
    ctx.restore();
  }

  if (isImageReady(worldArt.clouds)) {
    const cloudDefaultScale = 0.5;
    ctx.globalAlpha = 0.3;
    for (const c of state.clouds) {
      const w = worldArt.clouds.width * cloudDefaultScale * c.scale * 4;
      const h = worldArt.clouds.height * cloudDefaultScale * c.scale * 2;
      ctx.drawImage(worldArt.clouds, Math.round(c.x), Math.round(c.y), w, h);
    }
    ctx.globalAlpha = 1;
  }
}

function drawHazard(h) {
  if (h.type === "snake") {
    const strikePhase = h.strikePhase || 0;
    const activeImg = strikePhase > 0.08 && isImageReady(h.imgStrike) ? h.imgStrike : h.imgSide;
    const drawW = h.visibleW * (1 + strikePhase * 0.14);
    const drawH = h.visibleH * (1 - strikePhase * 0.08);
    const centerX = h.x + h.visibleW * 0.5;
    const centerY = h.yFloor - h.visibleH * 0.5;
    const angle = (h.deathPose ? -0.6 : 0) - strikePhase * (h.deathPose ? 0.22 : 0.06);
    if (isImageReady(activeImg)) {
      ctx.save();
      ctx.translate(centerX, centerY);
      ctx.rotate(angle);
      ctx.drawImage(activeImg, -drawW * 0.5, -drawH * 0.5, drawW, drawH);
      ctx.restore();
    } else {
      ctx.fillStyle = "#4b3a2a";
      ctx.fillRect(centerX - drawW * 0.5, centerY - drawH * 0.1, drawW, drawH * 0.5);
    }
    ctx.fillStyle = "rgba(20,16,12,0.32)";
    ctx.beginPath();
    ctx.ellipse(
      centerX,
      FLOOR_Y + 10,
      Math.max(18, drawW * 0.34),
      10,
      0,
      0,
      Math.PI * 2
    );
    ctx.fill();
    return;
  }

  const bounce = getHazardBounce(h);
  if (h.type === "tumbleweed_fallback") {
    const px = h.x + h.radius;
    const py = h.yFloor - h.radius - bounce;

    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(h.rotation);
    ctx.fillStyle = "#7a5a39";
    ctx.beginPath();
    ctx.arc(0, 0, h.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(245,225,190,0.4)";
    ctx.lineWidth = 2;
    for (let i = 0; i < 10; i += 1) {
      const a = (i / 10) * Math.PI * 2;
      const r1 = h.radius * 0.25;
      const r2 = h.radius * 1.02;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * r1, Math.sin(a) * r1);
      ctx.lineTo(Math.cos(a) * r2, Math.sin(a) * r2);
      ctx.stroke();
    }
    ctx.restore();

    ctx.fillStyle = "rgba(20,16,12,0.32)";
    ctx.beginPath();
    ctx.ellipse(px, FLOOR_Y + 8 - bounce * 0.45, Math.max(24, h.radius * 0.9), 11, 0, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  if (h.type !== "tumbleweed") return;
  if (!isImageReady(h.img)) return;

  const drawW = h.metrics.w * h.scale;
  const drawH = h.metrics.h * h.scale;
  const drawY = h.yFloor - h.metrics.maxY * h.scale - bounce;

  const pivotX = h.metrics.cx * h.scale;
  const pivotY = h.metrics.cy * h.scale;
  const px = h.x + pivotX;
  const py = drawY + pivotY;

  // Dark backing ring increases readability against bright sand.
  ctx.fillStyle = "rgba(32, 22, 12, 0.25)";
  ctx.beginPath();
  ctx.arc(px, py, Math.max(16, h.radius * 0.95), 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(h.rotation);
  // Fringe suppression: darken bright edge pixels first, then draw softened normal pass.
  // This avoids getImageData/canvas-taint paths while reducing white extraction halos.
  ctx.globalCompositeOperation = "multiply";
  ctx.globalAlpha = 0.68;
  ctx.drawImage(h.img, -pivotX, -pivotY, drawW, drawH);
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 0.84;
  ctx.filter = "contrast(1.06) saturate(1.05)";
  ctx.drawImage(h.img, -pivotX, -pivotY, drawW, drawH);
  ctx.filter = "none";
  ctx.globalAlpha = 1;
  ctx.restore();

  // Subtle shadow helps visibility against bright terrain.
  ctx.fillStyle = "rgba(20,16,12,0.32)";
  ctx.beginPath();
  ctx.ellipse(px, FLOOR_Y + 8 - bounce * 0.45, Math.max(24, h.radius * 0.9), 11, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawSegment(x1, y1, x2, y2, width, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function drawPlayer() {
  const p = state.player;
  let sprite = zackSprites.run1;
  if (state.mode === "failed") sprite = zackSprites.horror;
  else if (state.mode === "finished") sprite = zackSprites.joy;
  else if (!p.onGround) sprite = p.airSprite === "joy" ? zackSprites.joy : zackSprites.jump;
  else sprite = Math.sin(p.runCycle * 9) > 0 ? zackSprites.run1 : zackSprites.run2;

  const w = 180;
  const h = 250;
  const x = p.x - w / 2;
  const y = p.y - h;

  const jumpAmount = Math.max(0, Math.min(1, (FLOOR_Y - p.y) / 240));
  const shadowW = 58 * (1 - 0.45 * jumpAmount);
  const shadowH = 14 * (1 - 0.35 * jumpAmount);
  const shadowY = FLOOR_Y + 6 + jumpAmount * 4;
  ctx.fillStyle = `rgba(0,0,0,${0.22 - jumpAmount * 0.08})`;
  ctx.beginPath();
  ctx.ellipse(p.x, shadowY, shadowW, shadowH, 0, 0, Math.PI * 2);
  ctx.fill();

  const tumbleweedKO = state.mode === "failed" && state.failReason === "hit a tumbleweed";
  const snakeKO = state.mode === "failed" && state.failReason === "killed by a snake bite";
  if (tumbleweedKO) {
    const t = Math.min(1, state.failAnimTime / 0.95);
    const ease = 1 - (1 - t) ** 3;
    const angle = -(Math.PI / 2) * ease;
    // After rotation, local Y maps to horizontal screen axis.
    // Shrink local X and expand local Y so the result is flattened horizontally.
    const squashX = Math.max(0.54, 1 - 0.46 * ease);
    const squashY = 1 + 0.52 * ease;
    const xShift = -44 * ease;
    const yDrop = 44 * ease;
    const halfSpanX = (h * squashY) / 2 + 10;
    const splatX = Math.max(halfSpanX, Math.min(WORLD_W - halfSpanX, p.x + xShift + 10));

    ctx.save();
    ctx.translate(splatX, FLOOR_Y + 6);
    ctx.rotate(angle);
    ctx.scale(squashX, squashY);
    if (isImageReady(zackSprites.horror)) {
      ctx.drawImage(zackSprites.horror, -w / 2, -h + yDrop, w, h);
    } else {
      ctx.fillStyle = "#6a7585";
      ctx.fillRect(-50, -170 + yDrop, 100, 170);
    }
    ctx.restore();
  } else if (snakeKO) {
    const angle = -Math.PI / 2;
    const layScaleX = 0.76;
    const layScaleY = 1.04;
    const yDrop = 32;
    const halfSpanX = (h * layScaleY) / 2 + 10;
    const lieX = Math.max(halfSpanX, Math.min(WORLD_W - halfSpanX, p.x - 12));
    ctx.save();
    ctx.translate(lieX, FLOOR_Y + 8);
    ctx.rotate(angle);
    ctx.scale(layScaleX, layScaleY);
    if (isImageReady(zackSprites.horror)) {
      ctx.drawImage(zackSprites.horror, -w / 2, -h + yDrop, w, h);
    } else {
      ctx.fillStyle = "#6a7585";
      ctx.fillRect(-50, -170 + yDrop, 100, 170);
    }
    ctx.restore();
  } else if (isImageReady(sprite)) {
    if (!p.onGround && p.flipActive) {
      const angle = Math.PI * 2 * Math.max(0, Math.min(1, p.flipProgress));
      ctx.save();
      ctx.translate(p.x, p.y - h * 0.52);
      ctx.rotate(angle);
      ctx.drawImage(sprite, -w / 2, -h * 0.48, w, h);
      ctx.restore();
    } else {
      ctx.drawImage(sprite, x, y, w, h);
    }
  } else {
    ctx.fillStyle = "#6a7585";
    ctx.fillRect(x + 40, y + 40, 100, 190);
  }

  if (state.mode === "failed" && state.splatTimer > 0) {
    ctx.fillStyle = `rgba(197,52,52,${Math.min(0.64, state.splatTimer)})`;
    ctx.beginPath();
    ctx.ellipse(p.x, FLOOR_Y + 10, 92, 20, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawHud() {
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.shadowColor = "rgba(10,12,16,0.58)";
  ctx.shadowBlur = 2;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 2;
  ctx.fillStyle = "#f0ddb2";
  ctx.font = "bold 56px Georgia";
  ctx.fillText(`Score ${state.score}`, 22, 16);
  ctx.font = "bold 42px Georgia";
  ctx.fillStyle = "#d2dceb";
  ctx.fillText(`Best ${state.best}`, 24, 82);
  ctx.shadowColor = "transparent";

  if (state.mode === "failed" || state.mode === "finished") {
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = "rgba(10,12,16,0.65)";
    ctx.shadowBlur = 4;
    ctx.shadowOffsetY = 2;
    ctx.fillStyle = state.mode === "failed" ? "#f4d9d9" : "#dff4d9";
    ctx.font = "bold 84px Georgia";
    ctx.fillText(state.mode === "failed" ? "SPLAT" : "VICTORY", WORLD_W * 0.5, 258);
    ctx.font = "34px Georgia";
    ctx.fillStyle = "#f0e7d3ee";
    if (state.mode === "failed") {
      ctx.fillText(`Cause: ${state.failReason}`, WORLD_W * 0.5, 324);
    } else {
      ctx.fillText(`Final Score: ${state.score}`, WORLD_W * 0.5, 324);
    }
    ctx.fillText("Press R, Enter, or Start to run again", WORLD_W * 0.5, 374);
    ctx.shadowColor = "transparent";
  }

  // Discreet build marker.
  ctx.textAlign = "right";
  ctx.textBaseline = "bottom";
  ctx.font = "14px Georgia";
  ctx.fillStyle = "rgba(214, 224, 238, 0.52)";
  ctx.fillText(`Build ${BUILD_ID}`, WORLD_W - 14, WORLD_H - 10);
}

function render() {
  ctx.clearRect(0, 0, WORLD_W, WORLD_H);
  const camera = state.camera;
  ctx.save();
  ctx.translate(WORLD_W * 0.5, WORLD_H * 0.5);
  ctx.scale(camera.zoom, camera.zoom);
  ctx.translate(-camera.x, -camera.y);
  drawBackground();
  drawPlayer();
  for (const h of state.hazards) drawHazard(h);
  ctx.restore();
  drawHud();
}

let last = performance.now();
let loopErrored = false;
function frame(now) {
  const dt = (now - last) / 1000;
  last = now;
  try {
    update(dt);
    render();
  } catch (err) {
    console.error("Frame loop error:", err);
    state.lastError = String(err?.message || err);
    if (!loopErrored) {
      loopErrored = true;
      state.mode = "failed";
      state.failReason = "runtime error";
      state.player.expression = "horror";
      setStatus(`Runtime error: ${state.lastError}. Press R, Enter, or Start to restart.`);
    }
    render();
  }
  requestAnimationFrame(frame);
}

function resizeCanvas() {
  const wrap = canvas.parentElement;
  if (!wrap) return;
  canvas.style.width = `${wrap.clientWidth}px`;
  canvas.style.height = `${wrap.clientHeight}px`;
}

function setJump(active) {
  if (active && !input.jumpHeld) input.jumpPressed = true;
  input.jumpHeld = active;
}

window.addEventListener("resize", resizeCanvas);
window.addEventListener("keydown", (e) => {
  if ((e.code === "KeyR" || e.code === "Enter") && state.mode !== "running") {
    e.preventDefault();
    startOrRestartRun();
    return;
  }
  if (e.code === "Space" || e.code === "ArrowUp") {
    e.preventDefault();
    setJump(true);
  }
  if (e.code === "ArrowDown") input.diveHeld = true;
  if (e.code === "KeyP") {
    state.autoPlay = !state.autoPlay;
    setStatus(state.autoPlay
      ? "Autoplay ON (P toggles). Zack auto-jumps."
      : "Autoplay OFF. Manual jump active.");
  }
  if (e.key === "f" || e.key === "F") toggleFullscreen();
});
window.addEventListener("keyup", (e) => {
  if (e.code === "Space" || e.code === "ArrowUp") setJump(false);
  if (e.code === "ArrowDown") input.diveHeld = false;
});

canvas.addEventListener("pointerdown", (e) => {
  if (state.mode !== "running") {
    startOrRestartRun();
    return;
  }
  const x = e.offsetX / canvas.clientWidth;
  if (x > 0.5) setJump(true);
});
canvas.addEventListener("pointerup", () => setJump(false));
canvas.addEventListener("pointercancel", () => setJump(false));
startBtn?.addEventListener("click", async () => {
  await startOrRestartRun();
});

function toggleFullscreen() {
  const elem = document.documentElement;
  if (!document.fullscreenElement) elem.requestFullscreen?.();
  else document.exitFullscreen?.();
}

window.addEventListener("error", (e) => {
  state.lastError = String(e?.message || "unknown error");
});

window.render_game_to_text = () => {
  const p = state.player;
  return JSON.stringify({
    coordinateSystem: "origin top-left, +x right, +y down",
    mode: state.mode,
    autoPlay: state.autoPlay,
    player: {
      x: Math.round(p.x),
      y: Math.round(p.y),
      vy: Math.round(p.vy),
      onGround: p.onGround,
      inWater: p.inWater,
      expressionCategory: p.expression,
    },
    speed: Math.round(state.speed),
    maxSpeed: MAX_RUN_SPEED,
    score: state.score,
    targetScore: TARGET_SCORE,
    hazards: state.hazards.slice(0, 6).map((h) => ({
      type: h.type,
      x: Math.round(h.x),
      w: Math.round(h.visibleW ?? 0),
      rotation: Number((h.rotation ?? 0).toFixed(2)),
    })),
    failReason: state.failReason,
    camera: {
      zoom: Number(state.camera.zoom.toFixed(3)),
      targetZoom: Number(state.camera.targetZoom.toFixed(3)),
      playerScreenX: Math.round((p.x - state.camera.x) * state.camera.zoom + WORLD_W * 0.5),
    },
    lastError: state.lastError,
  });
};

window.advanceTime = (ms) => {
  const steps = Math.max(1, Math.round(ms / (1000 / 60)));
  const dt = ms / 1000 / steps;
  for (let i = 0; i < steps; i += 1) update(dt);
  render();
};

resizeCanvas();
render();
requestAnimationFrame(frame);
