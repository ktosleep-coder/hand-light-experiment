const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const video = document.getElementById('video');
const statusEl = document.getElementById('status');
const toggleFeed = document.getElementById('toggle-feed');

const behaviorConfig = {
  orbCount: 32,
  baseSpeed: 0.12,
  baseSpread: 90,
  driftStrength: 0.35,
  colors: ['#7ee0ff', '#c185ff', '#7cf7c9', '#fff0a6'],
  glow: 0.8
};

const orbs = [];
let target = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
let lastHandTime = 0;
let hasCamera = false;
let detectRunning = false;
let hands;
const gestureState = { pinch: 0, openness: 0, fist: false };

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function resize() {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  canvas.style.width = `${window.innerWidth}px`;
  canvas.style.height = `${window.innerHeight}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function initOrbs() {
  orbs.length = 0;
  for (let i = 0; i < behaviorConfig.orbCount; i++) {
    orbs.push({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      vx: 0,
      vy: 0,
      size: 10 + Math.random() * 14,
      hue: behaviorConfig.colors[Math.floor(Math.random() * behaviorConfig.colors.length)],
      depth: 0.3 + Math.random() * 0.7,
      seed: Math.random() * Math.PI * 2
    });
  }
}

function updateGestures(hand) {
  const thumbTip = hand[4];
  const indexTip = hand[8];
  const pinkyMcp = hand[17];
  const indexMcp = hand[5];

  const pinchDist = Math.hypot(thumbTip.x - indexTip.x, thumbTip.y - indexTip.y);
  const span = Math.hypot(indexMcp.x - pinkyMcp.x, indexMcp.y - pinkyMcp.y);

  gestureState.pinch = clamp(1 - (pinchDist - 0.02) / 0.12, 0, 1);
  gestureState.openness = clamp((span - 0.12) / 0.22, 0, 1);
  gestureState.fist = span < 0.09 && pinchDist < 0.12;
}

function onResults(results) {
  if (!results.multiHandLandmarks || !results.multiHandLandmarks.length) {
    return;
  }
  const hand = results.multiHandLandmarks[0];
  const index = hand[8];
  const x = (1 - index.x) * canvas.width / (window.devicePixelRatio || 1);
  const y = index.y * canvas.height / (window.devicePixelRatio || 1);
  target = { x, y };
  lastHandTime = performance.now();
  updateGestures(hand);
  statusEl.textContent = 'Hand detected – guide the glow.';
}

function createHands() {
  hands = new Hands({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
  });
  hands.setOptions({
    maxNumHands: 1,
    modelComplexity: 1,
    minDetectionConfidence: 0.65,
    minTrackingConfidence: 0.6
  });
  hands.onResults(onResults);
}

async function startCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    statusEl.textContent = 'Camera not available. Using mouse control.';
    return;
  }
  try {
    statusEl.textContent = 'Requesting camera…';
    const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
    video.srcObject = stream;
    await video.play();
    hasCamera = true;
    statusEl.textContent = 'Camera on – move your hand to guide orbs.';
    processFrames();
  } catch (err) {
    statusEl.textContent = 'Camera denied. Use the mouse to move the light.';
  }
}

function processFrames() {
  if (!hasCamera) return;
  if (!detectRunning) {
    detectRunning = true;
    hands
      .send({ image: video })
      .catch(() => {})
      .finally(() => {
        detectRunning = false;
        requestAnimationFrame(processFrames);
      });
  } else {
    requestAnimationFrame(processFrames);
  }
}

function update(dt) {
  const t = performance.now() / 1000;
  const baseSpread = behaviorConfig.baseSpread * (1 + gestureState.openness * 0.6);
  const spread = baseSpread * (gestureState.fist ? 0.45 : 1);
  const speed = behaviorConfig.baseSpeed * (0.8 + gestureState.pinch * 0.9);
  const glowBoost = behaviorConfig.glow * (0.7 + gestureState.pinch * 0.6);

  for (const orb of orbs) {
    const angle = orb.seed * 6 + t * (0.4 + orb.depth * 0.3);
    const radius = spread * (0.4 + orb.depth * 0.8);
    const tx = target.x + Math.cos(angle) * radius;
    const ty = target.y + Math.sin(angle) * radius;

    orb.vx += (tx - orb.x) * speed * dt * 0.15;
    orb.vy += (ty - orb.y) * speed * dt * 0.15;

    // Gentle drift when idle
    const idle = clamp((performance.now() - lastHandTime) / 2000, 0, 1);
    const drift = behaviorConfig.driftStrength * (0.4 + idle * 0.9);
    orb.vx += (Math.sin(t + orb.seed * 10) * drift) * dt;
    orb.vy += (Math.cos(t * 0.8 + orb.seed * 12) * drift) * dt;

    orb.vx *= 0.92;
    orb.vy *= 0.92;
    orb.x += orb.vx * dt * 60;
    orb.y += orb.vy * dt * 60;

    // Wrap edges softly
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (orb.x < -50) orb.x = w + 50;
    if (orb.x > w + 50) orb.x = -50;
    if (orb.y < -50) orb.y = h + 50;
    if (orb.y > h + 50) orb.y = -50;

    orb.glow = glowBoost * (0.6 + Math.sin(t * 2 + orb.seed * 5) * 0.2 + gestureState.pinch * 0.3);
  }
}

function render() {
  ctx.fillStyle = 'rgba(5, 6, 15, 0.38)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.globalCompositeOperation = 'lighter';

  for (const orb of orbs) {
    const grad = ctx.createRadialGradient(orb.x, orb.y, 0, orb.x, orb.y, orb.size * (1 + orb.glow));
    grad.addColorStop(0, `${orb.hue}dd`);
    grad.addColorStop(1, '#00000000');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(orb.x, orb.y, orb.size * (1 + orb.glow * 0.8), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
}

let lastTime = performance.now();
function loop() {
  const now = performance.now();
  const dt = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;
  update(dt);
  render();
  requestAnimationFrame(loop);
}

window.addEventListener('mousemove', (e) => {
  target = { x: e.clientX, y: e.clientY };
  if (!hasCamera) {
    statusEl.textContent = 'Mouse control active.';
  }
});

toggleFeed.addEventListener('change', (e) => {
  document.body.classList.toggle('show-feed', e.target.checked);
});

window.addEventListener('resize', resize);

resize();
createHands();
initOrbs();
startCamera();
loop();
