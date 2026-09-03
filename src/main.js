import {
  createFluidExperiment,
  FLUID_CELL,
  SOLID_CELL
} from "./fluid.js";

const canvas =
  document.querySelector("#fluidCanvas");

const ctx =
  canvas.getContext("2d", {
    alpha: false
  });

const initButton =
  document.querySelector("#initButton");

const bootOverlay =
  document.querySelector("#bootOverlay");

const sensorLabel =
  document.querySelector("#sensorLabel");

const fpsLabel =
  document.querySelector("#fpsLabel");

const menuButton =
  document.querySelector("#menuButton");

const controls =
  document.querySelector("#controls");

const closeControls =
  document.querySelector("#closeControls");

const flipRatio =
  document.querySelector("#flipRatio");

const flipOutput =
  document.querySelector("#flipOutput");

const gravityScale =
  document.querySelector("#gravityScale");

const gravityOutput =
  document.querySelector("#gravityOutput");

const damping =
  document.querySelector("#damping");

const dampingOutput =
  document.querySelector("#dampingOutput");

const particleCount =
  document.querySelector("#particleCount");

const particleCountOutput =
  document.querySelector("#particleCountOutput");

const driftToggle =
  document.querySelector("#driftToggle");

const separateToggle =
  document.querySelector("#separateToggle");

const trailToggle =
  document.querySelector("#trailToggle");

const debugToggle =
  document.querySelector("#debugToggle");

const resetButton =
  document.querySelector("#resetButton");

const fullscreenButton =
  document.querySelector("#fullscreenButton");

const themeButtons =
  [...document.querySelectorAll("[data-theme]")];

const G = 9.81;

const config = {
  flipRatio: 0.88,

  gravityScale: 1,

  damping: 0.0015,

  pressureIterations: 18,
  particleIterations: 1,

  overRelaxation: 1.90,

  compensateDrift: true,
  separateParticles: true,

  trail: false,
  debug: false,

  theme: "saber"
};

const gravity = {
  targetX: 0,
  targetY: -G,

  x: 0,
  y: -G,

  sensorActive: false
};

let fluid =
  createFluidExperiment();

let running = false;

let accumulator = 0;
let previousTime = performance.now();

const FIXED_DT = 1 / 60;
const MAX_STEPS = 2;

let fpsFrames = 0;
let fpsTime = performance.now();

const themes = {
  saber: {
    core: "rgba(218,153,255,0.98)",
    inner: "rgba(180,77,255,0.34)",
    glow: "rgba(123,35,255,0.085)",
    vessel: "rgba(189,105,255,0.20)",
    vesselHot: "rgba(189,105,255,0.42)"
  },

  phosphor: {
    core: "rgba(105,255,164,0.98)",
    inner: "rgba(55,255,129,0.32)",
    glow: "rgba(25,255,107,0.080)",
    vessel: "rgba(60,255,132,0.18)",
    vesselHot: "rgba(60,255,132,0.40)"
  }
};

function resize() {
  const dpr =
    Math.min(
      window.devicePixelRatio || 1,
      2
    );

  const width =
    window.innerWidth;

  const height =
    window.innerHeight;

  canvas.width =
    Math.round(width * dpr);

  canvas.height =
    Math.round(height * dpr);

  canvas.style.width =
    `${width}px`;

  canvas.style.height =
    `${height}px`;

  ctx.setTransform(
    dpr,
    0,
    0,
    dpr,
    0,
    0
  );
}

window.addEventListener(
  "resize",
  resize
);

resize();

function simulationTransform() {
  const w = window.innerWidth;
  const h = window.innerHeight;

  const safe =
    Math.min(w, h) * 0.88;

  const simulationSpan =
    fluid.vessel.radius * 2;

  const scale =
    safe / simulationSpan;

  return {
    scale,

    cx: w / 2,
    cy: h / 2
  };
}

function simToScreen(x, y) {
  const t =
    simulationTransform();

  return {
    x:
      t.cx +
      (x - fluid.vessel.cx) *
      t.scale,

    y:
      t.cy -
      (y - fluid.vessel.cy) *
      t.scale
  };
}

function drawVessel() {
  const t =
    simulationTransform();

  const theme =
    themes[config.theme];

  const radius =
    fluid.vessel.radius *
    t.scale;

  const gradient =
    ctx.createRadialGradient(
      t.cx,
      t.cy,
      radius * 0.88,

      t.cx,
      t.cy,
      radius * 1.06
    );

  gradient.addColorStop(
    0,
    "rgba(0,0,0,0)"
  );

  gradient.addColorStop(
    0.88,
    "rgba(0,0,0,0)"
  );

  gradient.addColorStop(
    1,
    theme.glow
  );

  ctx.fillStyle = gradient;

  ctx.beginPath();

  ctx.arc(
    t.cx,
    t.cy,
    radius * 1.06,
    0,
    Math.PI * 2
  );

  ctx.fill();

  ctx.strokeStyle =
    theme.vessel;

  ctx.lineWidth = 1;

  ctx.beginPath();

  ctx.arc(
    t.cx,
    t.cy,
    radius,
    0,
    Math.PI * 2
  );

  ctx.stroke();

  ctx.strokeStyle =
    "rgba(255,255,255,0.045)";

  ctx.lineWidth = 1;

  ctx.beginPath();

  ctx.arc(
    t.cx,
    t.cy,
    radius - 4,
    0,
    Math.PI * 2
  );

  ctx.stroke();
}

function drawParticles() {
  const t = simulationTransform();
  const theme = themes[config.theme];

  const radius = Math.max(
    1.2,
    fluid.particleRadius * t.scale * 0.78
  );

  /*
   * GOOLAB SAFE RENDERER
   *
   * Batch every particle into ONE canvas path.
   * This is enormously cheaper than:
   *
   *   beginPath()
   *   arc()
   *   fill()
   *
   * thousands of times across three separate passes.
   */

  ctx.globalCompositeOperation = "lighter";

  // soft body
  ctx.beginPath();

  for (let i = 0; i < fluid.numParticles; i++) {
    const p = 2 * i;

    const point = simToScreen(
      fluid.particlePos[p],
      fluid.particlePos[p + 1]
    );

    ctx.moveTo(point.x + radius, point.y);

    ctx.arc(
      point.x,
      point.y,
      radius,
      0,
      Math.PI * 2
    );
  }

  ctx.fillStyle = theme.inner;
  ctx.fill();

  // brilliant core
  const coreRadius = Math.max(0.65, radius * 0.40);

  ctx.beginPath();

  for (let i = 0; i < fluid.numParticles; i++) {
    const p = 2 * i;

    const point = simToScreen(
      fluid.particlePos[p],
      fluid.particlePos[p + 1]
    );

    ctx.moveTo(point.x + coreRadius, point.y);

    ctx.arc(
      point.x,
      point.y,
      coreRadius,
      0,
      Math.PI * 2
    );
  }

  ctx.fillStyle = theme.core;
  ctx.fill();

  ctx.globalCompositeOperation = "source-over";
}

function drawDebugGrid() {
  if (!config.debug)
    return;

  const n =
    fluid.fNumY;

  const t =
    simulationTransform();

  const h =
    fluid.h * t.scale;

  for (
    let i = 0;
    i < fluid.fNumX;
    i++
  ) {
    for (
      let j = 0;
      j < fluid.fNumY;
      j++
    ) {
      const cell =
        i * n + j;

      if (
        fluid.cellType[cell] !==
          FLUID_CELL &&
        fluid.cellType[cell] !==
          SOLID_CELL
      )
        continue;

      const p =
        simToScreen(
          (i + 0.5) * fluid.h,
          (j + 0.5) * fluid.h
        );

      ctx.fillStyle =
        fluid.cellType[cell] ===
        SOLID_CELL
          ? "rgba(255,255,255,.025)"
          : "rgba(255,255,255,.055)";

      ctx.fillRect(
        p.x - h / 2,
        p.y - h / 2,
        h,
        h
      );
    }
  }
}



/* ----------------------------------------------------------
 * GOOLAB TACTILE INTERACTION FIELD
 * ---------------------------------------------------------- */

const activeFluidPointers = new Map();

canvas.style.touchAction = "none";
document.documentElement.style.touchAction = "none";
document.body.style.touchAction = "none";

function screenToSimulation(clientX, clientY) {
  const t = simulationTransform();

  return {
    x:
      fluid.vessel.cx +
      (clientX - t.cx) / t.scale,

    y:
      fluid.vessel.cy -
      (clientY - t.cy) / t.scale
  };
}

function insideFluidVessel(x, y) {
  const dx = x - fluid.vessel.cx;
  const dy = y - fluid.vessel.cy;

  return (
    dx * dx + dy * dy <=
    fluid.vessel.radius * fluid.vessel.radius
  );
}

function beginFluidPointer(event) {
  const pos =
    screenToSimulation(
      event.clientX,
      event.clientY
    );

  if (!insideFluidVessel(pos.x, pos.y))
    return false;

  activeFluidPointers.set(
    event.pointerId,
    {
      x: pos.x,
      y: pos.y,

      /*
       * Accumulated physical displacement
       * waiting for the next physics tick.
       */
      dx: 0,
      dy: 0,

      /*
       * Latest measured velocity.
       */
      vx: 0,
      vy: 0,

      time: performance.now()
    }
  );

  return true;
}

function moveFluidPointer(event) {
  const pointer =
    activeFluidPointers.get(event.pointerId);

  if (!pointer)
    return;

  const pos =
    screenToSimulation(
      event.clientX,
      event.clientY
    );

  const now = performance.now();

  const dt =
    Math.max(
      1 / 240,
      Math.min(
        0.05,
        (now - pointer.time) / 1000
      )
    );

  const stepX = pos.x - pointer.x;
  const stepY = pos.y - pointer.y;

  /*
   * Preserve actual travelled distance.
   * This is what makes the finger act
   * like a physical paddle rather than
   * a momentary browser event.
   */
  pointer.dx += stepX;
  pointer.dy += stepY;

  let vx = stepX / dt;
  let vy = stepY / dt;

  const speed = Math.hypot(vx, vy);
  const maxSpeed = 18;

  if (speed > maxSpeed) {
    const k = maxSpeed / speed;
    vx *= k;
    vy *= k;
  }

  pointer.vx = vx;
  pointer.vy = vy;

  pointer.x = pos.x;
  pointer.y = pos.y;
  pointer.time = now;
}

/*
 * ----------------------------------------------------------
 * GLOBAL TACTILE INPUT
 *
 * Android browsers do not have to hit-test the canvas for
 * the experiment to receive interaction. We listen at the
 * window in capture phase and use the exact simulation
 * transform to decide whether the pointer belongs to the
 * vessel.
 * ----------------------------------------------------------
 */

function eventIsExperimentUI(event) {
  const target = event.target;

  if (!(target instanceof Element))
    return false;

  return Boolean(
    target.closest(
      "button, input, output, label, " +
      "[role='button'], a"
    )
  );
}

function onFluidPointerDown(event) {
  if (eventIsExperimentUI(event))
    return;

  if (!beginFluidPointer(event))
    return;

  event.preventDefault();
}

function onFluidPointerMove(event) {
  if (
    !activeFluidPointers.has(
      event.pointerId
    )
  )
    return;

  /*
   * Deliberately use the primary PointerEvent only.
   *
   * Android's coalesced-event behaviour varies between
   * browsers and was adding complexity to a path that
   * only needs one reliable sample per dispatched move.
   */
  moveFluidPointer(event);

  event.preventDefault();
}

function releaseFluidPointer(event) {
  activeFluidPointers.delete(
    event.pointerId
  );
}

window.addEventListener(
  "pointerdown",
  onFluidPointerDown,
  {
    passive: false,
    capture: true
  }
);

window.addEventListener(
  "pointermove",
  onFluidPointerMove,
  {
    passive: false,
    capture: true
  }
);

window.addEventListener(
  "pointerup",
  releaseFluidPointer,
  {
    passive: true,
    capture: true
  }
);

window.addEventListener(
  "pointercancel",
  releaseFluidPointer,
  {
    passive: true,
    capture: true
  }
);


/*
 * FINGER / PADDLE INTERACTION
 *
 * Unlike a weak force-only implementation,
 * this directly advects nearby particles by
 * a fraction of finger displacement and adds
 * corresponding momentum.
 *
 * FLIP then inherits that disturbed state.
 */
function applyTouchField() {
  document.documentElement.dataset.touchCount =
    String(activeFluidPointers.size);

  if (!activeFluidPointers.size)
    return;

  const interactionRadius = 0.42;
  const radiusSq =
    interactionRadius *
    interactionRadius;

  for (
    const pointer of
      activeFluidPointers.values()
  ) {
    /*
     * Bound one-frame displacement so a
     * dropped browser frame cannot explode
     * the solver.
     */
    const travel =
      Math.hypot(
        pointer.dx,
        pointer.dy
      );

    let moveX = pointer.dx;
    let moveY = pointer.dy;

    const maxTravel = 0.16;

    if (travel > maxTravel) {
      const k =
        maxTravel / travel;

      moveX *= k;
      moveY *= k;
    }

    for (
      let i = 0;
      i < fluid.numParticles;
      i++
    ) {
      const p = 2 * i;

      const px =
        fluid.particlePos[p];

      const py =
        fluid.particlePos[p + 1];

      const rx = px - pointer.x;
      const ry = py - pointer.y;

      const d2 =
        rx * rx + ry * ry;

      if (d2 >= radiusSq)
        continue;

      const d =
        Math.sqrt(
          Math.max(
            d2,
            0.000001
          )
        );

      /*
       * Soft radial kernel:
       * strong at fingertip,
       * fades to zero at edge.
       */
      const q =
        1 - d / interactionRadius;

      const influence =
        q * q;

      /*
       * PRIMARY tactile effect:
       * physically carry fluid with finger.
       */
      fluid.particlePos[p] +=
        moveX *
        influence *
        0.88;

      fluid.particlePos[p + 1] +=
        moveY *
        influence *
        0.88;

      /*
       * MOMENTUM:
       * faster swipes leave stronger wake.
       */
      fluid.particleVel[p] +=
        pointer.vx *
        influence *
        0.48;

      fluid.particleVel[p + 1] +=
        pointer.vy *
        influence *
        0.48;

      /*
       * Fingertip occupies space:
       * slight radial displacement gives
       * useful feedback even during slow
       * movement / near-stationary contact.
       */
      const push =
        influence * 0.018;

      fluid.particlePos[p] +=
        (rx / d) * push;

      fluid.particlePos[p + 1] +=
        (ry / d) * push;
    }

    /*
     * Displacement has now been consumed
     * by this physics tick.
     */
    pointer.dx = 0;
    pointer.dy = 0;

    /*
     * Momentum dies naturally after release
     * rather than remaining permanently.
     */
    pointer.vx *= 0.72;
    pointer.vy *= 0.72;
  }

  /*
   * Project any particles moved by the finger
   * back through the real circular boundary.
   */
  if (
    typeof fluid.handleCircularBoundary ===
    "function"
  ) {
    fluid.handleCircularBoundary();
  }
}

function render() {
  if (config.trail) {
    ctx.fillStyle =
      "rgba(0,0,0,0.32)";

    ctx.fillRect(
      0,
      0,
      window.innerWidth,
      window.innerHeight
    );
  } else {
    ctx.fillStyle = "#000";

    ctx.fillRect(
      0,
      0,
      window.innerWidth,
      window.innerHeight
    );
  }

  drawVessel();
  drawDebugGrid();
  drawParticles();
}

function smoothGravity() {
  /*
   * Enough filtering to remove MEMS chatter
   * without making the liquid feel detached.
   */
  const alpha = 0.13;

  gravity.x +=
    (
      gravity.targetX -
      gravity.x
    ) * alpha;

  gravity.y +=
    (
      gravity.targetY -
      gravity.y
    ) * alpha;
}

function stepPhysics() {
  smoothGravity();

  applyTouchField();

  fluid.simulate({
    dt: FIXED_DT,

    gravityX:
      gravity.x *
      config.gravityScale,

    gravityY:
      gravity.y *
      config.gravityScale,

    flipRatio:
      config.flipRatio,

    pressureIterations:
      config.pressureIterations,

    particleIterations:
      config.particleIterations,

    overRelaxation:
      config.overRelaxation,

    compensateDrift:
      config.compensateDrift,

    separateParticles:
      config.separateParticles,

    damping:
      config.damping
  });
}

function frame(now) {
  const elapsed =
    Math.min(
      (now - previousTime) / 1000,
      0.033
    );

  previousTime = now;

  if (running) {
    accumulator += elapsed;

    let steps = 0;

    while (
      accumulator >= FIXED_DT &&
      steps < MAX_STEPS
    ) {
      stepPhysics();

      accumulator -= FIXED_DT;

      steps++;
    }

    if (steps === MAX_STEPS)
      accumulator = 0;
  }

  render();

  fpsFrames++;

  if (now - fpsTime >= 1000) {
    fpsLabel.textContent =
      `${fpsFrames} FPS`;

    fpsFrames = 0;
    fpsTime = now;
  }

  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);

/* ─────────────────────────────────────────
   SENSOR INPUT
   ───────────────────────────────────────── */

function screenAngle() {
  if (
    screen.orientation &&
    Number.isFinite(
      screen.orientation.angle
    )
  ) {
    return screen.orientation.angle;
  }

  return (
    window.orientation || 0
  );
}

function rotateForScreen(x, y) {
  const angle =
    (
      (
        screenAngle() %
        360
      ) +
      360
    ) %
    360;

  if (angle === 90)
    return {
      x: -y,
      y: x
    };

  if (angle === 180)
    return {
      x: -x,
      y: -y
    };

  if (angle === 270)
    return {
      x: y,
      y: -x
    };

  return { x, y };
}

function handleOrientation(event) {
  if (
    event.beta == null ||
    event.gamma == null
  )
    return;

  const beta =
    event.beta *
    Math.PI /
    180;

  const gamma =
    event.gamma *
    Math.PI /
    180;

  /*
   * Projection of gravity into the
   * phone's display plane.
   *
   * Portrait upright:
   * beta ≈ 90° → downward.
   */

  let gx =
    Math.sin(gamma) * G;

  let gy =
    -Math.sin(beta) *
    Math.cos(gamma) *
    G;

  const rotated =
    rotateForScreen(
      gx,
      gy
    );

  gravity.targetX =
    rotated.x;

  gravity.targetY =
    rotated.y;

  gravity.sensorActive = true;

  sensorLabel.textContent =
    "SENSOR";
}

function handleMotion(event) {
  const a =
    event.acceleration;

  if (
    !a ||
    a.x == null ||
    a.y == null
  )
    return;

  /*
   * Small inertial coupling:
   * a physical shove of the phone
   * perturbs the liquid.
   *
   * Deliberately subtle for v0.1.
   */

  const rotated =
    rotateForScreen(
      -a.x,
      a.y
    );

  const impulseScale = 0.075;

  gravity.targetX +=
    rotated.x *
    impulseScale;

  gravity.targetY +=
    rotated.y *
    impulseScale;
}

async function requestSensorPermission() {
  let granted = false;

  try {
    if (
      typeof DeviceOrientationEvent !==
      "undefined"
    ) {
      if (
        typeof
        DeviceOrientationEvent
          .requestPermission ===
        "function"
      ) {
        const result =
          await DeviceOrientationEvent
            .requestPermission();

        granted =
          result === "granted";
      } else {
        granted = true;
      }
    }

    if (
      typeof DeviceMotionEvent !==
        "undefined" &&
      typeof
        DeviceMotionEvent
          .requestPermission ===
        "function"
    ) {
      const result =
        await DeviceMotionEvent
          .requestPermission();

      granted =
        granted ||
        result === "granted";
    }

  } catch (error) {
    console.warn(
      "Sensor permission:",
      error
    );
  }

  window.addEventListener(
    "deviceorientation",
    handleOrientation,
    true
  );

  window.addEventListener(
    "devicemotion",
    handleMotion,
    true
  );

  return granted;
}

/* ─────────────────────────────────────────
   DESKTOP GRAVITY EMULATOR
   ───────────────────────────────────────── */

function desktopGravityFromPointer(
  clientX,
  clientY
) {
  if (gravity.sensorActive)
    return;

  const dx =
    (
      clientX /
      window.innerWidth -
      0.5
    ) * 2;

  const dy =
    (
      clientY /
      window.innerHeight -
      0.5
    ) * 2;

  const len =
    Math.max(
      0.001,
      Math.hypot(dx, dy)
    );

  const scale =
    Math.min(1, len);

  gravity.targetX =
    dx / len *
    G *
    scale;

  gravity.targetY =
    -dy / len *
    G *
    scale;

  sensorLabel.textContent =
    "POINTER";
}

window.addEventListener(
  "pointermove",
  event => {
    if (
      event.pointerType === "mouse"
    ) {
      desktopGravityFromPointer(
        event.clientX,
        event.clientY
      );
    }
  }
);

window.addEventListener(
  "keydown",
  event => {
    if (gravity.sensorActive)
      return;

    const amount = G;

    switch (event.key) {
      case "ArrowLeft":
        gravity.targetX = -amount;
        gravity.targetY = 0;
        break;

      case "ArrowRight":
        gravity.targetX = amount;
        gravity.targetY = 0;
        break;

      case "ArrowUp":
        gravity.targetX = 0;
        gravity.targetY = amount;
        break;

      case "ArrowDown":
        gravity.targetX = 0;
        gravity.targetY = -amount;
        break;

      case " ":
        gravity.targetX = 0;
        gravity.targetY = -G;
        break;

      default:
        return;
    }

    event.preventDefault();

    sensorLabel.textContent =
      "KEYBOARD";
  }
);

/* ─────────────────────────────────────────
   UI
   ───────────────────────────────────────── */

async function initialise() {
  initButton.disabled = true;

  initButton.textContent =
    "INITIALISING";

  await requestSensorPermission();

  running = true;

  bootOverlay.classList.add(
    "hidden"
  );

  setTimeout(() => {
    bootOverlay.remove();
  }, 800);
}

initButton.addEventListener(
  "click",
  initialise
);

function setControls(open) {
  controls.classList.toggle(
    "open",
    open
  );

  controls.setAttribute(
    "aria-hidden",
    String(!open)
  );

  menuButton.setAttribute(
    "aria-expanded",
    String(open)
  );
}

menuButton.addEventListener(
  "click",
  () => {
    setControls(
      !controls.classList.contains(
        "open"
      )
    );
  }
);

closeControls.addEventListener(
  "click",
  () => setControls(false)
);

flipRatio.addEventListener(
  "input",
  () => {
    config.flipRatio =
      Number(flipRatio.value);

    flipOutput.textContent =
      config.flipRatio.toFixed(2);
  }
);


let particleCountScale = 1.00;

function applyParticleCountScale() {
  particleCountScale =
    Math.max(
      0.50,
      Math.min(
        2.00,
        Number(particleCount.value) || 1
      )
    );

  fluid =
    createFluidExperiment(
      particleCountScale
    );

  accumulator = 0;
  previousTime = performance.now();

  particleCountOutput.textContent =
    fluid.numParticles +
    " · " +
    particleCountScale.toFixed(2) +
    "×";
}

particleCount.addEventListener(
  "input",
  applyParticleCountScale
);

/*
 * Initialise readout from the real
 * particle population.
 */
particleCountOutput.textContent =
  fluid.numParticles + " · 1.00×";

gravityScale.addEventListener(
  "input",
  () => {
    config.gravityScale =
      Number(gravityScale.value);

    gravityOutput.textContent =
      `${config.gravityScale.toFixed(2)}G`;
  }
);

damping.addEventListener(
  "input",
  () => {
    config.damping =
      Number(damping.value);

    dampingOutput.textContent =
      config.damping.toFixed(4);
  }
);

driftToggle.addEventListener(
  "change",
  () => {
    config.compensateDrift =
      driftToggle.checked;
  }
);

separateToggle.addEventListener(
  "change",
  () => {
    config.separateParticles =
      separateToggle.checked;
  }
);

trailToggle.addEventListener(
  "change",
  () => {
    config.trail =
      trailToggle.checked;
  }
);

debugToggle.addEventListener(
  "change",
  () => {
    config.debug =
      debugToggle.checked;
  }
);

themeButtons.forEach(
  button => {
    button.addEventListener(
      "click",
      () => {
        const theme =
          button.dataset.theme;

        config.theme = theme;

        themeButtons.forEach(
          item =>
            item.classList.toggle(
              "active",
              item === button
            )
        );

        document.documentElement
          .style
          .setProperty(
            "--accent",
            theme === "phosphor"
              ? "#39ff88"
              : "#b864ff"
          );
      }
    );
  }
);

resetButton.addEventListener(
  "click",
  () => {
    fluid =
      createFluidExperiment(particleCountScale);

    gravity.targetX = 0;
    gravity.targetY = -G;

    gravity.x = 0;
    gravity.y = -G;

    accumulator = 0;
  }
);

fullscreenButton.addEventListener(
  "click",
  async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement
          .requestFullscreen?.();
      } else {
        await document
          .exitFullscreen?.();
      }
    } catch (error) {
      console.warn(
        "Fullscreen unavailable:",
        error
      );
    }
  }
);

/* ─────────────────────────────────────────
   PWA
   ───────────────────────────────────────── */

if (
  "serviceWorker" in navigator &&
  location.protocol !== "file:"
) {
  navigator.serviceWorker
    .register("./sw.js")
    .catch(error => {
      console.warn(
        "Service worker:",
        error
      );
    });
}
