import * as THREE from 'three';

// ── Renderer ──────────────────────────────────────────────────────────────
const canvas   = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearColor(0x000000);

const scene  = new THREE.Scene();
scene.fog    = new THREE.Fog(0x000000, 120, 320);

const camera = new THREE.PerspectiveCamera(52, window.innerWidth / window.innerHeight, 0.1, 800);
camera.position.set(-10, 28, 110);
camera.lookAt(0, 0, 0);

// ── Circle sprite (same as models.js) ────────────────────────────────────
function makeCircleTex(size = 128) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d'), r = size / 2;
  const g = ctx.createRadialGradient(r, r, 0, r, r, r);
  g.addColorStop(0,    'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.9)');
  g.addColorStop(0.6,  'rgba(255,255,255,0.3)');
  g.addColorStop(1,    'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(r, r, r, 0, Math.PI * 2); ctx.fill();
  return new THREE.CanvasTexture(c);
}
const TEX = makeCircleTex();

// ── Mouse / scroll ────────────────────────────────────────────────────────
const mouse    = new THREE.Vector2(0, 0);
const mouseLag = new THREE.Vector2(0, 0);
window.addEventListener('mousemove', e => {
  mouse.x =  (e.clientX / window.innerWidth  - 0.5) * 2;
  mouse.y = -(e.clientY / window.innerHeight - 0.5) * 2;
});
let scrollT = 0, targetT = 0;
window.addEventListener('scroll', () => {
  targetT = Math.min(1, window.scrollY /
    (document.body.scrollHeight - window.innerHeight));
}, { passive: true });

// ── Word texture factory ──────────────────────────────────────────────────
function makeWordTex(word, fontSize = 28) {
  const c   = document.createElement('canvas');
  const ctx = c.getContext('2d');
  ctx.font  = `${fontSize}px "Courier New", monospace`;
  const w   = Math.ceil(ctx.measureText(word).width) + 24;
  const h   = fontSize + 20;
  c.width   = w; c.height = h;
  ctx.clearRect(0, 0, w, h);
  ctx.font             = `${fontSize}px "Courier New", monospace`;
  ctx.fillStyle        = 'rgba(255,255,255,1)';
  ctx.textAlign        = 'center';
  ctx.textBaseline     = 'middle';
  ctx.fillText(word, w / 2, h / 2);
  return new THREE.CanvasTexture(c);
}

// ── Keywords ──────────────────────────────────────────────────────────────
const KEYWORDS = [
  { word: 'LLM',           size: 1.10, tier: 0 },
  { word: 'SLM',           size: 1.10, tier: 0 },
  { word: 'RSS',           size: 0.90, tier: 1 },
  { word: 'Groq',          size: 0.85, tier: 1 },
  { word: 'ADAS',          size: 1.00, tier: 0 },
  { word: 'V2X',           size: 1.00, tier: 0 },
  { word: 'Quantization',  size: 0.80, tier: 1 },
  { word: 'arXiv',         size: 0.75, tier: 2 },
  { word: 'Zotero',        size: 0.72, tier: 2 },
  { word: 'NVIDIA',        size: 0.95, tier: 1 },
  { word: 'Qualcomm',      size: 0.90, tier: 1 },
  { word: 'Llama',         size: 0.85, tier: 1 },
  { word: 'Mistral',       size: 0.85, tier: 1 },
  { word: 'TinyML',        size: 0.78, tier: 2 },
  { word: 'Edge AI',       size: 0.95, tier: 0 },
  { word: 'NPU',           size: 0.80, tier: 2 },
  { word: 'Distillation',  size: 0.75, tier: 2 },
  { word: 'RAG',           size: 0.80, tier: 2 },
  { word: 'Hallucination', size: 0.72, tier: 2 },
  { word: 'Cockpit',       size: 0.78, tier: 2 },
  { word: 'DRIVE Thor',    size: 0.82, tier: 1 },
  { word: 'Autopilot',     size: 0.80, tier: 2 },
  { word: 'OEM',           size: 0.78, tier: 2 },
  { word: 'INT8',          size: 0.75, tier: 2 },
  { word: 'Pruning',       size: 0.75, tier: 2 },
  { word: 'Physical AI',   size: 0.88, tier: 1 },
  { word: 'AI Factory',    size: 0.85, tier: 1 },
  { word: 'Green AI',      size: 0.78, tier: 2 },
  { word: 'Waymo',         size: 0.80, tier: 2 },
  { word: 'Omniverse',     size: 0.78, tier: 2 },
];

const N = KEYWORDS.length;
const RADIUS = 38;
const _q = new THREE.Quaternion();

// ── Place keywords on Fibonacci sphere ───────────────────────────────────
const wordData = KEYWORDS.map((kw, i) => {
  const phi   = Math.acos(1 - 2 * (i + 0.5) / N);
  const theta = Math.PI * (1 + Math.sqrt(5)) * i;
  const r     = RADIUS + (2 - kw.tier) * 4 + (Math.random() - 0.5) * 8;

  const x = r * Math.sin(phi) * Math.cos(theta);
  const y = r * Math.sin(phi) * Math.sin(theta);
  const z = r * Math.cos(phi);

  const axis  = new THREE.Vector3(
    Math.random() - 0.5,
    Math.random() - 0.5,
    Math.random() - 0.5,
  ).normalize();
  const omega = (0.08 + Math.random() * 0.10) * (Math.random() > 0.5 ? 1 : -1);

  const tex    = makeWordTex(kw.word, Math.round(22 + kw.size * 8));
  const mat    = new THREE.SpriteMaterial({
    map: tex, transparent: true, opacity: 0,
    depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const sprite = new THREE.Sprite(mat);
  const aspect = tex.image.width / tex.image.height;
  const sh     = kw.size * 5.5;
  sprite.scale.set(sh * aspect, sh, 1);
  sprite.position.set(x, y, z);
  scene.add(sprite);

  return {
    kw, sprite, mat,
    basePos: new THREE.Vector3(x, y, z),
    axis, omega,
    phase: Math.random() * Math.PI * 2,
  };
});

// ── Background particles — identical to models.js ─────────────────────────
const bgMat1 = new THREE.PointsMaterial({
  size: 0.28, color: 0xffffff, sizeAttenuation: true,
  map: TEX, transparent: true, opacity: 0.55,
  alphaTest: 0.005, depthWrite: false,
  blending: THREE.AdditiveBlending,
});
const bgMat2 = new THREE.PointsMaterial({
  size: 0.65, color: 0xffffff, sizeAttenuation: true,
  map: TEX, transparent: true, opacity: 0.18,
  alphaTest: 0.005, depthWrite: false,
  blending: THREE.AdditiveBlending,
});

const BG1 = 7000, BG2 = 1800;

function makeBgLayer(count, spread, velScale) {
  const pos = new Float32Array(count * 3);
  const vel = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi   = Math.acos(2 * Math.random() - 1);
    const r     = spread * (0.4 + 0.6 * Math.random());
    pos[i*3]   = r * Math.sin(phi) * Math.cos(theta);
    pos[i*3+1] = r * Math.sin(phi) * Math.sin(theta);
    pos[i*3+2] = r * Math.cos(phi);
    vel[i*3]   = (Math.random() - 0.5) * velScale;
    vel[i*3+1] = (Math.random() - 0.5) * velScale;
    vel[i*3+2] = (Math.random() - 0.5) * velScale;
  }
  return { pos, vel, r: spread };
}

const bg1 = makeBgLayer(BG1, 110, 0.008);
const bg2 = makeBgLayer(BG2, 160, 0.004);

const bg1Geo = new THREE.BufferGeometry();
bg1Geo.setAttribute('position', new THREE.BufferAttribute(bg1.pos, 3));
scene.add(new THREE.Points(bg1Geo, bgMat1));

const bg2Geo = new THREE.BufferGeometry();
bg2Geo.setAttribute('position', new THREE.BufferAttribute(bg2.pos, 3));
scene.add(new THREE.Points(bg2Geo, bgMat2));

function updateBg() {
  for (let i = 0; i < BG1; i++) {
    bg1.pos[i*3]   += bg1.vel[i*3];
    bg1.pos[i*3+1] += bg1.vel[i*3+1];
    bg1.pos[i*3+2] += bg1.vel[i*3+2];
    const dx = bg1.pos[i*3], dy = bg1.pos[i*3+1], dz = bg1.pos[i*3+2];
    if (dx*dx + dy*dy + dz*dz > bg1.r * bg1.r) {
      bg1.vel[i*3] *= -1; bg1.vel[i*3+1] *= -1; bg1.vel[i*3+2] *= -1;
    }
  }
  for (let i = 0; i < BG2; i++) {
    bg2.pos[i*3]   += bg2.vel[i*3];
    bg2.pos[i*3+1] += bg2.vel[i*3+1];
    bg2.pos[i*3+2] += bg2.vel[i*3+2];
    const dx = bg2.pos[i*3], dy = bg2.pos[i*3+1], dz = bg2.pos[i*3+2];
    if (dx*dx + dy*dy + dz*dz > bg2.r * bg2.r) {
      bg2.vel[i*3] *= -1; bg2.vel[i*3+1] *= -1; bg2.vel[i*3+2] *= -1;
    }
  }
  bg1Geo.attributes.position.needsUpdate = true;
  bg2Geo.attributes.position.needsUpdate = true;
}

// ── Convergence glow at origin ────────────────────────────────────────────
const coreGeo = new THREE.BufferGeometry();
coreGeo.setAttribute('position',
  new THREE.BufferAttribute(new Float32Array([0, 0, 0]), 3));
const coreMat1 = new THREE.PointsMaterial({
  size: 5.0, color: 0xffffff, sizeAttenuation: true,
  map: TEX, transparent: true, opacity: 0,
  alphaTest: 0.005, depthWrite: false, blending: THREE.AdditiveBlending,
});
const coreMat2 = new THREE.PointsMaterial({
  size: 20.0, color: 0xffffff, sizeAttenuation: true,
  map: TEX, transparent: true, opacity: 0,
  alphaTest: 0.005, depthWrite: false, blending: THREE.AdditiveBlending,
});
scene.add(new THREE.Points(coreGeo, coreMat1));
scene.add(new THREE.Points(coreGeo, coreMat2));

// ── Main loop ─────────────────────────────────────────────────────────────
let lastNow = performance.now();

function animate(now) {
  requestAnimationFrame(animate);
  const dt = Math.min((now - lastNow) / 1000, 0.05); lastNow = now;
  const t  = now * 0.001;

  scrollT    += (targetT  - scrollT)    * 0.035;
  mouseLag.x += (mouse.x  - mouseLag.x) * 0.04;
  mouseLag.y += (mouse.y  - mouseLag.y) * 0.04;

  // converge: 0 = orbiting, 1 = all at origin
  const conv = THREE.MathUtils.smoothstep(scrollT, 0.35, 0.85);

  // ── camera — same orbit logic as models.js ──────────────────────────
  const angle  = scrollT * Math.PI;
  const radius = THREE.MathUtils.lerp(110, 55, conv);
  const orbitX = Math.sin(angle) * radius;
  const orbitZ = Math.cos(angle) * radius;
  const orbitY = 28 + scrollT * 20;
  camera.position.lerp(new THREE.Vector3(
    orbitX + mouseLag.x * 2.0,
    orbitY + mouseLag.y * 1.4,
    orbitZ,
  ), 0.03);
  camera.lookAt(0, 0, 0);

  // ── word sprites ────────────────────────────────────────────────────
  wordData.forEach((wd, i) => {
    // individual orbit
    _q.setFromAxisAngle(wd.axis, wd.omega * dt);
    wd.basePos.applyQuaternion(_q);

    // breathing
    const breathe = 1 + 0.04 * Math.sin(t * 1.2 + wd.phase);

    // converge toward origin
    const tx = wd.basePos.x * (1 - conv);
    const ty = wd.basePos.y * (1 - conv);
    const tz = wd.basePos.z * (1 - conv);
    wd.sprite.position.set(tx, ty, tz);

    // scale
    const aspect = wd.mat.map.image.width / wd.mat.map.image.height;
    const sh     = wd.kw.size * 5.5 * breathe * (1 - conv * 0.7);
    wd.sprite.scale.set(sh * aspect, sh, 1);

    // fade in staggered, fade out on converge
    const fadeIn  = THREE.MathUtils.smoothstep(t, 0.5 + i * 0.06, 1.8 + i * 0.06);
    const fadeOut = 1 - conv * conv;
    wd.mat.opacity = fadeIn * fadeOut * (0.65 + 0.35 * Math.sin(t * 0.8 + wd.phase));
  });

  // ── background ──────────────────────────────────────────────────────
  updateBg();

  // ── core glow ────────────────────────────────────────────────────────
  coreMat1.opacity = conv * 0.90;
  coreMat2.opacity = conv * 0.22;

  renderer.render(scene, camera);
}

window.addEventListener('scroll', () => {
    const maxScroll = document.body.scrollHeight - window.innerHeight;
    targetT = Math.min(1, Math.max(0, window.scrollY / maxScroll));
    if (targetT > 0.02) document.getElementById('hint').style.opacity = '0';
}, { passive: true });

// ── Resize ────────────────────────────────────────────────────────────────
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

animate(performance.now());