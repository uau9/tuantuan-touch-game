(() => {
  "use strict";

  const canvas = document.querySelector("#game");
  const ctx = canvas.getContext("2d", { alpha: false });
  const $ = (selector) => document.querySelector(selector);
  const ui = {
    hud: $("#hud"), score: $("#score"), startScreen: $("#startScreen"),
    pauseScreen: $("#pauseScreen"), startButton: $("#startButton"),
    pauseButton: $("#pauseButton"), resumeButton: $("#resumeButton"),
    homeButton: $("#homeButton"), ripple: $("#touchRipple"),
    volumeSlider: $("#volumeSlider"), volumeValue: $("#volumeValue"),
  };

  const dogBarkFiles = [
    "assets/audio/bark-small-real.mp3?v=13",
  ];
  const dogSpriteSheet = new Image();
  dogSpriteSheet.decoding = "async";
  dogSpriteSheet.src = "assets/dog-sprites/gray-poodle-v1.png?v=13";
  const dogFallbackStyle = {
    coat: "#d6dce3", light: "#f8f7eb", patch: "#65738a",
    dark: "#13233d", accent: "#ffe052", kind: "poodle",
  };
  const dogRoutes = [
    ["left", "right", 0.76, 0.36],
    ["right", "left", 0.34, 0.7],
    ["left", "right", 0.27, 0.58],
    ["right", "left", 0.74, 0.43],
    ["left", "right", 0.48, 0.7],
    ["right", "left", 0.56, 0.26],
    ["left", "right", 0.63, 0.32],
    ["right", "left", 0.28, 0.61],
  ];
  const TAU = Math.PI * 2;
  const targets = [];
  const particles = [];
  const bubbles = [];
  const plants = [];
  let width = 0;
  let height = 0;
  let dpr = 1;
  let state = "menu";
  let score = 0;
  let theme = "dog";
  let speedMode = "slow";
  let soundOn = true;
  let volumeLevel = 0.9;
  let audioContext = null;
  let dogBarkBuffers = [];
  let dogBarkLoadPromise = null;
  let activeBarkSource = null;
  let dogRouteIndex = -1;
  let dogRespawnTimer = null;
  let lastTime = performance.now();
  let ambientTime = 0;
  let nextTargetId = 1;
  let rippleTimer = null;
  let holdTimer = null;

  function resize() {
    const rect = canvas.getBoundingClientRect();
    width = rect.width;
    height = rect.height;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    buildScenery();
    targets.forEach(keepOnScreen);
  }

  function buildScenery() {
    bubbles.length = 0;
    plants.length = 0;
    const bubbleCount = Math.max(12, Math.round(width / 54));
    for (let i = 0; i < bubbleCount; i += 1) {
      bubbles.push({
        x: (i * 97 + 43) % Math.max(width, 1),
        y: (i * 151 + 80) % Math.max(height, 1),
        radius: 3 + (i % 4) * 2.1,
        speed: 7 + (i % 5) * 2.3,
        drift: i * 0.7,
      });
    }
    const count = Math.max(8, Math.round(width / 95));
    for (let i = 0; i < count; i += 1) {
      plants.push({
        x: (i / Math.max(1, count - 1)) * width,
        height: 45 + (i % 4) * 18,
        hue: i % 2 ? "#0d7d83" : "#116f78",
        phase: i * 0.83,
      });
    }
  }

  function readSettings() {
    theme = document.querySelector('input[name="theme"]:checked').value;
    speedMode = document.querySelector('input[name="speed"]:checked').value;
    soundOn = document.querySelector('input[name="sound"]:checked').value === "on";
    volumeLevel = Number(ui.volumeSlider.value) / 100;
  }

  function startGame() {
    readSettings();
    score = 0;
    ui.score.textContent = "0";
    targets.length = 0;
    particles.length = 0;
    state = "playing";
    ui.startScreen.classList.remove("visible");
    ui.pauseScreen.classList.remove("visible");
    ui.hud.classList.add("playing");
    if (soundOn) {
      ensureAudio();
      loadDogBarks();
    }
    spawnInitialTargets();
    if (theme !== "dog" && soundOn) {
      playStartSound();
    }
    lastTime = performance.now();
  }

  function pauseGame() {
    if (state !== "playing") return;
    state = "paused";
    ui.hud.classList.remove("playing");
    ui.pauseScreen.classList.add("visible");
    window.clearTimeout(dogRespawnTimer);
    stopActiveBark();
  }

  function resumeGame() {
    if (state !== "paused") return;
    state = "playing";
    ui.pauseScreen.classList.remove("visible");
    ui.hud.classList.add("playing");
    if (theme === "dog") {
      if (!targets.some((target) => target.type === "dog")) spawnDogTarget(false);
    }
    lastTime = performance.now();
  }

  function showHome() {
    state = "menu";
    targets.length = 0;
    particles.length = 0;
    window.clearTimeout(dogRespawnTimer);
    stopActiveBark();
    ui.pauseScreen.classList.remove("visible");
    ui.hud.classList.remove("playing");
    ui.startScreen.classList.add("visible");
  }

  function spawnInitialTargets() {
    const count = theme === "dog" ? 1 : 2;
    for (let i = 0; i < count; i += 1) spawnTarget(i, false);
  }

  function spawnTarget(index = 0, announce = true) {
    if (theme === "dog") {
      spawnDogTarget(announce);
      return;
    }
    const roll = Math.random();
    const mixedType = roll < 0.5 ? "fish" : "ball";
    const type = theme === "mix" ? mixedType : theme;
    const shortSide = Math.min(width, height);
    const radius = type === "fish"
      ? clamp(shortSide * 0.27, 138, 235)
      : clamp(shortSide * 0.235, 122, 205);
    const extentX = type === "fish" ? radius * 1.34 : radius;
    const extentY = type === "fish" ? radius * 0.76 : radius;
    const marginX = extentX + 12;
    const marginY = extentY + 12;
    const speed = speedSettings();
    const baseSpeed = speed.move;
    let x = width / 2;
    let y = height / 2;
    for (let attempt = 0; attempt < 12; attempt += 1) {
      x = marginX + Math.random() * Math.max(1, width - marginX * 2);
      y = marginY + 72 + Math.random() * Math.max(1, height - marginY * 2 - 102);
      if (index === 1 && attempt === 0) x = width - x;
      const hasRoom = targets.every((other) => {
        const clearX = Math.abs(x - other.x) >= (extentX + other.extentX) * 0.82;
        const clearY = Math.abs(y - other.y) >= (extentY + other.extentY) * 0.9;
        return clearX || clearY;
      });
      if (hasRoom) break;
    }
    const angle = Math.random() * TAU;
    const velocity = baseSpeed * (0.82 + Math.random() * 0.42);
    const palette = type === "fish"
      ? ["#ffdc38", "#35a7ff", "#ffe86a", "#67d8ff"]
      : ["#ffdf35", "#2f8fff", "#fff077", "#57caff"];
    const colorIndex = Math.floor(Math.random() * palette.length);
    targets.push({
      id: nextTargetId++, type, x, y, radius,
      extentX, extentY,
      vx: Math.cos(angle) * velocity, vy: Math.sin(angle) * velocity,
      color: palette[colorIndex], accent: palette[(colorIndex + 1) % palette.length],
      phase: Math.random() * TAU, rotation: Math.random() * TAU,
      pattern: Math.floor(Math.random() * 3), age: 0, scale: 0,
    });
    if (announce && soundOn) playAppearSound(x);
  }

  function edgePoint(edge, slot, target) {
    const horizontalRoom = Math.max(1, width - target.extentX * 2.1);
    const verticalTop = Math.max(84, target.extentY * 0.72);
    const verticalRoom = Math.max(1, height - verticalTop - target.extentY * 0.75);
    if (edge === "left") return { x: -target.extentX * 1.2, y: verticalTop + verticalRoom * slot };
    if (edge === "right") return { x: width + target.extentX * 1.2, y: verticalTop + verticalRoom * slot };
    if (edge === "top") return { x: target.extentX * 1.05 + horizontalRoom * slot, y: -target.extentY * 1.25 };
    return { x: target.extentX * 1.05 + horizontalRoom * slot, y: height + target.extentY * 1.25 };
  }

  function spawnDogTarget(announce = true) {
    if (targets.some((target) => target.type === "dog")) return;
    dogRouteIndex = (dogRouteIndex + 1) % dogRoutes.length;
    const route = dogRoutes[dogRouteIndex];
    const shortSide = Math.min(width, height);
    const radius = clamp(Math.min(shortSide * 0.15, width * 0.125), 64, 124);
    const jumpStart = 0.44 + Math.random() * 0.1;
    const target = {
      id: nextTargetId++, type: "dog", radius,
      extentX: radius * 1.68, extentY: radius * 1.48,
      route, routeProgress: 0, duration: 1,
      x: 0, y: 0, vx: 0, vy: 0,
      color: "#ffe052", accent: "#46baff",
      barkIndex: 0, phase: 0, age: 0, opacity: 1,
      scale: 0.78, rotation: 0, action: "walk",
      jumpStart, jumpEnd: jumpStart + 0.18, jumpOffset: 0, jumpProgress: 0,
      routeArc: (Math.random() < 0.5 ? -1 : 1) * radius * (0.3 + Math.random() * 0.35),
      depthScale: 0.07 + Math.random() * 0.06,
      greeted: false, reacting: false, hitDisabled: false, reactionLift: 0,
      announce,
    };
    const start = edgePoint(route[0], route[2], target);
    const end = edgePoint(route[1], route[3], target);
    const distance = Math.hypot(end.x - start.x, end.y - start.y);
    target.duration = distance / speedSettings().dogMove;
    target.x = start.x;
    target.y = start.y;
    target.vx = (end.x - start.x) / target.duration;
    target.vy = (end.y - start.y) / target.duration;
    targets.push(target);
  }

  function removeDogAndRespawn(target, minimumDelay = 0) {
    const index = targets.indexOf(target);
    if (index >= 0) targets.splice(index, 1);
    window.clearTimeout(dogRespawnTimer);
    const settings = speedSettings();
    const delay = Math.max(minimumDelay, settings.dogPause + Math.random() * settings.dogPauseSpread);
    dogRespawnTimer = window.setTimeout(() => {
      if (state === "playing" && theme === "dog") spawnDogTarget(true);
    }, delay);
  }

  function finishDogRoute(target) {
    removeDogAndRespawn(target);
  }

  function keepOnScreen(target) {
    if (target.type === "dog") return;
    target.x = clamp(target.x, target.extentX + 10, width - target.extentX - 10);
    target.y = clamp(target.y, target.extentY + 68, height - target.extentY - 10);
  }

  function update(dt) {
    ambientTime += dt;
    bubbles.forEach((bubble) => {
      bubble.y -= bubble.speed * dt;
      bubble.x += Math.sin(ambientTime * 0.8 + bubble.drift) * 3 * dt;
      if (bubble.y < -bubble.radius * 2) {
        bubble.y = height + bubble.radius * 2;
        bubble.x = Math.random() * width;
      }
    });
    if (state !== "playing") return;

    targets.forEach((target) => {
      target.age += dt;
      if (target.type === "dog") {
        target.barkTime = Math.max(0, target.barkTime - dt);
        if (target.reacting) {
          target.reactionAge += dt;
          const reactionProgress = clamp(target.reactionAge / 0.52, 0, 1);
          const escapeProgress = reactionProgress * reactionProgress;
          target.reactionLift = Math.sin(reactionProgress * Math.PI) * target.radius * 0.72;
          target.x = target.reactionStartX + target.reactionDirection * target.escapeDistance * escapeProgress;
          target.y = target.reactionStartY - target.reactionLift;
          target.vx = target.reactionDirection * speedSettings().dogMove * 2.8;
          target.vy = -Math.cos(reactionProgress * Math.PI) * target.radius * 2.4;
          target.phase += dt * 13;
          target.scale = target.reactionStartScale * (1 - reactionProgress * 0.08);
          target.opacity = 1 - clamp((reactionProgress - 0.56) / 0.44, 0, 1);
          target.action = "run";
          if (reactionProgress >= 1) removeDogAndRespawn(target, 850);
          return;
        }

        const currentProgress = target.routeProgress;
        const observingFirst = currentProgress >= 0.16 && currentProgress < 0.24;
        const observingSecond = currentProgress >= target.jumpEnd && currentProgress < target.jumpEnd + 0.07;
        const pace = observingFirst || observingSecond
          ? 0.52
          : currentProgress < 0.16 ? 0.86 : currentProgress > 0.74 ? 1.32 : 1.15;
        target.routeProgress += (dt / target.duration) * pace;
        if (target.routeProgress >= 1) {
          finishDogRoute(target);
          return;
        }
        const progress = target.routeProgress;
        const start = edgePoint(target.route[0], target.route[2], target);
        const end = edgePoint(target.route[1], target.route[3], target);
        const previousX = target.x;
        const previousY = target.y;
        const pathX = start.x + (end.x - start.x) * progress;
        const pathY = start.y + (end.y - start.y) * progress
          + Math.sin(progress * Math.PI) * target.routeArc;
        const isObserving = (progress >= 0.16 && progress < 0.24)
          || (progress >= target.jumpEnd && progress < target.jumpEnd + 0.07);
        const isJumping = progress >= target.jumpStart && progress <= target.jumpEnd;
        const jumpProgress = isJumping ? (progress - target.jumpStart) / (target.jumpEnd - target.jumpStart) : 0;
        target.jumpProgress = jumpProgress;
        target.jumpOffset = isJumping ? Math.sin(jumpProgress * Math.PI) * target.radius * 0.82 : 0;
        target.action = isObserving ? "observe" : progress < 0.25 ? "walk" : isJumping ? "jump" : "run";
        target.x = pathX;
        target.y = pathY - target.jumpOffset;
        target.vx = (target.x - previousX) / Math.max(dt, 0.001);
        target.vy = (target.y - previousY) / Math.max(dt, 0.001);
        const gaitSpeed = target.action === "observe" ? 1.2 : target.action === "walk" ? 5.2 : target.action === "jump" ? 8 : 10.4;
        target.phase += dt * gaitSpeed;
        const fade = Math.min(1, progress / 0.075, (1 - progress) / 0.075);
        const breathing = isObserving ? Math.sin(target.age * 2.7) * 0.014 : 0;
        target.scale = 0.78 + Math.max(0, fade) * 0.22
          + Math.sin(progress * Math.PI) * target.depthScale + breathing;
        const tangentY = (end.y - start.y) + Math.cos(progress * Math.PI) * Math.PI * target.routeArc;
        target.rotation = clamp(Math.atan2(tangentY, Math.abs(end.x - start.x)) * 0.15, -0.11, 0.11);
        if (!target.greeted && progress >= 0.175) {
          target.greeted = true;
          if (soundOn) playDogBark(target.x, target.barkIndex);
        }
        return;
      }
      target.scale = Math.min(1, target.scale + dt * speedSettings().appear);
      target.phase += dt * 3;
      target.rotation += dt * 0.7;
      target.x += target.vx * dt;
      target.y += target.vy * dt;
      const side = target.extentX + 10;
      const top = target.extentY + 72;
      const bottom = target.extentY + 12;
      if (target.x < side) { target.x = side; target.vx = Math.abs(target.vx); }
      else if (target.x > width - side) { target.x = width - side; target.vx = -Math.abs(target.vx); }
      if (target.y < top) { target.y = top; target.vy = Math.abs(target.vy); }
      else if (target.y > height - bottom) { target.y = height - bottom; target.vy = -Math.abs(target.vy); }
      if (target.type === "fish") {
        const desired = Math.hypot(target.vx, target.vy);
        target.vy += Math.sin(target.phase) * 4 * dt;
        const actual = Math.max(1, Math.hypot(target.vx, target.vy));
        target.vx = (target.vx / actual) * desired;
        target.vy = (target.vy / actual) * desired;
      }
    });

    for (let i = particles.length - 1; i >= 0; i -= 1) {
      const p = particles[i];
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.985;
      p.vy = p.vy * 0.985 + 32 * dt;
      p.rotation += p.spin * dt;
      if (p.life <= 0) particles.splice(i, 1);
    }
  }

  function handleTouch(event) {
    if (state !== "playing") return;
    event.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    showRipple(x, y);
    let bestIndex = -1;
    let bestDistance = Infinity;
    targets.forEach((target, index) => {
      if (target.hitDisabled) return;
      const hitX = target.extentX * 1.05 + 16;
      const hitY = target.extentY * 1.12 + 16;
      const normalizedDistance = Math.hypot((x - target.x) / hitX, (y - target.y) / hitY);
      if (normalizedDistance <= 1 && normalizedDistance < bestDistance) {
        bestIndex = index;
        bestDistance = normalizedDistance;
      }
    });
    if (bestIndex >= 0) popTarget(bestIndex, x, y);
  }

  function popTarget(index, touchX, touchY) {
    const target = targets[index];
    score += 1;
    ui.score.textContent = String(score);
    if (navigator.vibrate) navigator.vibrate(18);

    if (target.type === "dog") {
      target.hitDisabled = true;
      target.reacting = true;
      target.reactionAge = 0;
      target.reactionStartX = target.x;
      target.reactionStartY = target.y;
      target.reactionStartScale = target.scale;
      target.reactionDirection = touchX <= target.x ? 1 : -1;
      target.escapeDistance = Math.max(width * 0.48, target.extentX * 3.2);
      target.jumpOffset = 0;
      if (soundOn) playDogBark(target.x, target.barkIndex);
      return;
    }

    targets.splice(index, 1);
    burst(target, touchX, touchY);
    if (soundOn) playCatchSound(target.type, target.x);
    window.setTimeout(() => {
      if (state === "playing") spawnTarget();
    }, speedSettings().respawn);
  }

  function showRipple(x, y) {
    ui.ripple.style.left = `${x}px`;
    ui.ripple.style.top = `${y}px`;
    ui.ripple.classList.remove("show");
    void ui.ripple.offsetWidth;
    ui.ripple.classList.add("show");
    clearTimeout(rippleTimer);
    rippleTimer = setTimeout(() => ui.ripple.classList.remove("show"), 430);
  }

  function burst(target, touchX, touchY) {
    const colors = [target.color, target.accent, "#ffffff", "#ffe85c", "#43bfff"];
    const count = 34;
    for (let i = 0; i < count; i += 1) {
      const angle = (i / count) * TAU + Math.random() * 0.25;
      const speed = 85 + Math.random() * 230;
      particles.push({
        x: target.x + (touchX - target.x) * 0.16,
        y: target.y + (touchY - target.y) * 0.16,
        vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        radius: 4 + Math.random() * 10,
        color: colors[i % colors.length], life: 0.65 + Math.random() * 0.45,
        startLife: 1.1, rotation: Math.random() * TAU,
        spin: (Math.random() - 0.5) * 12, shape: i % 4,
      });
    }
  }

  function ensureAudio() {
    if (!audioContext) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) audioContext = new AudioCtx();
    }
    if (audioContext?.state === "suspended") audioContext.resume();
  }

  function loadDogBarks() {
    ensureAudio();
    if (!audioContext || dogBarkBuffers.length === dogBarkFiles.length) return Promise.resolve(dogBarkBuffers);
    if (dogBarkLoadPromise) return dogBarkLoadPromise;
    dogBarkLoadPromise = Promise.all(dogBarkFiles.map(async (src) => {
      const response = await fetch(src);
      if (!response.ok) throw new Error(`犬吠音频载入失败：${src}`);
      const bytes = await response.arrayBuffer();
      return audioContext.decodeAudioData(bytes);
    })).then((buffers) => {
      dogBarkBuffers = buffers;
      return buffers;
    }).catch((error) => {
      console.warn(error);
      return [];
    });
    return dogBarkLoadPromise;
  }

  function stopActiveBark() {
    if (!activeBarkSource) return;
    try { activeBarkSource.stop(); } catch (_) { /* It may already have ended. */ }
    activeBarkSource = null;
  }

  function audioNodes(x, volume = 0.12) {
    ensureAudio();
    if (!audioContext || volumeLevel <= 0) return null;
    const gain = audioContext.createGain();
    const level = volume * volumeLevel;
    gain.gain.value = level;
    let output = gain;
    if (audioContext.createStereoPanner) {
      const panner = audioContext.createStereoPanner();
      panner.pan.value = clamp((x / Math.max(width, 1)) * 1.5 - 0.75, -0.75, 0.75);
      gain.connect(panner);
      output = panner;
    }
    output.connect(audioContext.destination);
    return { gain, level, now: audioContext.currentTime };
  }

  function playCatchSound(type, x) {
    if (type === "dog") {
      playDogBark(x);
      return;
    }
    const nodes = audioNodes(x, type === "ball" ? 0.15 : 0.12);
    if (!nodes) return;
    const { gain, level, now } = nodes;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(level, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);

    if (type === "ball") {
      const squeak = audioContext.createOscillator();
      squeak.type = "triangle";
      squeak.frequency.setValueAtTime(720 + Math.random() * 90, now);
      squeak.frequency.exponentialRampToValueAtTime(1500 + Math.random() * 180, now + 0.08);
      squeak.frequency.exponentialRampToValueAtTime(820, now + 0.23);
      squeak.connect(gain);
      squeak.start(now);
      squeak.stop(now + 0.31);
    } else {
      [0, 0.085].forEach((delay, index) => {
        const chirp = audioContext.createOscillator();
        chirp.type = "sine";
        chirp.frequency.setValueAtTime(1050 + index * 230, now + delay);
        chirp.frequency.exponentialRampToValueAtTime(1750 + index * 250, now + delay + 0.07);
        chirp.connect(gain);
        chirp.start(now + delay);
        chirp.stop(now + delay + 0.1);
      });
      const bubble = audioContext.createOscillator();
      bubble.type = "sine";
      bubble.frequency.setValueAtTime(520, now + 0.16);
      bubble.frequency.exponentialRampToValueAtTime(230, now + 0.28);
      bubble.connect(gain);
      bubble.start(now + 0.16);
      bubble.stop(now + 0.3);
    }
  }

  function playDogBark(x, requestedIndex = null) {
    const visibleDog = targets.find((target) => target.type === "dog");
    if (visibleDog) visibleDog.barkTime = 0.48;
    ensureAudio();
    if (!audioContext || volumeLevel <= 0) return;
    if (dogBarkBuffers.length !== dogBarkFiles.length) {
      loadDogBarks().then((buffers) => {
        if (buffers.length) playDogBark(x, requestedIndex);
      });
      return;
    }
    const barkIndex = requestedIndex == null
      ? Math.floor(Math.random() * dogBarkBuffers.length)
      : Math.abs(requestedIndex) % dogBarkBuffers.length;
    const buffer = dogBarkBuffers[barkIndex];
    const nodes = audioNodes(x, 0.92);
    if (!nodes || !buffer) return;
    const { gain, level, now } = nodes;
    stopActiveBark();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(level, now + 0.018);
    gain.gain.setValueAtTime(level, now + Math.max(0.02, buffer.duration - 0.08));
    gain.gain.exponentialRampToValueAtTime(0.0001, now + buffer.duration);
    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(gain);
    source.onended = () => {
      if (activeBarkSource === source) activeBarkSource = null;
    };
    activeBarkSource = source;
    source.start(now);
  }

  function playAppearSound(x) {
    const nodes = audioNodes(x, 0.052);
    if (!nodes) return;
    const { gain, level, now } = nodes;
    const oscillator = audioContext.createOscillator();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(780, now);
    oscillator.frequency.exponentialRampToValueAtTime(1080, now + 0.07);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(level, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.1);
    oscillator.connect(gain);
    oscillator.start(now);
    oscillator.stop(now + 0.11);
  }

  function playStartSound() {
    [0, 0.1, 0.2].forEach((delay, index) => {
      const nodes = audioNodes(width / 2, 0.07);
      if (!nodes) return;
      const { gain, level, now } = nodes;
      const oscillator = audioContext.createOscillator();
      oscillator.type = "sine";
      oscillator.frequency.value = 520 + index * 170;
      gain.gain.setValueAtTime(0.0001, now + delay);
      gain.gain.exponentialRampToValueAtTime(level, now + delay + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + delay + 0.105);
      oscillator.connect(gain);
      oscillator.start(now + delay);
      oscillator.stop(now + delay + 0.12);
    });
  }

  function draw() {
    drawBackground();
    targets.forEach(drawTarget);
    particles.forEach(drawParticle);
  }

  function drawBackground() {
    if (theme === "dog") {
      drawDogBackground();
      return;
    }
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, "#07172e");
    gradient.addColorStop(0.52, "#063c61");
    gradient.addColorStop(1, "#087079");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
    const glow = ctx.createRadialGradient(width * 0.5, height * 0.35, 10, width * 0.5, height * 0.35, Math.max(width, height) * 0.65);
    glow.addColorStop(0, "rgba(40, 198, 213, 0.16)");
    glow.addColorStop(1, "rgba(5, 20, 45, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);
    bubbles.forEach((bubble) => {
      ctx.strokeStyle = "rgba(175, 239, 249, 0.31)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(bubble.x, bubble.y, bubble.radius, 0, TAU);
      ctx.stroke();
    });
    ctx.fillStyle = "#075365";
    ctx.beginPath();
    ctx.moveTo(0, height);
    for (let x = 0; x <= width + 60; x += 60) {
      const y = height - 18 - Math.sin(x * 0.021) * 8;
      ctx.quadraticCurveTo(x + 30, y - 12, x + 60, y);
    }
    ctx.lineTo(width, height);
    ctx.closePath();
    ctx.fill();
    plants.forEach(drawPlant);
  }

  function drawDogBackground() {
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, "#010817");
    gradient.addColorStop(0.6, "#042b4b");
    gradient.addColorStop(1, "#064d6d");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    const dog = targets.find((target) => target.type === "dog");
    if (dog) {
      const haloRadius = dog.radius * 2.7;
      const halo = ctx.createRadialGradient(dog.x, dog.y, dog.radius * 0.35, dog.x, dog.y, haloRadius);
      halo.addColorStop(0, `rgba(255, 224, 82, ${0.13 * (dog.opacity ?? 1)})`);
      halo.addColorStop(0.5, `rgba(45, 178, 255, ${0.07 * (dog.opacity ?? 1)})`);
      halo.addColorStop(1, "rgba(1, 8, 23, 0)");
      ctx.fillStyle = halo;
      ctx.fillRect(dog.x - haloRadius, dog.y - haloRadius, haloRadius * 2, haloRadius * 2);
    }

    const floor = ctx.createLinearGradient(0, height * 0.78, 0, height);
    floor.addColorStop(0, "rgba(4, 26, 58, 0)");
    floor.addColorStop(1, "rgba(2, 14, 35, 0.58)");
    ctx.fillStyle = floor;
    ctx.fillRect(0, height * 0.72, width, height * 0.28);
  }

  function drawPlant(plant) {
    ctx.save();
    ctx.translate(plant.x, height + 8);
    ctx.strokeStyle = plant.hue;
    ctx.lineWidth = 9;
    ctx.lineCap = "round";
    for (let i = 0; i < 3; i += 1) {
      const sway = Math.sin(ambientTime * 0.8 + plant.phase + i) * 8;
      ctx.beginPath();
      ctx.moveTo((i - 1) * 11, 0);
      ctx.quadraticCurveTo(sway, -plant.height * 0.52, sway + (i - 1) * 7, -plant.height + i * 9);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawTarget(target) {
    ctx.save();
    ctx.globalAlpha = target.opacity ?? 1;
    ctx.translate(target.x, target.y);
    ctx.scale(target.scale, target.scale);
    if (target.type === "dog") {
      drawAnimatedDog(target);
    } else if (target.type === "fish") {
      ctx.translate(0, Math.sin(target.phase) * target.radius * 0.045);
      ctx.rotate(Math.sin(target.phase * 0.7) * 0.035);
      drawFish(target);
    } else {
      const bounce = Math.abs(Math.sin(target.phase * 0.85));
      ctx.translate(0, -bounce * target.radius * 0.08);
      ctx.scale(1 + bounce * 0.025, 1 - bounce * 0.025);
      drawBall(target);
    }
    ctx.restore();
  }

  function drawAnimatedDog(target) {
    const r = target.radius;
    if (!dogSpriteSheet.complete || dogSpriteSheet.naturalWidth === 0) {
      drawFallbackDog(target);
      return;
    }

    const facing = target.vx >= 0 ? 1 : -1;
    const frameWidth = dogSpriteSheet.naturalWidth / 4;
    const frameHeight = dogSpriteSheet.naturalHeight / 3;
    const sourceInset = 12;
    let row = 0;
    let column = Math.floor(target.phase * 1.35) % 4;
    if (target.action === "observe") column = 1;
    if (target.action === "run") row = 1;
    if (target.action === "jump") {
      row = 2;
      column = Math.min(3, Math.floor(target.jumpProgress * 4));
    }
    let sourceX = column * frameWidth + sourceInset;
    let sourceWidth = frameWidth - sourceInset * 2;
    let sourceY = row * frameHeight + sourceInset;
    let sourceHeight = frameHeight - sourceInset * 2;
    // The first running cell sits close to the following tail; use the true
    // transparent gap so neighboring-frame pixels can never flash on screen.
    if (row === 1 && column === 0) sourceWidth -= 16;
    if (row === 1 && column === 1) {
      sourceX -= 24;
      sourceWidth += 24;
    }
    if (row === 1) {
      sourceY -= sourceInset;
      sourceHeight -= 28;
    }
    if (row === 2) {
      sourceY -= 60;
      sourceHeight += 40;
    }

    ctx.save();
    const groundLift = target.jumpOffset + (target.reactionLift || 0);
    ctx.globalAlpha = clamp(0.32 - groundLift / (r * 4.5), 0.1, 0.32);
    ctx.fillStyle = "#020b19";
    ctx.beginPath();
    ctx.ellipse(0, r * 1.22 + groundLift, r * 1.16, r * 0.17, 0, 0, TAU);
    ctx.fill();
    ctx.restore();

    const drawSize = r * 3.35;
    if (target.action === "observe") ctx.translate(0, Math.sin(target.age * 2.7) * r * 0.012);
    ctx.rotate(target.rotation + (target.action === "observe" ? Math.sin(target.age * 1.8) * 0.018 : 0));
    ctx.scale(facing, 1);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.shadowColor = "rgba(255, 224, 82, 0.58)";
    ctx.shadowBlur = r * 0.21;
    ctx.drawImage(
      dogSpriteSheet,
      sourceX, sourceY, sourceWidth, sourceHeight,
      -drawSize / 2, -drawSize / 2, drawSize, drawSize,
    );
    ctx.shadowBlur = 0;

    if (target.barkTime > 0) {
      const pulse = 0.92 + Math.sin(target.barkTime * 34) * 0.08;
      ctx.strokeStyle = "rgba(255, 224, 82, 0.94)";
      ctx.lineWidth = Math.max(4, r * 0.045);
      ctx.lineCap = "round";
      [1.47, 1.68].forEach((offset, index) => {
        ctx.beginPath();
        ctx.arc(r * offset, -r * 0.38, r * (0.13 + index * 0.08) * pulse, -0.78, 0.78);
        ctx.stroke();
      });
    }
  }

  function drawFallbackDog(target) {
    const r = target.radius;
    const style = dogFallbackStyle;
    const facing = target.vx >= 0 ? 1 : -1;
    const runAmount = target.action === "walk" ? 0.46 : target.action === "jump" ? 0.34 : 0.82;
    const bob = target.action === "walk"
      ? Math.abs(Math.sin(target.phase)) * r * 0.025
      : Math.abs(Math.sin(target.phase * 1.05)) * r * 0.065;

    ctx.rotate(target.rotation);
    ctx.translate(0, -bob);

    ctx.save();
    ctx.globalAlpha = clamp(0.34 - target.jumpOffset / (r * 4.4), 0.12, 0.34);
    ctx.fillStyle = "#020b19";
    ctx.beginPath();
    ctx.ellipse(0, r * 0.72 + target.jumpOffset, r * 0.96, r * 0.18, 0, 0, TAU);
    ctx.fill();
    ctx.restore();

    ctx.scale(facing, 1);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.shadowColor = style.accent;
    ctx.shadowBlur = r * 0.25;

    const drawLeg = (hipX, phaseOffset, near) => {
      const swing = Math.sin(target.phase + phaseOffset) * r * runAmount;
      const jumping = target.action === "jump";
      const outward = hipX < 0 ? -r * 0.08 : r * 0.08;
      const kneeX = hipX + (jumping ? r * 0.18 : swing * 0.2 + outward * 0.35);
      const kneeY = jumping ? r * 0.32 : r * 0.5;
      const pawX = hipX + (jumping ? outward : swing * 0.4 + outward);
      const pawY = jumping ? r * 0.5 : r * 0.91;
      ctx.globalAlpha = near ? 1 : 0.68;
      ctx.strokeStyle = style.dark;
      ctx.lineWidth = r * (near ? 0.22 : 0.19);
      ctx.beginPath();
      ctx.moveTo(hipX, r * 0.12);
      ctx.lineTo(kneeX, kneeY);
      ctx.lineTo(pawX, pawY);
      ctx.stroke();
      ctx.strokeStyle = near ? style.coat : style.patch;
      ctx.lineWidth = r * (near ? 0.13 : 0.105);
      ctx.stroke();
      ctx.fillStyle = near ? style.coat : style.patch;
      ctx.beginPath();
      ctx.ellipse(pawX + r * 0.045, pawY, r * 0.16, r * 0.075, 0, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
    };

    drawLeg(-r * 0.5, Math.PI, false);
    drawLeg(r * 0.43, 0, false);

    const tailSwing = Math.sin(target.phase * 1.35) * r * 0.2;
    ctx.strokeStyle = style.dark;
    ctx.lineWidth = r * 0.24;
    ctx.beginPath();
    ctx.moveTo(-r * 0.78, -r * 0.15);
    ctx.quadraticCurveTo(-r * 1.08, -r * 0.42 - tailSwing, -r * 1.2, -r * 0.72 + tailSwing * 0.5);
    ctx.stroke();
    ctx.strokeStyle = style.coat;
    ctx.lineWidth = r * 0.14;
    ctx.stroke();

    ctx.fillStyle = style.dark;
    ctx.beginPath();
    ctx.ellipse(-r * 0.06, -r * 0.13, r * 0.93, r * 0.5, -0.02, 0, TAU);
    ctx.fill();
    ctx.fillStyle = style.coat;
    ctx.beginPath();
    ctx.ellipse(-r * 0.06, -r * 0.15, r * 0.86, r * 0.43, -0.02, 0, TAU);
    ctx.fill();

    if (style.kind === "poodle") {
      ctx.fillStyle = style.coat;
      [[-0.7, -0.25], [-0.48, -0.48], [-0.15, -0.52], [0.18, -0.48], [0.46, -0.31]].forEach(([x, y]) => {
        ctx.beginPath();
        ctx.arc(r * x, r * y, r * 0.23, 0, TAU);
        ctx.fill();
      });
      ctx.fillStyle = style.light;
      ctx.globalAlpha = 0.34;
      [[-0.5, -0.53], [-0.06, -0.57], [0.31, -0.46]].forEach(([x, y]) => {
        ctx.beginPath();
        ctx.arc(r * x, r * y, r * 0.11, 0, TAU);
        ctx.fill();
      });
      ctx.globalAlpha = 1;
    } else if (style.kind === "collie") {
      ctx.fillStyle = style.patch;
      ctx.beginPath();
      ctx.ellipse(-r * 0.33, -r * 0.2, r * 0.38, r * 0.37, -0.25, 0, TAU);
      ctx.fill();
      ctx.fillStyle = style.light;
      ctx.beginPath();
      ctx.ellipse(r * 0.31, -r * 0.2, r * 0.24, r * 0.37, 0.18, 0, TAU);
      ctx.fill();
    } else {
      ctx.fillStyle = style.light;
      ctx.globalAlpha = 0.56;
      ctx.beginPath();
      ctx.ellipse(-r * 0.06, -r * 0.34, r * 0.58, r * 0.18, -0.03, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    ctx.fillStyle = style.dark;
    ctx.beginPath();
    ctx.ellipse(r * 0.58, -r * 0.43, r * 0.34, r * 0.42, -0.12, 0, TAU);
    ctx.fill();
    ctx.fillStyle = style.coat;
    ctx.beginPath();
    ctx.ellipse(r * 0.61, -r * 0.46, r * 0.29, r * 0.37, -0.12, 0, TAU);
    ctx.fill();

    ctx.fillStyle = style.patch;
    ctx.beginPath();
    ctx.moveTo(r * 0.46, -r * 0.73);
    ctx.quadraticCurveTo(r * 0.28, -r * 1.08, r * 0.7, -r * 0.8);
    ctx.quadraticCurveTo(r * 0.65, -r * 0.55, r * 0.46, -r * 0.73);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(r * 0.72, -r * 0.72);
    ctx.quadraticCurveTo(r * 0.86, -r * 1.02, r * 0.95, -r * 0.65);
    ctx.quadraticCurveTo(r * 0.82, -r * 0.49, r * 0.72, -r * 0.72);
    ctx.fill();

    ctx.fillStyle = style.light;
    ctx.beginPath();
    ctx.ellipse(r * 0.92, -r * 0.39, r * 0.38, r * 0.24, -0.02, 0, TAU);
    ctx.fill();
    ctx.fillStyle = style.dark;
    ctx.beginPath();
    ctx.arc(r * 1.18, -r * 0.43, r * 0.12, 0, TAU);
    ctx.fill();

    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(r * 0.76, -r * 0.58, r * 0.095, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "#081426";
    ctx.beginPath();
    ctx.arc(r * 0.79, -r * 0.58, r * 0.052, 0, TAU);
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.strokeStyle = style.accent;
    ctx.lineWidth = r * 0.1;
    ctx.beginPath();
    ctx.arc(r * 0.54, -r * 0.35, r * 0.34, 0.55, 2.3);
    ctx.stroke();
    ctx.fillStyle = style.accent;
    ctx.beginPath();
    ctx.arc(r * 0.55, -r * 0.02, r * 0.085, 0, TAU);
    ctx.fill();

    if (target.barkTime > 0) {
      ctx.fillStyle = style.dark;
      ctx.beginPath();
      ctx.ellipse(r * 1.02, -r * 0.25, r * 0.17, r * 0.13, 0.16, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = style.accent;
      ctx.lineWidth = Math.max(3, r * 0.045);
      [1.38, 1.58].forEach((offset, index) => {
        ctx.beginPath();
        ctx.arc(r * offset, -r * 0.39, r * (0.13 + index * 0.07), -0.75, 0.75);
        ctx.stroke();
      });
    } else {
      ctx.strokeStyle = style.dark;
      ctx.lineWidth = Math.max(2, r * 0.035);
      ctx.beginPath();
      ctx.arc(r * 1.02, -r * 0.35, r * 0.16, 0.32, 1.45);
      ctx.stroke();
    }

    drawLeg(-r * 0.43, 0, true);
    drawLeg(r * 0.47, Math.PI, true);
  }

  function drawFish(target) {
    const facing = target.vx >= 0 ? 1 : -1;
    const r = target.radius;
    ctx.scale(facing, 1);
    ctx.shadowColor = target.color;
    ctx.shadowBlur = Math.max(22, r * 0.26);

    // The tail pivots from the body so the fish visibly swims instead of sliding.
    ctx.save();
    ctx.translate(-r * 0.62, 0);
    ctx.rotate(Math.sin(target.phase * 2.8) * 0.38);
    ctx.fillStyle = target.accent;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-r * 0.72, -r * 0.72);
    ctx.quadraticCurveTo(-r * 0.52, 0, -r * 0.72, r * 0.72);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.48)";
    ctx.lineWidth = Math.max(3, r * 0.045);
    ctx.beginPath();
    ctx.moveTo(-r * 0.08, 0);
    ctx.lineTo(-r * 0.56, -r * 0.5);
    ctx.moveTo(-r * 0.08, 0);
    ctx.lineTo(-r * 0.56, r * 0.5);
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = target.color;
    ctx.beginPath();
    ctx.ellipse(0, 0, r, r * 0.63, 0, 0, TAU);
    ctx.fill();

    // Blue/yellow patterns remain distinct for canine dichromatic vision.
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 0.96, r * 0.59, 0, 0, TAU);
    ctx.clip();
    ctx.shadowBlur = 0;
    ctx.fillStyle = target.accent;
    ctx.strokeStyle = target.accent;
    ctx.globalAlpha = 0.62;
    if (target.pattern === 0) {
      ctx.lineWidth = r * 0.16;
      [-0.44, -0.08, 0.28].forEach((offset) => {
        ctx.beginPath();
        ctx.moveTo(r * offset - r * 0.2, -r * 0.72);
        ctx.lineTo(r * offset + r * 0.15, r * 0.72);
        ctx.stroke();
      });
    } else if (target.pattern === 1) {
      [[-0.42, -0.2, 0.16], [-0.2, 0.27, 0.12], [0.08, -0.16, 0.14], [0.26, 0.3, 0.1]].forEach(([x, y, size]) => {
        ctx.beginPath();
        ctx.arc(r * x, r * y, r * size, 0, TAU);
        ctx.fill();
      });
    } else {
      ctx.lineWidth = r * 0.1;
      [-0.28, 0.08, 0.42].forEach((offset) => {
        ctx.beginPath();
        ctx.arc(r * offset, 0, r * 0.32, -1.2, 1.2);
        ctx.stroke();
      });
    }
    ctx.restore();

    ctx.fillStyle = lighten(target.color);
    ctx.beginPath();
    ctx.moveTo(-r * 0.2, -r * 0.49);
    ctx.quadraticCurveTo(r * 0.04, -r * (0.92 + Math.sin(target.phase * 2) * 0.08), r * 0.34, -r * 0.46);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = target.accent;
    ctx.globalAlpha = 0.82;
    ctx.beginPath();
    ctx.moveTo(-r * 0.08, r * 0.26);
    ctx.quadraticCurveTo(-r * 0.38, r * (0.74 + Math.sin(target.phase * 2.5) * 0.08), r * 0.16, r * 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = "white";
    ctx.beginPath();
    ctx.arc(r * 0.48, -r * 0.14, r * 0.18, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "#10213a";
    ctx.beginPath();
    ctx.arc(r * 0.53, -r * 0.13, r * 0.09, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.7)";
    ctx.lineWidth = Math.max(3, r * 0.07);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(r * 0.61, r * 0.08, r * 0.2, 0.25, 1.5);
    ctx.stroke();
  }

  function drawBall(target) {
    const r = target.radius;
    ctx.rotate(target.rotation);
    ctx.shadowColor = target.color;
    ctx.shadowBlur = Math.max(24, r * 0.26);
    const gradient = ctx.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.08, 0, 0, r);
    gradient.addColorStop(0, "#ffffff");
    gradient.addColorStop(0.13, lighten(target.color));
    gradient.addColorStop(0.58, target.color);
    gradient.addColorStop(1, darken(target.color));
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, TAU);
    ctx.fill();

    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.96, 0, TAU);
    ctx.clip();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = target.accent;
    ctx.fillStyle = target.accent;
    ctx.globalAlpha = 0.7;
    if (target.pattern === 0) {
      ctx.lineWidth = r * 0.18;
      [-0.52, 0, 0.52].forEach((offset) => {
        ctx.beginPath();
        ctx.moveTo(r * offset - r * 0.34, -r * 1.05);
        ctx.lineTo(r * offset + r * 0.34, r * 1.05);
        ctx.stroke();
      });
    } else if (target.pattern === 1) {
      [[-0.42, -0.38], [0.35, -0.48], [-0.12, 0.05], [0.46, 0.26], [-0.44, 0.46]].forEach(([x, y], index) => {
        ctx.beginPath();
        ctx.arc(r * x, r * y, r * (index === 2 ? 0.19 : 0.13), 0, TAU);
        ctx.fill();
      });
    } else {
      ctx.lineWidth = r * 0.15;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.62, 0, TAU);
      ctx.stroke();
      ctx.lineWidth = r * 0.1;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.28, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();

    ctx.strokeStyle = "rgba(255,255,255,0.68)";
    ctx.lineWidth = Math.max(5, r * 0.13);
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.67, -0.95, 0.9);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.67, Math.PI - 0.95, Math.PI + 0.9);
    ctx.stroke();
  }

  function drawParticle(p) {
    const alpha = clamp(p.life / p.startLife, 0, 1);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rotation);
    ctx.fillStyle = p.color;
    if (p.shape === 0) {
      ctx.beginPath();
      ctx.arc(0, 0, p.radius, 0, TAU);
      ctx.fill();
    } else if (p.shape === 1) {
      ctx.fillRect(-p.radius, -p.radius * 0.45, p.radius * 2, p.radius * 0.9);
    } else {
      ctx.beginPath();
      ctx.moveTo(0, -p.radius);
      ctx.lineTo(p.radius, p.radius);
      ctx.lineTo(-p.radius, p.radius * 0.55);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  function lighten(color) { return mixColor(color, "#ffffff", 0.34); }
  function darken(color) { return mixColor(color, "#06162d", 0.32); }

  function mixColor(a, b, amount) {
    const parse = (hex) => hex.match(/\w\w/g).map((value) => Number.parseInt(value, 16));
    const [ar, ag, ab] = parse(a);
    const [br, bg, bb] = parse(b);
    const blend = (left, right) => Math.round(left + (right - left) * amount).toString(16).padStart(2, "0");
    return `#${blend(ar, br)}${blend(ag, bg)}${blend(ab, bb)}`;
  }

  function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }

  function speedSettings() {
    if (speedMode === "fast") return {
      move: 138, dogMove: 215, appear: 7, respawn: 150, dogPause: 650, dogPauseSpread: 500,
    };
    if (speedMode === "normal") return {
      move: 92, dogMove: 145, appear: 5, respawn: 280, dogPause: 850, dogPauseSpread: 650,
    };
    return {
      move: 56, dogMove: 95, appear: 3.5, respawn: 460, dogPause: 1100, dogPauseSpread: 800,
    };
  }

  function loop(now) {
    const dt = Math.min(0.035, Math.max(0, (now - lastTime) / 1000));
    lastTime = now;
    update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  function beginPauseHold(event) {
    event.preventDefault();
    ui.pauseButton.classList.add("holding");
    holdTimer = window.setTimeout(() => {
      ui.pauseButton.classList.remove("holding");
      pauseGame();
    }, 750);
  }

  function cancelPauseHold() {
    window.clearTimeout(holdTimer);
    ui.pauseButton.classList.remove("holding");
  }

  function updateVolume() {
    volumeLevel = Number(ui.volumeSlider.value) / 100;
    ui.volumeValue.textContent = `${ui.volumeSlider.value}%`;
  }

  function previewVolume() {
    updateVolume();
    const selectedSound = document.querySelector('input[name="sound"]:checked').value;
    if (selectedSound === "on") playDogBark(width / 2);
  }

  ui.startButton.addEventListener("click", startGame);
  ui.resumeButton.addEventListener("click", resumeGame);
  ui.homeButton.addEventListener("click", showHome);
  ui.pauseButton.addEventListener("pointerdown", beginPauseHold);
  ui.pauseButton.addEventListener("pointerup", cancelPauseHold);
  ui.pauseButton.addEventListener("pointercancel", cancelPauseHold);
  ui.pauseButton.addEventListener("pointerleave", cancelPauseHold);
  ui.volumeSlider.addEventListener("input", updateVolume);
  ui.volumeSlider.addEventListener("change", previewVolume);
  canvas.addEventListener("pointerdown", handleTouch, { passive: false });
  canvas.addEventListener("contextmenu", (event) => event.preventDefault());
  window.addEventListener("resize", resize);
  window.addEventListener("orientationchange", () => window.setTimeout(resize, 100));
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && state === "playing") pauseGame();
  });

  resize();
  requestAnimationFrame(loop);
})();
