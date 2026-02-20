(() => {
  const statusText = document.getElementById("status-text");
  const urlParams = new URLSearchParams(window.location.search);

  const WORLD_W = 1920;
  const WORLD_H = 864;
  const IS_TOUCH_FULLSCREEN = window.matchMedia("(hover: none) and (pointer: coarse)").matches;
  const IS_STANDALONE_APP =
    window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  const TEST_MODE = urlParams.get("test") === "1";
  const FLOOR_Y = 655;
  const GRAVITY = 2500;
  const TARGET_SCORE = 12000;
  const BACKGROUND_SCROLL_SPEED = 10;
  const CLOUD_SCROLL_SPEED = BACKGROUND_SCROLL_SPEED * 2;
  const MAX_RUN_SPEED = Math.round(770 * 0.75);
  const BUILD_ID = "2026-02-20-2158";
  const TOUCH_GUIDE_HIDE_SECONDS = 4.2;
  const DOUBLE_TAP_WINDOW_MS = 280;
  const AUTO_TAP_SEQUENCE_WINDOW_MS = 920;
  const SWIPE_TRIGGER_PX = 34;
  const SWIPE_VERTICAL_RATIO = 1.15;
  const COMBO_JUMP_WINDOW_SECONDS = 0.45;
  const NORMAL_JUMP_VELOCITY = -980;
  const AUTO_JUMP_VELOCITY = -1160;
  const COMBO_JUMP_VELOCITY = -1420;
  const EAGLE_COMBO_CLEARANCE = 168;
  const HAZARD_SHADOW_DEPTH = 168;
  const HAZARD_BODY_DEPTH = 176;
  const AIR_JOY_CHANCE = 0.18;
  const CAMERA_BASE_SCREEN_X = WORLD_W * 0.27;
  const CAMERA_HEADWAY_SCREEN_X = WORLD_W * 0.4;
  const PLAYER_BASE_X = 320;
  const PLAYER_BASE_DISPLAY_W = 180;
  const PLAYER_BASE_DISPLAY_H = 250;
  const DEATH_POSE_SIZE_BOOST = 1.5;
  const DEATH_POSE_PERSPECTIVE_X = 1.12;
  const DEATH_POSE_PERSPECTIVE_Y = 0.78;
  const SNAKE_FAIL_RETREAT_DISTANCE = WORLD_W * 0.25;
  const PLAYER_VISUAL_SIZE_BIAS = {
    run1: 1,
    run2: 1,
    jump: 0.98,
    joy: 1.23,
    horror: 0.94,
  };

  const input = {
    jumpPressed: false,
    jumpHeld: false,
    diveHeld: false,
    touchLeftCount: 0,
    touchRightCount: 0,
  };

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
    hazardsSinceSnake: 0,
    hazardsSinceEagle: 0,
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
      duck: false,
      expression: "neutral",
      airSprite: "jump",
      flipActive: false,
      flipProgress: 0,
      runCycle: 0,
      driftTargetX: PLAYER_BASE_X,
      driftTimer: 1.8,
      driftRightPhase: true,
      wasDuckingLastFrame: false,
      crouchComboTimer: 0,
      comboJumpActive: false,
      deathJoltOffset: 0,
      deathJoltVelocity: 0,
    },
    testSpawnQueue: [],
    hazards: [],
    failAnimTime: 0,
    hitHazardId: null,
    lastError: "",
    audioReady: false,
    audioCtx: null,
    musicGain: null,
    musicTimerId: null,
    musicPattern: [64, 67, 71, 67, 62, 66, 69, 66],
    musicStep: 0,
    audioPrimed: false,
    musicShouldPlay: false,
    soundMuted: false,
    autoDebug: {
      enabled: true,
      lastLogAt: -999,
      events: [],
      lastJumpDecision: null,
    },
  };

  function setStatus(message) {
    if (statusText) statusText.textContent = message;
  }

  function formatClock(totalSeconds) {
    const safe = Math.max(0, Math.floor(totalSeconds));
    const mins = Math.floor(safe / 60);
    const secs = safe % 60;
    return `${mins}:${String(secs).padStart(2, "0")}`;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function randBetween(min, max) {
    return min + Math.random() * (max - min);
  }

  function syncTouchViewportVars() {
    if (!IS_TOUCH_FULLSCREEN) return;
    const root = document.documentElement;
    if (!root) return;
    const vv = window.visualViewport;
    const vw = Math.max(1, Math.round(vv?.width || window.innerWidth || WORLD_W));
    const vh = Math.max(1, Math.round(vv?.height || window.innerHeight || WORLD_H));
    root.style.setProperty("--app-vw", `${vw}px`);
    root.style.setProperty("--app-vh", `${vh}px`);
  }

  function normalizeHazardType(type) {
    if (typeof type !== "string") return null;
    const value = type.trim().toLowerCase();
    if (value === "snake" || value === "eagle" || value === "tumbleweed") return value;
    return null;
  }

  function midiToFreq(midi) {
    return 440 * 2 ** ((midi - 69) / 12);
  }

  function pushAutoLog(event, details = null, force = false) {
    if (!state.autoPlay || !state.autoDebug.enabled) return;
    if (!force && state.time - state.autoDebug.lastLogAt < 0.12) return;
    state.autoDebug.lastLogAt = state.time;
    const entry = {
      t: Number(state.time.toFixed(3)),
      event,
      details: details || {},
    };
    state.autoDebug.events.push(entry);
    if (state.autoDebug.events.length > 160) state.autoDebug.events.splice(0, state.autoDebug.events.length - 160);
    console.log("[AUTO]", entry);
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
    if (state.audioCtx) {
      state.audioReady = true;
      return;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ac = new Ctx();
    state.audioCtx = ac;
    state.audioReady = true;

    const musicGain = ac.createGain();
    musicGain.gain.value = state.soundMuted ? 0.00001 : 0.22;
    musicGain.connect(ac.destination);
    state.musicGain = musicGain;
    ac.onstatechange = () => {
      if (ac.state !== "running") return;
      primeAudioContext();
      if (state.musicShouldPlay && state.mode === "running") startMusic();
    };
  }

  function applySoundState(immediate = false) {
    if (!state.musicGain || !state.audioCtx) return;
    const target = state.soundMuted ? 0.00001 : 0.22;
    if (immediate) state.musicGain.gain.setValueAtTime(target, state.audioCtx.currentTime);
    else state.musicGain.gain.setTargetAtTime(target, state.audioCtx.currentTime, 0.04);
  }

  function setSoundMuted(muted, immediate = false) {
    state.soundMuted = Boolean(muted);
    try {
      window.localStorage?.setItem("zackrun-muted", state.soundMuted ? "1" : "0");
    } catch (_error) {
      // Ignore storage failures in private/locked modes.
    }
    applySoundState(immediate);
  }

  function primeAudioContext() {
    if (!state.audioCtx || state.audioPrimed) return;
    try {
      const ac = state.audioCtx;
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      gain.gain.value = 0.00001;
      osc.connect(gain);
      gain.connect(ac.destination);
      osc.frequency.value = 440;
      osc.start(ac.currentTime);
      osc.stop(ac.currentTime + 0.02);
      state.audioPrimed = true;
    } catch (_error) {
      // Retry on next gesture if priming failed.
    }
  }

  function startMusic() {
    state.musicShouldPlay = true;
    if (!state.audioReady || !state.audioCtx || state.audioCtx.state !== "running" || state.musicTimerId) return;
    if (state.musicGain && state.audioCtx) {
      applySoundState();
    }
    const tick = () => {
      if (state.mode !== "running") return;
      if (state.soundMuted) return;
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
    state.musicShouldPlay = false;
    if (state.musicTimerId) {
      window.clearInterval(state.musicTimerId);
      state.musicTimerId = null;
    }
    if (state.musicGain && state.audioCtx) {
      state.musicGain.gain.setTargetAtTime(0, state.audioCtx.currentTime, 0.03);
    }
  }

  function playFailWah() {
    if (!state.audioCtx || state.soundMuted) return;
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

  class ZackRunScene extends Phaser.Scene {
    constructor() {
      super({ key: "ZackRunScene" });
      this.nearH = Math.round(WORLD_H * 0.33);
    }

    preload() {
      this.load.image("run1", "./assets/zack/sprites/run1.png?v=1010");
      this.load.image("run2", "./assets/zack/sprites/run2.png?v=1010");
      this.load.image("jump", "./assets/zack/sprites/jump.png?v=1010");
      this.load.image("joy", "./assets/zack/sprites/joy.png?v=1010");
      this.load.image("horror", "./assets/zack/sprites/horror.png?v=1010");
      this.load.image("horrorDeath", `./assets/zack/sprites/horror_death.png?v=${BUILD_ID}`);
      this.load.image("farBg", "./assets/zack/sprites/far_background_x.png");
      this.load.image("nearBg", "./assets/zack/sprites/near_background.png");
      this.load.image("clouds", "./assets/world/clouds.png");
      this.load.image("tumble1", "./assets/world/tumbleweed1.png");
      this.load.image("tumble2", "./assets/world/tumbleweed2.png");
      this.load.image("snakeSide", "./assets/world/snake_side.png");
      this.load.image("snakeStrike", "./assets/world/snake_strike.png");
      this.load.image("eagle1", "./assets/world/eagle1.png");
      this.load.image("eagle2", "./assets/world/eagle2.png");
      this.load.image("eagle1Shadow", "./assets/world/eagle1_shadow.png");
      this.load.image("eagle2Shadow", "./assets/world/eagle2_shadow.png");
    }

    create() {
      this.mainCam = this.cameras.main;
      this.mainCam.setBounds(0, 0, WORLD_W, WORLD_H);
      this.mainCam.setRoundPixels(true);

      this.createLayers();
      this.createPlayer();
      this.createHud();
      this.bindInput();
      this.exposeDebugHooks();

      state.mode = "menu";
      setStatus("Tap anywhere to start.");
      this.refreshHud();
    }

    installTestApi() {
      if (!TEST_MODE) return;
      const getStatePayload = () => {
        try {
          return JSON.parse(window.render_game_to_text?.() || "{}");
        } catch (_error) {
          return {};
        }
      };
      const api = {
        enabled: true,
        build: BUILD_ID,
        getState: () => getStatePayload(),
        getInput: () => ({
          jumpPressed: input.jumpPressed,
          jumpHeld: input.jumpHeld,
          diveHeld: input.diveHeld,
          touchLeftCount: input.touchLeftCount,
          touchRightCount: input.touchRightCount,
        }),
        step: async (ms = 16) => {
          const totalMs = Math.max(0, Number(ms) || 0);
          const frameMs = 1000 / 60;
          const frames = Math.max(1, Math.round(totalMs / frameMs));
          for (let i = 0; i < frames; i += 1) {
            this.update(0, frameMs);
          }
          return getStatePayload();
        },
        setTouches: ({ left = 0, right = 0 } = {}) => {
          input.touchLeftCount = Math.max(0, Math.floor(Number(left) || 0));
          input.touchRightCount = Math.max(0, Math.floor(Number(right) || 0));
          this.recomputeTouchHold?.();
          return api.getInput();
        },
        tap: async (side = "right") => {
          if (state.mode !== "running") {
            await this.startOrRestartRun();
            return getStatePayload();
          }
          if (String(side).toLowerCase() === "right") input.jumpPressed = true;
          else input.diveHeld = true;
          return getStatePayload();
        },
        resetRun: async ({ autoPlay = false } = {}) => {
          state.autoPlay = Boolean(autoPlay);
          this.resetGame();
          return getStatePayload();
        },
        setElapsed: (seconds = 0) => {
          state.time = Math.max(0, Number(seconds) || 0);
          this.refreshHud();
          return state.time;
        },
        setMode: async (mode) => {
          if (mode === "menu") {
            stopMusic();
            state.mode = "menu";
            this.refreshHud();
            return getStatePayload();
          }
          if (mode === "running") {
            this.resetGame();
            return getStatePayload();
          }
          if (mode === "failed") {
            api.forceFail("test fail", "tumbleweed");
            return getStatePayload();
          }
          return getStatePayload();
        },
        clearHazards: () => {
          for (const h of state.hazards) this.destroyHazard(h);
          state.hazards = [];
          return true;
        },
        queueHazards: (types = []) => {
          state.testSpawnQueue = Array.isArray(types)
            ? types.map((t) => normalizeHazardType(t)).filter(Boolean)
            : [];
          return [...state.testSpawnQueue];
        },
        spawnNextHazard: () => {
          this.spawnHazard();
          const h = state.hazards[state.hazards.length - 1];
          return h ? { id: h.id, type: h.type, x: h.x } : null;
        },
        spawnHazard: (type, options = {}) => {
          const hazardType = normalizeHazardType(type) || "tumbleweed";
          const h =
            hazardType === "snake"
              ? this.createSnakeHazard()
              : hazardType === "eagle"
                ? this.createEagleHazard()
                : this.createTumbleweedHazard(state.hazardsSpawned % 2 === 0, Boolean(options.big));

          const targetX = Number.isFinite(options.x) ? options.x : state.player.x + 500;
          const deltaX = targetX - h.x;
          h.x = targetX;
          if (Number.isFinite(options.yFloor) && Number.isFinite(h.yFloor)) h.yFloor = options.yFloor;
          if (Number.isFinite(options.speedMul)) h.speedMul = options.speedMul;
          h.enteredAt = Number.isFinite(options.enteredAt) ? options.enteredAt : Math.max(0, state.time - 1.2);
          this.positionHazardVisual(h, deltaX);
          state.hazards.push(h);
          return { id: h.id, type: h.type, x: h.x, yFloor: h.yFloor };
        },
        forceFail: (reason = "hit a tumbleweed", hitType = "tumbleweed") => {
          const targetType = normalizeHazardType(hitType) || "tumbleweed";
          let hit = state.hazards.find((h) => h.type === targetType);
          if (!hit) {
            const created = api.spawnHazard(targetType, { x: state.player.x + 48 });
            hit = state.hazards.find((h) => h.id === created.id);
          }
          this.fail(reason, hit);
          return { mode: state.mode, reason: state.failReason, hitHazardId: state.hitHazardId };
        },
        getKillerSnakePhase: () => {
          const killer = state.hazards.find((h) => h.type === "snake" && h.isFailKiller);
          if (!killer) return null;
          return {
            id: killer.id,
            phase: killer.postFailPhase || "",
            bitesRemaining: killer.postFailBites || 0,
            x: killer.x,
            flipX: Boolean(killer.flipX),
          };
        },
        getPlayerDeathJolt: () => ({
          offset: state.player.deathJoltOffset,
          velocity: state.player.deathJoltVelocity,
        }),
      };

      window.__zackTest = api;
      this.events.once("shutdown", () => {
        if (window.__zackTest === api) delete window.__zackTest;
      });
    }

    createLayers() {
      const farTex = this.textures.get("farBg").getSourceImage();
      this.farScale = WORLD_H / farTex.height;
      this.farLayer = this.add
        .tileSprite(WORLD_W * 0.5, WORLD_H * 0.5, Math.ceil(WORLD_W / this.farScale) + 10, farTex.height, "farBg")
        .setOrigin(0.5, 0.5)
        .setScale(this.farScale, this.farScale);

      const nearTex = this.textures.get("nearBg").getSourceImage();
      this.nearScale = this.nearH / nearTex.height;
      this.nearLayer = this.add
        .tileSprite(
          WORLD_W * 0.5,
          WORLD_H - this.nearH * 0.5,
          Math.ceil(WORLD_W / this.nearScale) + 12,
          nearTex.height,
          "nearBg"
        )
        .setOrigin(0.5, 0.5)
        .setScale(this.nearScale, this.nearScale);

      this.midH = Math.round(this.nearH * 0.36);
      this.midScale = this.midH / nearTex.height;
      this.midLayer = this.add
        .tileSprite(
          WORLD_W * 0.5,
          WORLD_H - this.nearH - this.midH * 0.2,
          Math.ceil(WORLD_W / this.midScale) + 12,
          nearTex.height,
          "nearBg"
        )
        .setOrigin(0.5, 0.5)
        .setScale(this.midScale, this.midScale)
        .setAlpha(0.36)
        .setTint(0xda9a79);

      this.seamBlend = this.add.rectangle(WORLD_W * 0.5, WORLD_H - this.nearH - 3, WORLD_W + 140, 84, 0xe3a485, 0.14);

      const seamKey = "seamGradientBand";
      if (!this.textures.exists(seamKey)) {
        const g = this.make.graphics({ x: 0, y: 0, add: false });
        const w = WORLD_W + 140;
        const h = 118;
        g.fillGradientStyle(0xf4ba9f, 0xf4ba9f, 0xe6a07e, 0xe6a07e, 0, 0, 0.4, 0.03);
        g.fillRect(0, 0, w, h);
        g.generateTexture(seamKey, w, h);
        g.destroy();
      }
      this.seamGradient = this.add
        .image(WORLD_W * 0.5, WORLD_H - this.nearH - 6, seamKey)
        .setOrigin(0.5, 0.5)
        .setAlpha(0.5);

      const seamNoiseKey = "seamNoiseBand";
      if (!this.textures.exists(seamNoiseKey)) {
        const g = this.make.graphics({ x: 0, y: 0, add: false });
        const w = WORLD_W + 180;
        const h = 110;
        g.fillStyle(0xd68b6b, 0.16);
        for (let i = 0; i < 420; i += 1) {
          const x = Math.random() * w;
          const y = Math.random() * h;
          const r = 1 + Math.random() * 5;
          g.fillCircle(x, y, r);
        }
        g.fillStyle(0x5a2f21, 0.08);
        for (let i = 0; i < 260; i += 1) {
          const x = Math.random() * w;
          const y = Math.random() * h;
          const rw = 2 + Math.random() * 14;
          const rh = 1 + Math.random() * 4;
          g.fillEllipse(x, y, rw, rh);
        }
        g.generateTexture(seamNoiseKey, w, h);
        g.destroy();
      }
      this.seamNoise = this.add
        .image(WORLD_W * 0.5, WORLD_H - this.nearH - 5, seamNoiseKey)
        .setOrigin(0.5, 0.5)
        .setBlendMode(Phaser.BlendModes.MULTIPLY)
        .setAlpha(0.22);

      this.cloudSprites = state.clouds.map((c) =>
        this.add
          .image(c.x, c.y, "clouds")
          .setOrigin(0, 0)
          .setAlpha(0.3)
          .setScale(0.5 * c.scale * 4, 0.5 * c.scale * 2)
      );
    }

    createPlayer() {
      this.playerShadow = this.add.ellipse(state.player.x, FLOOR_Y + 6, 116, 28, 0x000000, 0.22).setDepth(80);
      this.playerSprite = this.add.image(state.player.x, state.player.y, "run1").setOrigin(0.5, 1).setDepth(120);
      this.playerDisplayByKey = this.buildPlayerDisplayMap();
      this.playerSprite.setDisplaySize(PLAYER_BASE_DISPLAY_W, PLAYER_BASE_DISPLAY_H);
      this.createSplatTextures();
      this.playerSplatBig = this.add.image(state.player.x, FLOOR_Y + 11, "splat-dark").setAlpha(0).setDepth(90);
      this.playerSplat = this.add.image(state.player.x, FLOOR_Y + 10, "splat-bright").setAlpha(0).setDepth(91);
    }

    createSplatTextures() {
      const drawBlobTexture = (key, color, accentColor, w, h, seed) => {
        if (this.textures.exists(key)) return;
        const g = this.make.graphics({ x: 0, y: 0, add: false });
        const centerX = w * 0.5;
        const centerY = h * 0.5;

        const drawOrganicPool = (cx, cy, rx, ry, localSeed, wobbleAmp) => {
          const steps = 32;
          g.beginPath();
          for (let i = 0; i <= steps; i += 1) {
            const t = (i / steps) * Math.PI * 2;
            const wobble =
              1 +
              Math.sin(t * 3.2 + localSeed) * wobbleAmp +
              Math.cos(t * 5.1 - localSeed * 0.7) * wobbleAmp * 0.45 +
              Math.sin(t * 7.4 + localSeed * 1.7) * wobbleAmp * 0.25;
            const px = cx + Math.cos(t) * rx * wobble;
            const py = cy + Math.sin(t) * ry * (0.9 + Math.sin(t * 2.6 + localSeed) * 0.08);
            if (i === 0) g.moveTo(px, py);
            else g.lineTo(px, py);
          }
          g.closePath();
          g.fillPath();
        };

        g.fillStyle(color, 1);
        drawOrganicPool(centerX, centerY + h * 0.03, w * 0.39, h * 0.22, seed, 0.18);
        drawOrganicPool(centerX - w * 0.19, centerY + h * 0.04, w * 0.13, h * 0.11, seed + 0.9, 0.22);
        drawOrganicPool(centerX + w * 0.22, centerY + h * 0.05, w * 0.11, h * 0.1, seed + 1.8, 0.21);
        drawOrganicPool(centerX - w * 0.01, centerY + h * 0.09, w * 0.2, h * 0.09, seed + 2.7, 0.2);

        g.fillStyle(accentColor, 0.24);
        g.fillEllipse(centerX - w * 0.1, centerY + h * 0.01, w * 0.34, h * 0.12);
        g.fillEllipse(centerX + w * 0.07, centerY + h * 0.06, w * 0.26, h * 0.1);

        g.generateTexture(key, w, h);
        g.destroy();
      };
      drawBlobTexture("splat-dark", 0x95161c, 0xb2262e, 420, 170, 0.4);
      drawBlobTexture("splat-bright", 0xe4383f, 0xff7a80, 330, 130, 0.95);
    }

    buildPlayerDisplayMap() {
      const keys = ["run1", "run2", "jump", "joy", "horror", "horrorDeath"];
      const samples = {};
      for (const key of keys) {
        samples[key] = this.sampleOpaqueBounds(key);
      }
      const base = samples.run1;
      if (!base) return {};

      const baseScale = PLAYER_BASE_DISPLAY_H / base.imageH;
      const targetVisibleH = base.visibleH * baseScale;
      const baseVisibleW = base.visibleW * baseScale;
      const maxVisibleW = baseVisibleW * 1.16;
      const baseBottomPad = base.bottomPad * baseScale;

      const byKey = {};
      for (const key of keys) {
        const sample = samples[key];
        if (!sample) {
          byKey[key] = { w: PLAYER_BASE_DISPLAY_W, h: PLAYER_BASE_DISPLAY_H, yOffset: 0 };
          continue;
        }

        let scale = targetVisibleH / Math.max(1, sample.visibleH);
        const scaledVisibleW = sample.visibleW * scale;
        if (key !== "horrorDeath" && scaledVisibleW > maxVisibleW) scale = maxVisibleW / Math.max(1, sample.visibleW);

        const bottomPad = sample.bottomPad * scale;
        byKey[key] = {
          w: sample.imageW * scale,
          h: sample.imageH * scale,
          yOffset: bottomPad - baseBottomPad,
        };
      }
      return byKey;
    }

    sampleOpaqueBounds(key) {
      const img = this.textures.get(key)?.getSourceImage();
      if (!img || !img.width || !img.height) return null;

      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) return null;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        const pixels = ctx.getImageData(0, 0, img.width, img.height).data;

        let minX = img.width;
        let minY = img.height;
        let maxX = -1;
        let maxY = -1;
        const alphaThreshold = 18;

        for (let y = 0; y < img.height; y += 1) {
          const rowBase = y * img.width * 4;
          for (let x = 0; x < img.width; x += 1) {
            const a = pixels[rowBase + x * 4 + 3];
            if (a <= alphaThreshold) continue;
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }

        if (maxX < minX || maxY < minY) {
          return {
            imageW: img.width,
            imageH: img.height,
            visibleW: img.width,
            visibleH: img.height,
            bottomPad: 0,
          };
        }

        return {
          imageW: img.width,
          imageH: img.height,
          visibleW: maxX - minX + 1,
          visibleH: maxY - minY + 1,
          bottomPad: Math.max(0, img.height - 1 - maxY),
        };
      } catch (_error) {
        return {
          imageW: img.width,
          imageH: img.height,
          visibleW: img.width,
          visibleH: img.height,
          bottomPad: 0,
        };
      }
    }

    createHud() {
      this.hudScoreEl = document.getElementById("hud-score");
      this.hudBestEl = document.getElementById("hud-best");
      this.hudAutoEl = document.getElementById("hud-auto");
      this.hudBuildEl = document.getElementById("hud-build");
      this.soundToggleEl = document.getElementById("sound-toggle");
      this.touchGuideEl = document.getElementById("touch-guide");
      this.rotateOverlayEl = document.getElementById("rotate-overlay");
      this.rotateOverlayTextEl = document.getElementById("rotate-overlay-text");
      this.gameWrapEl = document.getElementById("game-wrap");
      this.autoTapSequencePhase = 0;
      this.autoTapSequenceUntil = 0;
      this.viewportPollTimer = 0;
      this.lastViewportW = 0;
      this.lastViewportH = 0;
      this.bindViewportSync();
      this.refreshViewportSizing(true);
      try {
        state.soundMuted = window.localStorage?.getItem("zackrun-muted") === "1";
      } catch (_error) {
        state.soundMuted = false;
      }
      setSoundMuted(state.soundMuted, true);
      this.refreshSoundToggle();
      if (this.soundToggleEl) {
        this.skipNextSoundClick = false;
        this.soundToggleHandler = (ev) => {
          if (ev.type === "click" && this.skipNextSoundClick) {
            this.skipNextSoundClick = false;
            return;
          }
          if (ev.type === "pointerdown") {
            this.skipNextSoundClick = true;
          }
          ev.preventDefault();
          ev.stopPropagation();
          this.unlockAudioFromGesture();
          setSoundMuted(!state.soundMuted);
          if (!state.soundMuted && state.mode === "running") startMusic();
          this.refreshSoundToggle();
        };
        this.soundToggleEl.addEventListener("pointerdown", this.soundToggleHandler, { passive: false });
        this.soundToggleEl.addEventListener("click", this.soundToggleHandler, { passive: false });
      }
      if (this.hudBuildEl) this.hudBuildEl.textContent = `Build ${BUILD_ID}`;
      if (this.rotateOverlayTextEl && IS_TOUCH_FULLSCREEN && !IS_STANDALONE_APP) {
        this.rotateOverlayTextEl.textContent = "Rotate to landscape. For true full screen, Add to Home Screen and open Zack Run from there.";
      }

      this.failTitle = this.add
        .text(WORLD_W * 0.5, 250, "SPLAT", {
          fontFamily: "Georgia",
          fontSize: "84px",
          fontStyle: "bold",
          color: "#f4d9d9",
        })
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(5000)
        .setVisible(false)
        .setAlpha(0.88);

      this.failDetail = this.add
        .text(WORLD_W * 0.5, 322, "", {
          fontFamily: "Georgia",
          fontSize: "34px",
          color: "#f0e7d3",
        })
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(5000)
        .setVisible(false)
        .setAlpha(0.88);

      this.failHint = this.add
        .text(WORLD_W * 0.5, 368, "Tap anywhere to run again. Keyboard: R or Enter.", {
          fontFamily: "Georgia",
          fontSize: "30px",
          color: "#f0e7d3",
        })
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(5000)
        .setVisible(false)
        .setAlpha(0.82);

      this.events.once("shutdown", () => {
        if (!this.soundToggleEl || !this.soundToggleHandler) return;
        this.soundToggleEl.removeEventListener("pointerdown", this.soundToggleHandler);
        this.soundToggleEl.removeEventListener("click", this.soundToggleHandler);
      });
    }

    refreshSoundToggle() {
      if (!this.soundToggleEl) return;
      this.soundToggleEl.innerHTML = state.soundMuted
        ? `<svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M3 10h4l5-4v12l-5-4H3z"></path>
            <path d="M16 9l5 6"></path>
            <path d="M21 9l-5 6"></path>
          </svg>`
        : `<svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M3 10h4l5-4v12l-5-4H3z"></path>
            <path d="M16 9.5c1.4 1 1.4 4 0 5"></path>
            <path d="M18.8 7c3.2 2.3 3.2 7.7 0 10"></path>
          </svg>`;
      this.soundToggleEl.setAttribute("aria-label", state.soundMuted ? "Unmute sound" : "Mute sound");
      this.soundToggleEl.classList.toggle("is-muted", state.soundMuted);
    }

    toggleAutoPlay() {
      state.autoPlay = !state.autoPlay;
      setStatus(state.autoPlay ? "Autoplay ON (P toggles)." : "Autoplay OFF.");
      this.refreshHud();
    }

    unlockAudioFromGesture() {
      activateAudio();
      if (!state.audioCtx) return;
      const onRunning = () => {
        primeAudioContext();
        if (!state.soundMuted) playPianoNote(79, 0.04, 0.02);
        if (state.mode === "running" && state.musicShouldPlay) startMusic();
      };
      if (state.audioCtx.state === "running") {
        onRunning();
        return;
      }
      if (state.audioCtx.state === "suspended") {
        try {
          const resumed = state.audioCtx.resume();
          if (resumed?.then) {
            resumed
              .then(() => {
                if (state.audioCtx?.state === "running") onRunning();
              })
              .catch(() => {});
          }
        } catch (_error) {
          // iOS can reject resume until the next trusted gesture.
        }
      }
    }

    async enterMobileImmersive() {
      if (!IS_TOUCH_FULLSCREEN) return;
      if (!document.fullscreenElement && !this.scale.isFullscreen) {
        try {
          if (this.scale.fullscreen?.available) this.scale.startFullscreen();
          else if (this.gameWrapEl?.requestFullscreen) await this.gameWrapEl.requestFullscreen();
        } catch (_error) {
          // iOS Safari can reject fullscreen requests; keep gameplay running.
        }
      }
      try {
        if (screen.orientation?.lock) await screen.orientation.lock("landscape");
      } catch (_error) {
        // Ignore orientation lock failures on unsupported browsers.
      }
      this.refreshViewportSizing();
      setTimeout(() => this.refreshViewportSizing(), 120);
      setTimeout(() => this.refreshViewportSizing(), 420);
    }

    bindViewportSync() {
      if (!IS_TOUCH_FULLSCREEN) return;
      this.viewportSyncHandler = () => this.refreshViewportSizing();
      this.pageShowHandler = () => this.refreshViewportSizing(true);
      window.addEventListener("resize", this.viewportSyncHandler, { passive: true });
      window.addEventListener("orientationchange", this.viewportSyncHandler, { passive: true });
      window.addEventListener("pageshow", this.pageShowHandler, { passive: true });
      document.addEventListener("visibilitychange", this.pageShowHandler, { passive: true });
      if (window.visualViewport) {
        window.visualViewport.addEventListener("resize", this.viewportSyncHandler, { passive: true });
        window.visualViewport.addEventListener("scroll", this.viewportSyncHandler, { passive: true });
      }
      this.events.once("shutdown", () => {
        if (!this.viewportSyncHandler) return;
        window.removeEventListener("resize", this.viewportSyncHandler);
        window.removeEventListener("orientationchange", this.viewportSyncHandler);
        window.removeEventListener("pageshow", this.pageShowHandler);
        document.removeEventListener("visibilitychange", this.pageShowHandler);
        if (window.visualViewport) {
          window.visualViewport.removeEventListener("resize", this.viewportSyncHandler);
          window.visualViewport.removeEventListener("scroll", this.viewportSyncHandler);
        }
      });
    }

    refreshViewportSizing(force = false) {
      if (!IS_TOUCH_FULLSCREEN) return;
      syncTouchViewportVars();
      const vv = window.visualViewport;
      const vw = Math.max(1, Math.round(vv?.width || window.innerWidth || WORLD_W));
      const vh = Math.max(1, Math.round(vv?.height || window.innerHeight || WORLD_H));
      if (!force && vw === this.lastViewportW && vh === this.lastViewportH) return;
      this.lastViewportW = vw;
      this.lastViewportH = vh;
      if (this.gameWrapEl) {
        this.gameWrapEl.style.width = `${vw}px`;
        this.gameWrapEl.style.height = `${vh}px`;
      }
      this.scale?.setGameSize?.(WORLD_W, WORLD_H);
      this.scale?.refresh?.();
    }

    bindInput() {
      this.activeTouchGestures = new Map();
      this.activeDiveSwipes = new Set();
      this.pointerDiveHeld = false;
      this.lastTapAtBySide = { left: -999999, right: -999999 };
      this.sideFromClientX = (clientX) => {
        const rect = this.gameWrapEl?.getBoundingClientRect();
        if (!rect || rect.width <= 0) return clientX >= window.innerWidth * 0.5 ? "right" : "left";
        return clientX - rect.left >= rect.width * 0.5 ? "right" : "left";
      };
      this.recomputeSwipeDive = () => {
        this.pointerDiveHeld = this.activeDiveSwipes.size > 0;
      };
      this.recomputeTouchHold = () => {
        input.jumpHeld = input.touchRightCount > 0;
        input.diveHeld = input.touchLeftCount > 0 || this.pointerDiveHeld;
      };
      this.releaseSwipeState = (pointerId) => {
        if (this.activeDiveSwipes.delete(pointerId)) this.recomputeSwipeDive();
        this.activeTouchGestures.delete(pointerId);
      };

      this.keys = this.input.keyboard.addKeys({
        up: Phaser.Input.Keyboard.KeyCodes.UP,
        space: Phaser.Input.Keyboard.KeyCodes.SPACE,
        down: Phaser.Input.Keyboard.KeyCodes.DOWN,
        enter: Phaser.Input.Keyboard.KeyCodes.ENTER,
        r: Phaser.Input.Keyboard.KeyCodes.R,
        p: Phaser.Input.Keyboard.KeyCodes.P,
        f: Phaser.Input.Keyboard.KeyCodes.F,
      });

      this.input.keyboard.on("keydown-P", () => {
        this.toggleAutoPlay();
      });

      this.input.keyboard.on("keydown-F", () => {
        this.toggleFullscreen();
      });

      this.globalKeyDownHandler = (ev) => {
        if (ev.key?.toLowerCase() !== "f") return;
        ev.preventDefault();
        this.toggleFullscreen();
      };
      window.addEventListener("keydown", this.globalKeyDownHandler, { passive: false });
      this.events.once("shutdown", () => {
        if (this.globalKeyDownHandler) window.removeEventListener("keydown", this.globalKeyDownHandler);
      });

      this.input.keyboard.on("keydown-ENTER", () => {
        if (state.mode !== "running") this.startOrRestartRun();
      });

      this.input.keyboard.on("keydown-R", () => {
        if (state.mode !== "running") this.startOrRestartRun();
      });

      this.wrapPointerDown = (event) => {
        event.preventDefault();
        this.unlockAudioFromGesture();
        const side = this.sideFromClientX(event.clientX);
        const now = performance.now();
        if (now > this.autoTapSequenceUntil) this.autoTapSequencePhase = 0;
        if (now - this.lastTapAtBySide[side] <= DOUBLE_TAP_WINDOW_MS) {
          this.lastTapAtBySide[side] = -999999;
          if (side === "left") {
            this.autoTapSequencePhase = 1;
            this.autoTapSequenceUntil = now + AUTO_TAP_SEQUENCE_WINDOW_MS;
            return;
          }
          if (side === "right" && this.autoTapSequencePhase === 1 && now <= this.autoTapSequenceUntil) {
            this.autoTapSequencePhase = 0;
            this.autoTapSequenceUntil = 0;
            this.toggleAutoPlay();
            return;
          }
        }
        this.lastTapAtBySide[side] = now;
        if (state.mode !== "running") {
          this.startOrRestartRun();
          return;
        }
        this.activeTouchGestures.set(event.pointerId, {
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          side,
          swipe: "none",
          jumpFired: false,
        });
      };
      this.wrapPointerMove = (event) => {
        event.preventDefault();
        if (state.mode !== "running") return;
        const g = this.activeTouchGestures.get(event.pointerId);
        if (!g) return;
        const dx = event.clientX - g.startX;
        const dy = event.clientY - g.startY;
        const absX = Math.abs(dx);
        const absY = Math.abs(dy);
        if (absY < SWIPE_TRIGGER_PX || absY < absX * SWIPE_VERTICAL_RATIO) return;

        if (dy > 0) {
          if (g.swipe !== "down") {
            g.swipe = "down";
            this.activeDiveSwipes.add(event.pointerId);
            this.recomputeSwipeDive();
          }
          if (state.player.onGround) {
            state.player.crouchComboTimer = Math.max(state.player.crouchComboTimer, COMBO_JUMP_WINDOW_SECONDS);
          }
        } else {
          if (g.swipe === "down") {
            this.activeDiveSwipes.delete(event.pointerId);
            this.recomputeSwipeDive();
          }
          g.swipe = "up";
          if (!g.jumpFired) {
            g.jumpFired = true;
            input.jumpPressed = true;
          }
        }
      };
      this.wrapPointerUp = (event) => {
        this.releaseSwipeState(event.pointerId);
      };

      if (this.gameWrapEl) {
        this.gameWrapEl.style.touchAction = "none";
        this.wrapGestureUnlock = () => {
          this.unlockAudioFromGesture();
        };
        this.gameWrapEl.addEventListener("pointerdown", this.wrapPointerDown, { passive: false });
        this.gameWrapEl.addEventListener("pointermove", this.wrapPointerMove, { passive: false });
        this.gameWrapEl.addEventListener("pointerup", this.wrapPointerUp, { passive: true });
        this.gameWrapEl.addEventListener("pointercancel", this.wrapPointerUp, { passive: true });
        this.gameWrapEl.addEventListener("pointerleave", this.wrapPointerUp, { passive: true });
        this.gameWrapEl.addEventListener("pointerup", this.wrapGestureUnlock, { passive: true });
        this.gameWrapEl.addEventListener("touchstart", this.wrapGestureUnlock, { passive: true });
        this.gameWrapEl.addEventListener("touchend", this.wrapGestureUnlock, { passive: true });
        this.gameWrapEl.addEventListener("mousedown", this.wrapGestureUnlock, { passive: true });
        this.gameWrapEl.addEventListener("click", this.wrapGestureUnlock, { passive: true });
      }
      window.addEventListener("pointerup", this.wrapPointerUp, { passive: true });
      window.addEventListener("pointercancel", this.wrapPointerUp, { passive: true });

      this.events.once("shutdown", () => {
        if (this.gameWrapEl) {
          this.gameWrapEl.removeEventListener("pointerdown", this.wrapPointerDown);
          this.gameWrapEl.removeEventListener("pointermove", this.wrapPointerMove);
          this.gameWrapEl.removeEventListener("pointerup", this.wrapPointerUp);
          this.gameWrapEl.removeEventListener("pointercancel", this.wrapPointerUp);
          this.gameWrapEl.removeEventListener("pointerleave", this.wrapPointerUp);
          this.gameWrapEl.removeEventListener("pointerup", this.wrapGestureUnlock);
          this.gameWrapEl.removeEventListener("touchstart", this.wrapGestureUnlock);
          this.gameWrapEl.removeEventListener("touchend", this.wrapGestureUnlock);
          this.gameWrapEl.removeEventListener("mousedown", this.wrapGestureUnlock);
          this.gameWrapEl.removeEventListener("click", this.wrapGestureUnlock);
        }
        window.removeEventListener("pointerup", this.wrapPointerUp);
        window.removeEventListener("pointercancel", this.wrapPointerUp);
        this.activeTouchGestures.clear();
        this.activeDiveSwipes.clear();
        this.pointerDiveHeld = false;
      });
    }

    toggleFullscreen() {
      const wrap = document.getElementById("game-wrap");
      if (document.fullscreenElement || this.scale.isFullscreen) {
        if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
        if (this.scale.isFullscreen) this.scale.stopFullscreen();
        return;
      }
      if (this.scale.fullscreen?.available) {
        this.scale.startFullscreen();
        return;
      }
      if (wrap?.requestFullscreen) wrap.requestFullscreen().catch(() => {});
    }

    exposeDebugHooks() {
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
            highJumpReady: p.crouchComboTimer > 0.02,
            comboJumpActive: p.comboJumpActive,
            deathJoltOffset: Number((p.deathJoltOffset || 0).toFixed(2)),
          },
          speed: Math.round(state.speed),
          maxSpeed: MAX_RUN_SPEED,
          score: state.score,
          targetScore: TARGET_SCORE,
          hazards: state.hazards.slice(0, 8).map((h) => ({
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
          autoDebug: {
            events: state.autoDebug.events.slice(-8),
            lastJumpDecision: state.autoDebug.lastJumpDecision,
          },
          lastError: state.lastError,
          build: BUILD_ID,
        });
      };

      window.get_auto_debug_log = () => JSON.stringify(state.autoDebug.events, null, 2);
      window.advanceTime = (ms) =>
        window.__zackTest?.step
          ? window.__zackTest.step(ms)
          : new Promise((resolve) => setTimeout(resolve, ms));
      this.installTestApi();
    }

    async startOrRestartRun() {
      this.unlockAudioFromGesture();
      this.enterMobileImmersive();
      this.resetGame();
      startMusic();
      this.refreshViewportSizing(true);
    }

    resetGame() {
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
      state.hazardsSinceSnake = 0;
      state.hazardsSinceEagle = 0;
      state.failReason = "";
      state.failAnimTime = 0;
      state.hitHazardId = null;
      state.lastError = "";
      state.autoDebug.lastLogAt = -999;
      state.autoDebug.events = [];
      state.autoDebug.lastJumpDecision = null;
      this.autoTapSequencePhase = 0;
      this.autoTapSequenceUntil = 0;

      for (const h of state.hazards) this.destroyHazard(h);
      state.hazards = [];

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
      p.duck = false;
      p.expression = "neutral";
      p.airSprite = "jump";
      p.flipActive = false;
      p.flipProgress = 0;
      p.runCycle = 0;
      p.driftTargetX = PLAYER_BASE_X;
      p.driftTimer = 1.8 + Math.random() * 0.9;
      p.driftRightPhase = true;
      p.wasDuckingLastFrame = false;
      p.crouchComboTimer = 0;
      p.comboJumpActive = false;
      p.deathJoltOffset = 0;
      p.deathJoltVelocity = 0;
      input.touchLeftCount = 0;
      input.touchRightCount = 0;
      if (this.activeTouchGestures) this.activeTouchGestures.clear();
      if (this.activeDiveSwipes) this.activeDiveSwipes.clear();
      this.pointerDiveHeld = false;
      this.recomputeTouchHold?.();

      setStatus(state.autoPlay ? "Autoplay ON (P toggles)." : "Run active.");
      this.refreshHud();
    }

    refreshCameraTargets(camera) {
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

    updateCamera(dt) {
      const camera = state.camera;
      const p = state.player;
      if (!camera.wasOnGround && p.onGround) camera.landingLock = 0.2;
      camera.wasOnGround = p.onGround;
      camera.landingLock = Math.max(0, camera.landingLock - dt);
      const transitionsEnabled = p.onGround && camera.landingLock <= 0;

      if (transitionsEnabled) {
        camera.zoomTimer -= dt;
        camera.panTimer -= dt;
        this.refreshCameraTargets(camera);
        camera.zoom += (camera.targetZoom - camera.zoom) * Math.min(1, dt * 0.9);
        const panEase = camera.targetScreenX < camera.screenX ? 0.5 : 0.9;
        camera.screenX += (camera.targetScreenX - camera.screenX) * Math.min(1, dt * panEase);
      }

      const desiredScreenX = clamp(camera.screenX, WORLD_W * 0.22, WORLD_W * 0.49);
      const desiredScreenY = WORLD_H * 0.76;
      const centerX = p.x - (desiredScreenX - WORLD_W * 0.5) / camera.zoom;
      let centerY = camera.y;
      if (transitionsEnabled) centerY = p.y - (desiredScreenY - WORLD_H * 0.5) / camera.zoom;

      const halfW = (WORLD_W * 0.5) / camera.zoom;
      const halfH = (WORLD_H * 0.5) / camera.zoom;
      camera.x = clamp(centerX, halfW, WORLD_W - halfW);
      camera.y = clamp(centerY, halfH, WORLD_H - halfH);

      this.mainCam.setZoom(camera.zoom);
      this.mainCam.scrollX = camera.x - halfW;
      this.mainCam.scrollY = camera.y - halfH;
    }

    updateFailCamera(dt) {
      const camera = state.camera;
      const p = state.player;
      camera.targetZoom = 1;
      camera.zoom += (1 - camera.zoom) * Math.min(1, dt * 1.8);
      camera.screenX += (CAMERA_BASE_SCREEN_X - camera.screenX) * Math.min(1, dt * 1.25);

      const desiredScreenX = clamp(camera.screenX, WORLD_W * 0.22, WORLD_W * 0.49);
      const desiredScreenY = WORLD_H * 0.76;
      const centerX = p.x - (desiredScreenX - WORLD_W * 0.5) / camera.zoom;
      const centerY = FLOOR_Y - (desiredScreenY - WORLD_H * 0.5) / camera.zoom;
      const halfW = (WORLD_W * 0.5) / camera.zoom;
      const halfH = (WORLD_H * 0.5) / camera.zoom;
      camera.x = clamp(centerX, halfW, WORLD_W - halfW);
      camera.y = clamp(centerY, halfH, WORLD_H - halfH);

      this.mainCam.setZoom(camera.zoom);
      this.mainCam.scrollX = camera.x - halfW;
      this.mainCam.scrollY = camera.y - halfH;
    }

    updatePlayerDrift(dt) {
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

    computeSafeGap() {
      const ramp = Math.max(0.62, 1 - state.time / 95);
      const gap = (980 + state.speed * 0.72) * ramp;
      return Math.round(gap * (state.autoPlay ? 1.75 : 1));
    }

    computeJumpClearanceWindow(clearancePx) {
      const vy0 = -1160;
      const g = GRAVITY;
      const c = Math.max(12, clearancePx);
      const disc = vy0 * vy0 - 2 * g * c;
      if (disc <= 0) return { start: 0.09, end: 0.6 };
      const root = Math.sqrt(disc);
      const t1 = (-vy0 - root) / g;
      const t2 = (-vy0 + root) / g;
      return {
        start: Math.max(0.05, Math.min(t1, t2)),
        end: Math.max(0.16, Math.max(t1, t2)),
      };
    }

    getAutoJumpDecision() {
      const p = state.player;
      if (!state.autoPlay || state.mode !== "running" || !p.onGround) return null;
      const playerLeft = p.x - p.width * 0.23;
      const playerRight = p.x + p.width * 0.23;
      let candidate = null;

      for (const h of state.hazards) {
        if (h.type === "eagle") continue;
        const speed = Math.max(120, state.speed * (h.speedMul || 1));
        const frontDist = h.x - playerRight;
        const backDist = h.x + (h.visibleW || 120) - playerLeft;
        if (backDist < -40) continue;
        const tFront = frontDist / speed;
        const tBack = backDist / speed;
        if (tFront > 1.2) continue;
        if (!candidate || tFront < candidate.tFront) candidate = { h, speed, frontDist, backDist, tFront, tBack };
      }

      if (!candidate) return null;

      const h = candidate.h;
      const clearance = clamp((h.visibleH || 96) * 0.28 + (h.type === "snake" ? 24 : 10), 54, 126);
      const window = this.computeJumpClearanceWindow(clearance);
      const triggerT = clamp(window.start + 0.18 + (h.type === "snake" ? 0.03 : 0), window.start + 0.05, window.end - 0.04);
      const validWindow = candidate.tBack >= window.start && candidate.tFront <= window.end;
      const shouldJump = validWindow && candidate.tFront <= triggerT;
      const emergency = candidate.tFront <= 0.085 && candidate.tBack >= -0.03;
      const decision = {
        hazardId: h.id,
        type: h.type,
        tFront: Number(candidate.tFront.toFixed(3)),
        tBack: Number(candidate.tBack.toFixed(3)),
        speed: Math.round(candidate.speed),
        width: Math.round(h.visibleW || 0),
        height: Math.round(h.visibleH || 0),
        clearance: Math.round(clearance),
        windowStart: Number(window.start.toFixed(3)),
        windowEnd: Number(window.end.toFixed(3)),
        triggerT: Number(triggerT.toFixed(3)),
        shouldJump: shouldJump || emergency,
        emergency,
      };
      state.autoDebug.lastJumpDecision = decision;
      pushAutoLog("jump-check", decision);
      return decision;
    }

    shouldAutoDuck() {
      const p = state.player;
      if (!state.autoPlay || state.mode !== "running" || !p.onGround) return false;
      const playerLeft = p.x - p.width * 0.25;
      const playerRight = p.x + p.width * 0.25;
      for (const h of state.hazards) {
        if (h.type !== "eagle") continue;
        if (!h.autoAction) h.autoAction = Math.random() < 0.32 ? "jump" : "duck";
        if (h.autoAction !== "duck") continue;
        const speed = Math.max(120, state.speed * (h.speedMul || 1));
        const tFront = (h.x - playerRight) / speed;
        const tBack = (h.x + (h.visibleW || 120) - playerLeft) / speed;
        if (tBack < -0.04 || tFront > 0.58) continue;
        if (tFront <= 0.36 && tBack >= -0.07) {
          pushAutoLog("duck-check", {
            hazardId: h.id,
            type: h.type,
            tFront: Number(tFront.toFixed(3)),
            tBack: Number(tBack.toFixed(3)),
            speed: Math.round(speed),
            width: Math.round(h.visibleW || 0),
            height: Math.round(h.visibleH || 0),
            shouldDuck: true,
          });
          return true;
        }
      }
      return false;
    }

    getAutoEagleJumpDecision() {
      const p = state.player;
      if (!state.autoPlay || state.mode !== "running" || !p.onGround) return null;
      const playerLeft = p.x - p.width * 0.25;
      const playerRight = p.x + p.width * 0.25;
      for (const h of state.hazards) {
        if (h.type !== "eagle") continue;
        if (!h.autoAction) h.autoAction = Math.random() < 0.32 ? "jump" : "duck";
        if (h.autoAction !== "jump") continue;
        const speed = Math.max(120, state.speed * (h.speedMul || 1));
        const tFront = (h.x - playerRight) / speed;
        const tBack = (h.x + (h.visibleW || 120) - playerLeft) / speed;
        if (tBack < -0.06 || tFront > 0.62) continue;
        const decision = {
          hazardId: h.id,
          type: "eagle",
          tFront: Number(tFront.toFixed(3)),
          tBack: Number(tBack.toFixed(3)),
          armCombo: tFront <= 0.34 && tBack >= -0.02,
          triggerJump: tFront <= 0.2 && tBack >= -0.05,
        };
        pushAutoLog("eagle-jump-check", decision);
        return decision;
      }
      return null;
    }

    createTumbleweedHazard(useFirst, forceBig = false) {
      const key = useFirst ? "tumble1" : "tumble2";
      const tex = this.textures.get(key).getSourceImage();
      const sizeRamp = Math.min(0.18, state.time / 95);
      const isBig = forceBig || (state.hazardsSpawned > 3 && Math.random() < (state.autoPlay ? 0.14 : 0.22));
      const sizeBoost = isBig ? 1.5 + Math.random() * 0.18 : 1;
      const scale = (0.54 + Math.random() * 0.42) * (1 + sizeRamp) * sizeBoost;
      const visibleW = tex.width * scale;
      const visibleH = tex.height * scale;
      const x = WORLD_W + 120;
      const yFloor = FLOOR_Y - 26 + Math.random() * 40;

      const mulSprite = this.add
        .image(x + visibleW * 0.5, yFloor - visibleH * 0.5, key)
        .setScale(scale)
        .setBlendMode(Phaser.BlendModes.MULTIPLY)
        .setAlpha(0.58)
        .setDepth(HAZARD_BODY_DEPTH - 1);
      const sprite = this.add.image(x + visibleW * 0.5, yFloor - visibleH * 0.5, key).setScale(scale).setAlpha(0.85).setDepth(HAZARD_BODY_DEPTH);
      const shadow = this.add
        .ellipse(x + visibleW * 0.5, FLOOR_Y + 18, Math.max(22, visibleW * 0.22) * 2, 16, 0x14100c, 0.26)
        .setDepth(HAZARD_SHADOW_DEPTH);

      return {
        id: ++state.hazardIdSeq,
        type: "tumbleweed",
        isBig,
        requiresHighJump: isBig,
        key,
        x,
        yFloor,
        visibleW,
        visibleH,
        radius: Math.max(14, Math.min(30, visibleW * 0.22)),
        rotation: Math.random() * Math.PI * 2,
        spin: -(5.2 + Math.random() * 2.2),
        speedMul: 1,
        enteredAt: null,
        back: null,
        mulSprite,
        sprite,
        shadow,
      };
    }

    createSnakeHazard() {
      const tex = this.textures.get("snakeSide").getSourceImage();
      const targetH = 84 + Math.random() * 20;
      const scale = targetH / tex.height;
      const visibleW = tex.width * scale;
      const visibleH = tex.height * scale;
      const x = WORLD_W + 120;
      const yFloor = FLOOR_Y + 4;

      const sprite = this.add.image(x + visibleW * 0.5, yFloor - visibleH * 0.5, "snakeSide").setScale(scale).setAlpha(0.98).setDepth(HAZARD_BODY_DEPTH);

      return {
        id: ++state.hazardIdSeq,
        type: "snake",
        x,
        yFloor,
        visibleW,
        visibleH,
        radius: Math.max(14, visibleH * 0.32),
        rotation: 0,
        spin: 0,
        speedMul: 0.66 + Math.random() * 0.14,
        enteredAt: null,
        isStriking: false,
        strikeTimer: 0,
        strikePhase: 0,
        deathPose: false,
        strikePause: 0,
        postFailPhase: "",
        postFailBites: 0,
        postFailTimer: 0,
        postFailRetreatX: null,
        flipX: false,
        isFailKiller: false,
        sprite,
        shadow: null,
        baseScale: scale,
      };
    }

    createEagleHazard() {
      const tex = this.textures.get("eagle1").getSourceImage();
      const targetH = 102 + Math.random() * 14;
      const scale = targetH / tex.height;
      const visibleW = tex.width * scale;
      const visibleH = tex.height * scale;
      const x = WORLD_W + 140;
      const yBase = FLOOR_Y - (220 + Math.random() * 34);
      const shadow = this.add
        .image(x + visibleW * 0.5, FLOOR_Y + 16, "eagle1Shadow")
        .setScale(scale * 0.64)
        .setBlendMode(Phaser.BlendModes.MULTIPLY)
        .setAlpha(0.48)
        .setTint(0x101010)
        .setDepth(HAZARD_SHADOW_DEPTH);
      const sprite = this.add
        .image(x + visibleW * 0.5, yBase - visibleH * 0.5, "eagle1")
        .setOrigin(0.5, 0)
        .setScale(scale)
        .setAlpha(0.94)
        .setDepth(HAZARD_BODY_DEPTH);

      return {
        id: ++state.hazardIdSeq,
        type: "eagle",
        x,
        yBase,
        visibleW,
        visibleH,
        radius: Math.max(18, visibleH * 0.23),
        rotation: 0,
        spin: 0,
        speedMul: 1.02 + Math.random() * 0.18,
        enteredAt: null,
        flap: Math.random() * Math.PI * 2,
        bobPhase: Math.random() * Math.PI * 2,
        hitDrop: 0,
        autoAction: "",
        failSwoopPhase: "",
        failSwoopDone: false,
        failSwoopEnabled: Math.random() < 0.52,
        failPeckTimer: 0,
        failCruiseYBase: yBase,
        baseScale: scale,
        sprite,
        shadow,
      };
    }

    spawnHazard() {
      const queuedType = normalizeHazardType(state.testSpawnQueue[0]);
      if (queuedType) state.testSpawnQueue.shift();
      const mustSnake = state.hazardsSpawned > 2 && state.hazardsSinceSnake >= 3;
      const mustEagle = state.hazardsSpawned > 2 && state.hazardsSinceEagle >= 3;
      const spawnEagle = mustEagle || (state.hazardsSpawned > 1 && Math.random() < 0.28);
      const spawnSnake = !spawnEagle && (mustSnake || (state.hazardsSpawned > 1 && Math.random() < 0.34));
      const useSnake = queuedType ? queuedType === "snake" : spawnSnake;
      const useEagle = queuedType ? queuedType === "eagle" : spawnEagle;
      const hazard = useEagle
        ? this.createEagleHazard()
        : useSnake
          ? this.createSnakeHazard()
          : this.createTumbleweedHazard(state.hazardsSpawned % 2 === 0);

      const baseSpawnX =
        state.hazardsSpawned === 0 ? WORLD_W + 90 + Math.random() * 140 : WORLD_W + 340 + Math.random() * 220;
      const minGap = this.computeSafeGap();
      const x = Math.max(baseSpawnX, state.lastHazardEndX + minGap);
      const deltaX = x - hazard.x;
      hazard.x = x;
      this.positionHazardVisual(hazard, deltaX);

      state.hazards.push(hazard);
      state.lastHazardEndX = x + hazard.visibleW;
      state.hazardsSpawned += 1;
      state.hazardsSinceSnake = useSnake ? 0 : state.hazardsSinceSnake + 1;
      state.hazardsSinceEagle = useEagle ? 0 : state.hazardsSinceEagle + 1;

      state.hazardStreak += 1;
      const cadence = Math.max(0.52, 1 - state.time / 80);
      const longBreak = state.hazardStreak >= 2 || Math.random() < 0.28;
      if (longBreak) {
        state.hazardStreak = 0;
        state.nextHazardIn = (1.8 + Math.random() * 0.9) * cadence;
      } else {
        state.nextHazardIn = (1.2 + Math.random() * 0.6) * cadence;
      }
    }

    positionHazardVisual(h, deltaX = 0) {
      if (h.type === "snake") {
        h.sprite.x += deltaX;
        if (h.shadow) h.shadow.x += deltaX;
      } else if (h.type === "eagle") {
        h.sprite.x += deltaX;
        h.shadow.x += deltaX;
      } else {
        if (h.back) h.back.x += deltaX;
        h.mulSprite.x += deltaX;
        h.sprite.x += deltaX;
        h.shadow.x += deltaX;
      }
    }

    destroyHazard(h) {
      for (const key of ["sprite", "mulSprite", "back", "shadow"]) {
        if (h[key] && h[key].destroy) h[key].destroy();
      }
    }

    getHazardBounce(h) {
      const amp = Math.max(4, Math.min(16, (h.visibleH || 60) * 0.08));
      return Math.sin(h.rotation * 1.15 + (h.id || 0) * 0.7) * amp;
    }

    updateHazardVisual(h) {
      if (h.type === "snake") {
        const phase = h.strikePhase || 0;
        const drawW = h.visibleW * (1 + phase * 0.14);
        const drawH = h.visibleH * (1 - phase * 0.08);
        const centerX = h.x + h.visibleW * 0.5;
        const centerY = h.yFloor - h.visibleH * 0.5;
        const angle = (h.deathPose ? -0.6 : 0) - phase * (h.deathPose ? 0.22 : 0.06);
        const tex = phase > 0.08 && this.textures.exists("snakeStrike") ? "snakeStrike" : "snakeSide";

        if (h.sprite.texture.key !== tex) h.sprite.setTexture(tex);
        h.sprite.setPosition(centerX, centerY);
        h.sprite.setDisplaySize(drawW, drawH);
        h.sprite.setFlipX(Boolean(h.flipX));
        h.sprite.setRotation(angle);
      } else if (h.type === "eagle") {
        const flap = Math.sin(h.flap || 0);
        const travel = (h.enteredAt === null ? 0 : state.time - h.enteredAt) * (h.speedMul || 1);
        const bob = flap * 10 + Math.sin((h.bobPhase || 0) + travel * 5.4) * 24 + (h.hitDrop || 0);
        const px = h.x + h.visibleW * 0.5;
        const py = h.yBase + bob;
        const frameUp = flap >= 0;
        const eagleKey = frameUp ? "eagle1" : "eagle2";
        const shadowKey = frameUp ? "eagle1Shadow" : "eagle2Shadow";
        if (h.sprite.texture.key !== eagleKey) h.sprite.setTexture(eagleKey);
        if (h.shadow.texture.key !== shadowKey) h.shadow.setTexture(shadowKey);
        const altitude = Math.max(10, FLOOR_Y - py);
        const shadowScale = (h.baseScale || 1) * clamp(1.02 - altitude / 520, 0.44, 0.8);
        h.shadow.setPosition(px + 12, FLOOR_Y + 16 + Math.max(0, altitude - 120) * 0.04);
        h.shadow.setScale(shadowScale * (1 + flap * 0.02));
        h.shadow.setAlpha(clamp(0.58 - altitude / 880, 0.24, 0.58));
        h.sprite.setRotation(flap * 0.08);
        h.sprite.setScale((h.baseScale || 1) * (1 + flap * 0.03));
        h.sprite.setPosition(px, py - h.visibleH * 0.5);
      } else {
        const bounce = this.getHazardBounce(h);
        const px = h.x + h.visibleW * 0.5;
        const py = h.yFloor - h.visibleH * 0.5 - bounce;
        const lift = Math.max(0, bounce);

        h.mulSprite.setPosition(px, py);
        h.mulSprite.setRotation(h.rotation);

        h.sprite.setPosition(px, py);
        h.sprite.setRotation(h.rotation);

        h.shadow.setPosition(px + 2, h.yFloor + 10 + lift * 0.22);
        h.shadow.width = Math.max(20, h.radius * 0.72) * 2 * (1 + lift * 0.01);
        h.shadow.height = 15 + lift * 0.16;
        h.shadow.alpha = clamp(0.3 - lift * 0.01, 0.16, 0.3);
      }
    }

    getPlayerRect() {
      const p = state.player;
      return {
        left: p.x - p.width * 0.34,
        right: p.x + p.width * 0.34,
        top: p.y - p.height * (p.duck ? 0.64 : 1),
        bottom: p.y,
      };
    }

    circleRectOverlap(cx, cy, r, rect) {
      const nearestX = Math.max(rect.left, Math.min(cx, rect.right));
      const nearestY = Math.max(rect.top, Math.min(cy, rect.bottom));
      const dx = cx - nearestX;
      const dy = cy - nearestY;
      return dx * dx + dy * dy <= r * r;
    }

    fail(reason, hitHazard = null) {
      if (state.mode !== "running") return;
      state.mode = "failed";
      state.failReason = reason;
      state.failAnimTime = 0.95;
      state.hitHazardId = hitHazard?.id ?? null;
      if (!state.autoPlay) state.best = Math.max(state.best, state.score);
      state.player.expression = "horror";
      pushAutoLog("fail", {
        reason,
        hitHazardId: hitHazard?.id ?? null,
        hitHazardType: hitHazard?.type ?? null,
        playerX: Math.round(state.player.x),
        playerY: Math.round(state.player.y),
        decision: state.autoDebug.lastJumpDecision,
      }, true);

      for (const h of state.hazards) {
        if (h.type === "snake") h.isFailKiller = false;
      }

      if (reason === "killed by a snake bite" && hitHazard) {
        const p = state.player;
        p.y = FLOOR_Y;
        p.vy = 0;
        p.onGround = true;
        p.flipActive = false;
        p.flipProgress = 0;
        p.deathJoltOffset = 0;
        p.deathJoltVelocity = 0;

        hitHazard.x = state.player.x - hitHazard.visibleW * 0.38;
        hitHazard.yFloor = FLOOR_Y + 2;
        hitHazard.isStriking = false;
        hitHazard.strikeTimer = 0;
        hitHazard.strikePhase = 0;
        hitHazard.deathPose = true;
        hitHazard.speedMul = 0;
        hitHazard.strikePause = 0.01;
        hitHazard.postFailPhase = "bite-near";
        hitHazard.postFailBites = 2;
        hitHazard.postFailTimer = 0;
        hitHazard.postFailRetreatX = hitHazard.x + SNAKE_FAIL_RETREAT_DISTANCE;
        hitHazard.flipX = false;
        hitHazard.isFailKiller = true;
      }

      if (reason !== "killed by a snake bite") {
        state.player.deathJoltOffset = 0;
        state.player.deathJoltVelocity = 0;
      }

      if (reason === "hit by an eagle") {
        const p = state.player;
        p.y = FLOOR_Y;
        p.vy = 0;
        p.onGround = true;
        p.flipActive = false;
        p.flipProgress = 0;
        if (hitHazard) {
          hitHazard.hitDrop = Math.max(hitHazard.hitDrop || 0, 22);
          hitHazard.speedMul = Math.max(hitHazard.speedMul || 1, 1.04);
        }
      }

      state.camera.targetZoom = 1;
      state.camera.targetScreenX = CAMERA_BASE_SCREEN_X;
      state.nextHazardIn = 0.45;

      setStatus(`Splat: ${reason}. Tap anywhere to run again. Keyboard: R or Enter.`);
      stopMusic();
      playFailWah();
      this.refreshHud();
    }

    updatePlayerVisual() {
      const p = state.player;
      let key = "run1";
      if (state.mode === "failed") key = "horror";
      else if (!p.onGround) key = p.airSprite === "joy" ? "joy" : "jump";
      else key = Math.sin(p.runCycle * 9) > 0 ? "run1" : "run2";

      if (this.playerSprite.texture.key !== key) this.playerSprite.setTexture(key);
      const normalizedSize = this.playerDisplayByKey?.[key];
      if (normalizedSize) this.playerSprite.setDisplaySize(normalizedSize.w, normalizedSize.h);
      const yOffset = normalizedSize?.yOffset || 0;
      const baseScaleX = this.playerSprite.scaleX;
      const baseScaleY = this.playerSprite.scaleY;
      const sizeBias = PLAYER_VISUAL_SIZE_BIAS[key] || 1;
      const normalizedScaleX = baseScaleX * sizeBias;
      const normalizedScaleY = baseScaleY * sizeBias;

      const jumpAmount = Math.max(0, Math.min(1, (FLOOR_Y - p.y) / 240));
      const shadowW = 70 * (1 - 0.48 * jumpAmount) * 2;
      const shadowH = 17 * (1 - 0.38 * jumpAmount) * 2;
      const shadowY = FLOOR_Y + 6 + jumpAmount * 4;

      this.playerShadow.setPosition(p.x, shadowY);
      this.playerShadow.width = shadowW;
      this.playerShadow.height = shadowH;
      this.playerShadow.alpha = 0.34 - jumpAmount * 0.12;

      const tumbleweedKO = state.mode === "failed" && state.failReason === "hit a tumbleweed";
      const snakeKO = state.mode === "failed" && state.failReason === "killed by a snake bite";
      const eagleKO = state.mode === "failed" && state.failReason === "hit by an eagle";
      const deathScaleX = DEATH_POSE_SIZE_BOOST * DEATH_POSE_PERSPECTIVE_X;
      const deathScaleY = DEATH_POSE_SIZE_BOOST * DEATH_POSE_PERSPECTIVE_Y;
      const deathRotation = -0.05;
      const deathKey = "horrorDeath";
      this.playerSprite.setVisible(true);

      if (tumbleweedKO) {
        if (this.playerSprite.texture.key !== deathKey) this.playerSprite.setTexture(deathKey);
        const deathSize = this.playerDisplayByKey?.[deathKey];
        if (deathSize) this.playerSprite.setDisplaySize(deathSize.w, deathSize.h);
        this.playerSprite.setOrigin(0.5, 0.5);
        const halfSpanX = (250 * 1.08) * 0.5 + 12;
        const splatX = clamp(p.x - 34 + 10, halfSpanX, WORLD_W - halfSpanX);
        this.playerSprite.setPosition(splatX + 10, FLOOR_Y + 16 + p.deathJoltOffset);
        this.playerSprite.setRotation(deathRotation);
        this.playerSprite.setScale(normalizedScaleX * 0.9 * deathScaleX, normalizedScaleY * 0.9 * deathScaleY);
        this.playerSplatBig.setPosition(splatX + 8, FLOOR_Y + 20);
        this.playerSplatBig.setRotation(-0.11);
        this.playerSplatBig.setDisplaySize(352, 70);
        this.playerSplat.setPosition(splatX + 14, FLOOR_Y + 19);
        this.playerSplat.setRotation(-0.11);
        this.playerSplat.setDisplaySize(230, 36);
      } else if (snakeKO) {
        if (this.playerSprite.texture.key !== deathKey) this.playerSprite.setTexture(deathKey);
        const deathSize = this.playerDisplayByKey?.[deathKey];
        if (deathSize) this.playerSprite.setDisplaySize(deathSize.w, deathSize.h);
        this.playerSprite.setOrigin(0.5, 0.5);
        const halfSpanX = (250 * 1.04) * 0.5 + 12;
        const lieX = clamp(p.x - 12 + 10, halfSpanX, WORLD_W - halfSpanX);
        this.playerSprite.setPosition(lieX + 12, FLOOR_Y + 16 + p.deathJoltOffset);
        this.playerSprite.setRotation(deathRotation);
        this.playerSprite.setScale(normalizedScaleX * 0.96 * deathScaleX, normalizedScaleY * 0.94 * deathScaleY);
        this.playerSplatBig.setPosition(lieX + 10, FLOOR_Y + 20);
        this.playerSplatBig.setRotation(-0.1);
        this.playerSplatBig.setDisplaySize(304, 68);
        this.playerSplat.setPosition(lieX + 15, FLOOR_Y + 19);
        this.playerSplat.setRotation(-0.1);
        this.playerSplat.setDisplaySize(194, 35);
      } else if (eagleKO) {
        if (this.playerSprite.texture.key !== deathKey) this.playerSprite.setTexture(deathKey);
        const deathSize = this.playerDisplayByKey?.[deathKey];
        if (deathSize) this.playerSprite.setDisplaySize(deathSize.w, deathSize.h);
        this.playerSprite.setOrigin(0.5, 0.5);
        const halfSpanX = (258 * 1.04) * 0.5 + 12;
        const lieX = clamp(p.x - 16 + 10, halfSpanX, WORLD_W - halfSpanX);
        this.playerSprite.setPosition(lieX + 12, FLOOR_Y + 16 + p.deathJoltOffset);
        this.playerSprite.setRotation(deathRotation);
        this.playerSprite.setScale(normalizedScaleX * 0.9 * deathScaleX, normalizedScaleY * 0.92 * deathScaleY);
        this.playerSplatBig.setPosition(lieX + 10, FLOOR_Y + 20);
        this.playerSplatBig.setRotation(-0.12);
        this.playerSplatBig.setDisplaySize(324, 72);
        this.playerSplat.setPosition(lieX + 15, FLOOR_Y + 19);
        this.playerSplat.setRotation(-0.12);
        this.playerSplat.setDisplaySize(204, 36);
      } else {
        this.playerSprite.setScale(normalizedScaleX, normalizedScaleY);
          if (!p.onGround && p.flipActive) {
            this.playerSprite.setOrigin(0.5, 0.5);
            const halfH = this.playerSprite.displayHeight * 0.5;
            const desiredY = p.y + yOffset - halfH + 24;
            const minVisibleY = this.mainCam.scrollY + halfH + 10;
            this.playerSprite.setPosition(p.x, Math.max(desiredY, minVisibleY));
            this.playerSprite.setScale(normalizedScaleX, normalizedScaleY);
            const angle = Math.PI * 2 * Math.max(0, Math.min(1, p.flipProgress));
            this.playerSprite.setRotation(angle);
          } else {
          this.playerSprite.setOrigin(0.5, 1);
          this.playerSprite.setPosition(p.x, p.y + yOffset);
          this.playerSprite.setRotation(0);
          if (p.duck && p.onGround) this.playerSprite.setScale(normalizedScaleX * 1.26, normalizedScaleY * 0.56);
        }
        this.playerSplatBig.setPosition(p.x + 8, FLOOR_Y + 16);
        this.playerSplatBig.setRotation(-0.08);
        this.playerSplatBig.setDisplaySize(284, 70);
        this.playerSplat.setPosition(p.x + 12, FLOOR_Y + 15);
        this.playerSplat.setRotation(-0.08);
        this.playerSplat.setDisplaySize(182, 38);
      }

      this.playerSplatBig.alpha = state.mode === "failed" ? 0.82 : 0;
      this.playerSplat.alpha = state.mode === "failed" ? 0.9 : 0;
    }

    refreshHud() {
      this.refreshSoundToggle();
      const scoreText = `Alive: ${formatClock(state.score)}`;
      const bestText = `Best ${formatClock(state.best)}`;
      if (this.hudScoreEl) this.hudScoreEl.textContent = scoreText;
      if (this.hudBestEl) this.hudBestEl.textContent = bestText;
      if (this.hudAutoEl) {
        if (state.autoPlay) {
          this.hudAutoEl.classList.add("hud-on");
          this.hudAutoEl.style.opacity = String(0.65 + Math.sin(state.time * 4.8) * 0.22);
        } else {
          this.hudAutoEl.classList.remove("hud-on");
          this.hudAutoEl.style.opacity = "0";
        }
      }

      const showFail = state.mode === "failed";
      const showMenu = state.mode === "menu";
      const showOverlay = showFail || showMenu;
      this.failTitle.setVisible(showOverlay);
      this.failDetail.setVisible(showOverlay);
      this.failHint.setVisible(showOverlay);
      if (showFail) {
        this.failTitle.setText("SPLAT");
        this.failDetail.setText(`Cause: ${state.failReason}`);
        this.failHint.setText("Tap anywhere to run again.");
      } else if (showMenu) {
        this.failTitle.setText("ZACK RUN");
        this.failDetail.setText("Single tap anywhere to start.");
        this.failHint.setText("Swipe up: jump. Swipe down: duck/dive.");
      }
      const showTouchGuide = showMenu || (state.mode === "running" && state.time < TOUCH_GUIDE_HIDE_SECONDS);
      if (this.touchGuideEl) this.touchGuideEl.style.display = showTouchGuide ? "flex" : "none";
    }

    updateBackgroundLayers() {
      const farSpeed = BACKGROUND_SCROLL_SPEED;
      const nearSpeed = BACKGROUND_SCROLL_SPEED * 2.6 + state.speed * 0.06;
      const midSpeed = farSpeed + (nearSpeed - farSpeed) * 0.54;
      this.farLayer.tilePositionX = (state.sceneTime * farSpeed) / this.farScale;
      this.midLayer.tilePositionX = (state.sceneTime * midSpeed) / this.midScale;
      this.nearLayer.tilePositionX = (state.sceneTime * nearSpeed) / this.nearScale;

      for (let i = 0; i < state.clouds.length; i += 1) {
        const c = state.clouds[i];
        this.cloudSprites[i].setPosition(c.x, c.y);
      }
    }

    triggerPlayerDeathJolt(power = 1) {
      const p = state.player;
      const impulse = 220 * clamp(power, 0.4, 1.8);
      p.deathJoltVelocity = Math.max(p.deathJoltVelocity, impulse);
    }

    advanceSnakeStrike(h, dt) {
      h.strikePause = (h.strikePause ?? 0.38) - dt;
      if (!h.isStriking && h.strikePause <= 0) {
        h.isStriking = true;
        h.strikeTimer = 0.32;
        h.strikePause = 0.68 + Math.random() * 0.42;
        if (state.mode === "failed") {
          this.triggerPlayerDeathJolt(h.isFailKiller ? 1 : 0.72);
        }
      }
      if (h.isStriking) {
        h.strikeTimer = Math.max(0, (h.strikeTimer || 0) - dt);
        const progress = 1 - h.strikeTimer / 0.32;
        h.strikePhase = Math.sin(Math.max(0, Math.min(1, progress)) * Math.PI);
        if (h.strikeTimer <= 0) {
          h.isStriking = false;
          h.strikePhase = 0;
          if (h.postFailBites > 0) h.postFailBites -= 1;
        }
      } else {
        h.strikePhase = 0;
      }
    }

    updateSnakeFailPasser(h, dt) {
      const biteX = state.player.x - h.visibleW * 0.36;
      if (!h.postFailPhase && h.x <= biteX + 90) {
        h.postFailPhase = "bite-pass";
        h.postFailBites = 1;
        h.strikePause = 0.03;
        h.isStriking = false;
        h.strikePhase = 0;
        h.flipX = false;
      }

      if (h.postFailPhase === "bite-pass") {
        h.x += (biteX - h.x) * Math.min(1, dt * 8.8);
        h.deathPose = true;
        h.flipX = false;
        this.advanceSnakeStrike(h, dt);
        if (h.postFailBites <= 0) {
          h.postFailPhase = "resume-left";
          h.isStriking = false;
          h.strikePhase = 0;
          h.deathPose = false;
        }
      } else {
        h.x -= state.speed * (h.speedMul || 1) * dt;
        h.deathPose = false;
        h.flipX = false;
        h.isStriking = false;
        h.strikePhase = 0;
      }
    }

    updateSnakeFailKiller(killer, dt) {
      const anchorX = state.player.x - killer.visibleW * 0.38;
      killer.yFloor = FLOOR_Y + 2;
      killer.deathPose = killer.postFailPhase === "bite-near" || killer.postFailPhase === "bite-final";

      if (!killer.postFailPhase) {
        killer.postFailPhase = "bite-near";
        killer.postFailBites = 2;
        killer.postFailRetreatX = anchorX + SNAKE_FAIL_RETREAT_DISTANCE;
        killer.flipX = false;
      }

      if (killer.postFailPhase === "bite-near") {
        killer.x = anchorX;
        killer.flipX = false;
        killer.deathPose = true;
        this.advanceSnakeStrike(killer, dt);
        if (killer.postFailBites <= 0) {
          killer.postFailPhase = "retreat-right";
          killer.isStriking = false;
          killer.strikePhase = 0;
        }
      } else if (killer.postFailPhase === "retreat-right") {
        const retreatX = killer.postFailRetreatX ?? (anchorX + SNAKE_FAIL_RETREAT_DISTANCE);
        killer.postFailRetreatX = retreatX;
        killer.flipX = true;
        killer.deathPose = false;
        killer.x = Math.min(retreatX, killer.x + 156 * dt);
        killer.isStriking = false;
        killer.strikePhase = 0;
        if (Math.abs(killer.x - retreatX) <= 2) {
          killer.postFailPhase = "return-for-last";
        }
      } else if (killer.postFailPhase === "return-for-last") {
        const targetX = anchorX + 14;
        killer.flipX = false;
        killer.deathPose = false;
        if (killer.x > targetX) killer.x = Math.max(targetX, killer.x - 188 * dt);
        if (killer.x < targetX) killer.x = Math.min(targetX, killer.x + 180 * dt);
        killer.isStriking = false;
        killer.strikePhase = 0;
        if (Math.abs(killer.x - targetX) <= 1.5) {
          killer.postFailPhase = "bite-final";
          killer.postFailBites = 1;
          killer.strikePause = 0.08;
        }
      } else if (killer.postFailPhase === "bite-final") {
        killer.x = anchorX + 14;
        killer.flipX = false;
        killer.deathPose = true;
        this.advanceSnakeStrike(killer, dt);
        if (killer.postFailBites <= 0) {
          killer.postFailPhase = "wander-left";
          killer.isStriking = false;
          killer.strikePhase = 0;
        }
      } else {
        killer.flipX = false;
        killer.deathPose = false;
        killer.x -= 132 * dt;
        killer.isStriking = false;
        killer.strikePhase = 0;
      }
    }

    updateEagleFailPass(h, dt) {
      const brushCenterX = state.player.x + 18;
      const eagleCenterX = h.x + h.visibleW * 0.5;
      if (!h.failSwoopEnabled) {
        h.x -= Math.max(110, state.speed * 0.9 * (h.speedMul || 1)) * dt;
        h.yBase += (h.failCruiseYBase - h.yBase) * Math.min(1, dt * 2);
        h.flap += dt * 9;
        return;
      }
      if (!h.failSwoopPhase && h.x <= state.player.x + 220) {
        h.failSwoopPhase = "dive";
      }

      if (h.failSwoopPhase === "dive") {
        h.x -= Math.max(96, state.speed * 0.62 * (h.speedMul || 1)) * dt;
        h.yBase += (FLOOR_Y - 28 - h.yBase) * Math.min(1, dt * 5.8);
        h.flap += dt * 10.4;
        if (!h.failSwoopDone && Math.abs(eagleCenterX - brushCenterX) <= 72) {
          h.failSwoopDone = true;
          h.failSwoopPhase = "peck";
          h.failPeckTimer = 0.32;
          this.triggerPlayerDeathJolt(0.92);
        }
        if (h.x <= state.player.x - 10 && !h.failSwoopDone) h.failSwoopPhase = "climb";
        return;
      }

      if (h.failSwoopPhase === "peck") {
        const peckTargetX = brushCenterX + 18;
        const peckTargetY = FLOOR_Y - 20;
        h.x += (peckTargetX - eagleCenterX) * Math.min(1, dt * 10.5);
        h.yBase += (peckTargetY - h.yBase) * Math.min(1, dt * 9.4);
        h.flap += dt * 12.2;
        h.failPeckTimer = Math.max(0, (h.failPeckTimer || 0) - dt);
        if (h.failPeckTimer <= 0) h.failSwoopPhase = "climb";
        return;
      }

      h.failSwoopPhase = "climb";
      h.x -= Math.max(110, state.speed * 0.88 * (h.speedMul || 1)) * dt;
      h.yBase += (h.failCruiseYBase - h.yBase) * Math.min(1, dt * 2.4);
      h.flap += dt * 9;
    }

    spawnFailTumbleweed() {
      const hazard = this.createTumbleweedHazard(Math.random() < 0.5);
      const destX = WORLD_W + 80 + Math.random() * 160;
      const deltaX = destX - hazard.x;
      hazard.x = destX;
      hazard.speedMul = 0.9 + Math.random() * 0.2;
      this.positionHazardVisual(hazard, deltaX);
      state.hazards.push(hazard);
    }

    spawnFailEagle() {
      const hazard = this.createEagleHazard();
      const destX = WORLD_W + 160 + Math.random() * 220;
      const deltaX = destX - hazard.x;
      hazard.x = destX;
      hazard.speedMul = 0.92 + Math.random() * 0.22;
      hazard.failSwoopPhase = "";
      hazard.failSwoopDone = false;
      hazard.failSwoopEnabled = Math.random() < 0.52;
      hazard.failPeckTimer = 0;
      this.positionHazardVisual(hazard, deltaX);
      state.hazards.push(hazard);
    }

    update(_time, deltaMs) {
      const dt = Math.min(deltaMs / 1000, 1 / 20);
      try {
        if (IS_TOUCH_FULLSCREEN) {
          this.viewportPollTimer = (this.viewportPollTimer || 0) - dt;
          if (this.viewportPollTimer <= 0) {
            this.viewportPollTimer = 0.22;
            this.refreshViewportSizing();
          }
        }

        if (Phaser.Input.Keyboard.JustDown(this.keys.space) || Phaser.Input.Keyboard.JustDown(this.keys.up)) {
          input.jumpPressed = true;
        }
        if (Phaser.Input.Keyboard.JustDown(this.keys.down) && state.player.onGround) {
          state.player.crouchComboTimer = COMBO_JUMP_WINDOW_SECONDS;
        }
        input.jumpHeld =
          this.keys.space.isDown || this.keys.up.isDown || input.touchRightCount > 0;
        input.diveHeld = this.keys.down.isDown || input.touchLeftCount > 0 || this.pointerDiveHeld;
        if (state.mode === "running" && state.musicShouldPlay && state.audioCtx?.state === "running" && !state.musicTimerId) {
          startMusic();
        }

        if (state.mode !== "running") {
          if (state.mode === "failed") {
            {
              const p = state.player;
              p.deathJoltVelocity -= 960 * dt;
              p.deathJoltOffset -= p.deathJoltVelocity * dt;
              if (p.deathJoltOffset > 0) {
                p.deathJoltOffset = 0;
                p.deathJoltVelocity = 0;
              } else if (p.deathJoltOffset < -18 && p.deathJoltVelocity < 0) {
                p.deathJoltOffset = -18;
                p.deathJoltVelocity *= -0.34;
              }
            }

            for (const c of state.clouds) {
              c.x -= CLOUD_SCROLL_SPEED * c.speedMul * dt * 0.6;
              if (c.x < -480) {
                c.x = WORLD_W + Math.random() * 260;
                c.y = 24 + Math.random() * 66;
              }
            }

            state.nextHazardIn -= dt;
            if (state.nextHazardIn <= 0) {
              if (Math.random() < 0.44) this.spawnFailEagle();
              else this.spawnFailTumbleweed();
              state.nextHazardIn = 1.5 + Math.random() * 1.9;
            }

            for (const h of state.hazards) {
              const isKillerSnake =
                h.type === "snake" && state.failReason === "killed by a snake bite" && h.isFailKiller && h.id === state.hitHazardId;
              if (isKillerSnake) {
                this.updateSnakeFailKiller(h, dt);
                this.updateHazardVisual(h);
                continue;
              }

              if (h.type === "tumbleweed") {
                h.x -= state.speed * (h.speedMul || 1) * dt;
                h.rotation += (h.spin || 0) * dt;
              } else if (h.type === "eagle") {
                this.updateEagleFailPass(h, dt);
                if (h.hitDrop > 0) h.hitDrop = Math.max(0, h.hitDrop - dt * 6);
              } else if (h.type === "snake") {
                this.updateSnakeFailPasser(h, dt);
              }
              this.updateHazardVisual(h);
            }

            state.hazards = state.hazards.filter((h) => {
              const keep = h.x + h.visibleW > -140;
              if (!keep) this.destroyHazard(h);
              return keep;
            });

            this.updateFailCamera(dt);
          }

          this.updatePlayerVisual();
          this.refreshHud();
          this.updateBackgroundLayers();
          return;
        }

        state.time += dt;
        const maxRunNow = state.autoPlay ? Math.round(MAX_RUN_SPEED * 0.92) : MAX_RUN_SPEED;
        state.speed = Math.min(maxRunNow, state.speed + dt * 9.8);
        state.score = Math.floor(state.time);
        if (!state.autoPlay) state.best = Math.max(state.best, state.score);

        const p = state.player;
        p.runCycle += dt * (state.speed / 160);
        p.inWater = false;

        this.updatePlayerDrift(dt);

        if (state.autoPlay) {
          const jumpDecision = this.getAutoJumpDecision();
          if (jumpDecision?.shouldJump) input.jumpPressed = true;
          const eagleJump = this.getAutoEagleJumpDecision();
          if (eagleJump?.armCombo) {
            input.diveHeld = true;
            if (eagleJump.triggerJump) input.jumpPressed = true;
          } else {
            input.diveHeld = input.diveHeld || this.shouldAutoDuck();
          }
        }

        const crouchingNow = p.onGround && input.diveHeld;
        if (crouchingNow) {
          p.crouchComboTimer = COMBO_JUMP_WINDOW_SECONDS;
        } else {
          if (p.onGround && p.wasDuckingLastFrame) {
            p.crouchComboTimer = Math.max(p.crouchComboTimer, COMBO_JUMP_WINDOW_SECONDS);
          }
          p.crouchComboTimer = Math.max(0, p.crouchComboTimer - dt);
        }
        p.duck = crouchingNow;

        if (input.jumpPressed && p.onGround) {
          const comboJump = p.crouchComboTimer > 0.01 || crouchingNow;
          p.vy = comboJump ? COMBO_JUMP_VELOCITY : state.autoPlay ? AUTO_JUMP_VELOCITY : NORMAL_JUMP_VELOCITY;
          p.onGround = false;
          p.airSprite = Math.random() < AIR_JOY_CHANCE ? "joy" : "jump";
          p.flipActive = false;
          p.flipProgress = 0;
          p.comboJumpActive = comboJump;
          p.crouchComboTimer = 0;

          const nextHazard = state.hazards.find((h) => h.x > p.x && h.x - p.x < 420);
          const largeHazard = Boolean(nextHazard && (nextHazard.visibleW > 150 || nextHazard.visibleH > 95));
          if ((largeHazard && Math.random() < 0.85) || (!largeHazard && Math.random() < 0.2)) {
            p.flipActive = true;
            p.flipProgress = 0;
          }
          if (state.autoPlay) {
            pushAutoLog("jump-fire", {
              y: Math.round(p.y),
              vy: Math.round(p.vy),
              decision: state.autoDebug.lastJumpDecision,
            }, true);
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
          p.comboJumpActive = false;
        } else {
          p.onGround = false;
          if (p.flipActive) {
            const jumpAmount = Math.max(0, Math.min(1, (FLOOR_Y - p.y) / 240));
            if (jumpAmount > 0.34 || p.flipProgress > 0) {
              const apexFactor = jumpAmount > 0.62 ? 1.6 : 0.88;
              p.flipProgress = Math.min(1, p.flipProgress + (dt / 0.6) * apexFactor);
            }
            if (p.flipProgress >= 1) p.flipActive = false;
          }
        }
        p.wasDuckingLastFrame = p.duck;

        const sceneryDt = dt;
        state.sceneTime += sceneryDt;
        for (const c of state.clouds) {
          c.x -= CLOUD_SCROLL_SPEED * c.speedMul * sceneryDt;
          if (c.x < -480) {
            c.x = WORLD_W + Math.random() * 260;
            c.y = 24 + Math.random() * 66;
          }
        }

        state.nextHazardIn -= dt;
        if (state.hazardsSpawned === 0 && state.time > 4.5 && state.nextHazardIn > 0.12) state.nextHazardIn = 0.12;
        if (state.nextHazardIn <= 0) this.spawnHazard();

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
          } else if (h.type === "eagle") {
            h.flap += dt * 9.2;
          }

          if (h.enteredAt === null && h.x + h.visibleW < WORLD_W - 16) h.enteredAt = state.time;
          this.updateHazardVisual(h);
        }

        state.hazards = state.hazards.filter((h) => {
          const keep = h.x + h.visibleW > -90;
          if (!keep) this.destroyHazard(h);
          return keep;
        });

        const pr = this.getPlayerRect();
        for (const h of state.hazards) {
          if (h.enteredAt === null || state.time - h.enteredAt < 0.45) continue;

          const bodyLeft = p.x - p.width * 0.23;
          const bodyRight = p.x + p.width * 0.23;
          const hazardX = h.x;
          const overlapX = hazardX < bodyRight && hazardX + h.visibleW > bodyLeft;
          const neededClearance = h.type === "tumbleweed" && h.requiresHighJump ? 212 : state.autoPlay ? 48 : 56;
          const jumpedClear = p.y < FLOOR_Y - neededClearance;

          if (h.type === "eagle") {
            const eagleClearByCombo = p.comboJumpActive && p.y < FLOOR_Y - EAGLE_COMBO_CLEARANCE;
            const eagleUnsafe = overlapX && !(p.duck && p.onGround) && !eagleClearByCombo;
            if (eagleUnsafe) {
              this.fail("hit by an eagle", h);
              return;
            }
            continue;
          }

          if (overlapX && !jumpedClear) {
            this.fail(h.type === "snake" ? "killed by a snake bite" : "hit a tumbleweed", h);
            return;
          }

          let cx;
          let cy;
          if (h.type === "snake") {
            cx = hazardX + h.visibleW * 0.48;
            cy = h.yFloor - h.visibleH * 0.44;
          } else {
            const bounce = this.getHazardBounce(h);
            cx = hazardX + h.visibleW * 0.5;
            cy = h.yFloor - h.visibleH * 0.5 - bounce;
          }

          if (this.circleRectOverlap(cx, cy, h.radius, pr)) {
            this.fail(h.type === "snake" ? "killed by a snake bite" : "hit a tumbleweed", h);
            return;
          }
        }

        if (state.mode === "failed") p.expression = "horror";
        else if (!p.onGround) p.expression = "joy";
        else p.expression = "neutral";

        this.updateCamera(dt);
        this.updateBackgroundLayers();
        this.updatePlayerVisual();
        this.refreshHud();
      } catch (err) {
        console.error("Frame loop error:", err);
        state.lastError = String(err?.message || err);
        if (state.mode !== "failed") {
          state.mode = "failed";
          state.failReason = "runtime error";
          state.player.expression = "horror";
          setStatus(`Runtime error: ${state.lastError}. Tap anywhere to run again. Keyboard: R or Enter.`);
        }
        this.updateBackgroundLayers();
        this.updatePlayerVisual();
        this.refreshHud();
      }
    }
  }

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: "game-root",
    width: WORLD_W,
    height: WORLD_H,
    backgroundColor: "#000000",
    render: {
      preserveDrawingBuffer: true,
      antialias: true,
    },
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: WORLD_W,
      height: WORLD_H,
      fullscreenTarget: "game-wrap",
    },
    scene: [ZackRunScene],
  });

  window.__zackGame = game;
  window.addEventListener("error", (e) => {
    state.lastError = String(e?.message || "unknown error");
  });
})();
