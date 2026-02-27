import * as THREE from 'three';

// ── Renderer ──────────────────────────────────────────────────────────────
const canvas   = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearColor(0x000000);

const scene  = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 600);
camera.position.set(0, 0, 80);
camera.lookAt(0, 0, 0);

// ── Circle sprite ─────────────────────────────────────────────────────────
function makeCircleTex(size = 128) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d'), r = size / 2;
    const g = ctx.createRadialGradient(r, r, 0, r, r, r);
    g.addColorStop(0,    'rgba(255,255,255,1)');
    g.addColorStop(0.2,  'rgba(255,255,255,0.9)');
    g.addColorStop(0.6,  'rgba(255,255,255,0.25)');
    g.addColorStop(1,    'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(r, r, r, 0, Math.PI * 2); ctx.fill();
    return new THREE.CanvasTexture(c);
}
const TEX = makeCircleTex();

const mkMat = (sz, op) => new THREE.PointsMaterial({
    size: sz, color: 0xffffff, sizeAttenuation: true,
    map: TEX, transparent: true, opacity: op,
    alphaTest: 0.005, depthWrite: false,
    blending: THREE.AdditiveBlending,
});

// ── Mouse ─────────────────────────────────────────────────────────────────
const mouse    = new THREE.Vector2(0, 0);   // -1..1
const mousePx  = new THREE.Vector2(0, 0);   // pixels
const mouseLag = new THREE.Vector2(0, 0);
window.addEventListener('mousemove', e => {
    mouse.x   =  (e.clientX / window.innerWidth  - 0.5) * 2;
    mouse.y   = -(e.clientY / window.innerHeight - 0.5) * 2;
    mousePx.x = e.clientX;
    mousePx.y = e.clientY;
});

// ── Scroll ────────────────────────────────────────────────────────────────
let scrollT = 0, targetT = 0;
window.addEventListener('scroll', () => {
    targetT = Math.min(1, window.scrollY / (document.body.scrollHeight - window.innerHeight));
}, { passive: true });

// ── World bounds (in world units at z=0 for camera z=80, fov=60) ─────────
// half-height at z=0: tan(30°)*80 ≈ 46
const WORLD_H = 46;
const WORLD_W = WORLD_H * (window.innerWidth / window.innerHeight);

// ── Stream columns ────────────────────────────────────────────────────────
// Each column is a vertical lane of particles falling at different speeds.
// On scroll they pivot to flow horizontally.

const NUM_STREAMS  = 120;   // number of columns
const PER_STREAM   = 55;    // particles per column
const TOTAL        = NUM_STREAMS * PER_STREAM;

// per-particle data (not typed arrays — we keep JS objects for logic,
// then write into Float32Arrays each frame)
const particles = [];

// column definitions
const columns = Array.from({ length: NUM_STREAMS }, (_, ci) => {
    const x     = (Math.random() - 0.5) * WORLD_W * 2.2;
    const z     = (Math.random() - 0.5) * 60;         // depth spread
    const speed = 0.06 + Math.random() * 0.14;         // units / frame (60fps ref)
    const delay = Math.random() * WORLD_H * 2;
    return { x, z, speed, delay };
});

// initialise particles spread across the screen
for (let ci = 0; ci < NUM_STREAMS; ci++) {
    const col = columns[ci];
    for (let pi = 0; pi < PER_STREAM; pi++) {
    particles.push({
        col: ci,
        // initial Y staggered so screen is full from frame 0
        y:   WORLD_H  - (pi / PER_STREAM) * WORLD_H * 2.4 - col.delay * 0.1,
        baseX: col.x,
        z:   col.z,
        speed: col.speed * (0.7 + Math.random() * 0.6),
        size:  0.18 + Math.random() * 0.32,
        brightness: 0.3 + Math.random() * 0.7,
        phase: Math.random() * Math.PI * 2,   // for shimmer
    });
    }
}

// GPU buffers
const posArr = new Float32Array(TOTAL * 3);
const colArr = new Float32Array(TOTAL * 3);

const geo  = new THREE.BufferGeometry();
geo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
geo.setAttribute('color',    new THREE.BufferAttribute(colArr, 3));

// two layers: core dots + glow
const coreMat = new THREE.PointsMaterial({
    size: 0.35, vertexColors: true, sizeAttenuation: true,
    map: TEX, transparent: true, opacity: 1.0,
    alphaTest: 0.005, depthWrite: false, blending: THREE.AdditiveBlending,
});
const glowMat = new THREE.PointsMaterial({
    size: 1.1, vertexColors: true, sizeAttenuation: true,
    map: TEX, transparent: true, opacity: 0.18,
    alphaTest: 0.005, depthWrite: false, blending: THREE.AdditiveBlending,
});
scene.add(new THREE.Points(geo, coreMat));
scene.add(new THREE.Points(geo, glowMat));

// ── Background dust ───────────────────────────────────────────────────────
const BG = 4000;
const bgPos = new Float32Array(BG * 3);
const bgVel = new Float32Array(BG * 3);
for (let i = 0; i < BG; i++) {
    bgPos[i*3]   = (Math.random() - 0.5) * WORLD_W * 3;
    bgPos[i*3+1] = (Math.random() - 0.5) * WORLD_H * 3;
    bgPos[i*3+2] = (Math.random() - 0.5) * 120;
    bgVel[i*3]   = (Math.random() - 0.5) * 0.005;
    bgVel[i*3+1] = (Math.random() - 0.5) * 0.005;
    bgVel[i*3+2] = 0;
}
const bgGeo = new THREE.BufferGeometry();
bgGeo.setAttribute('position', new THREE.BufferAttribute(bgPos, 3));
scene.add(new THREE.Points(bgGeo, new THREE.PointsMaterial({
    size: 0.18, color: 0xffffff, sizeAttenuation: true,
    map: TEX, transparent: true, opacity: 0.12,
    alphaTest: 0.005, depthWrite: false, blending: THREE.AdditiveBlending,
})));

// ── "Processor core" — central attractor ring ─────────────────────────────
// Visible when scroll > 0.3: a bright ring at origin that particles funnel toward
const RING_N   = 280;
const ringPos  = new Float32Array(RING_N * 3);
const ringCol  = new Float32Array(RING_N * 3);
const ringBase = [];   // base angles
for (let i = 0; i < RING_N; i++) {
    const a = (i / RING_N) * Math.PI * 2;
    ringBase.push(a);
    ringPos[i*3]   = Math.cos(a) * 12;
    ringPos[i*3+1] = Math.sin(a) * 12;
    ringPos[i*3+2] = 0;
    ringCol[i*3]=0.9; ringCol[i*3+1]=0.9; ringCol[i*3+2]=0.9;
}
const ringGeo = new THREE.BufferGeometry();
ringGeo.setAttribute('position', new THREE.BufferAttribute(ringPos, 3));
ringGeo.setAttribute('color',    new THREE.BufferAttribute(ringCol, 3));
const ringPoints = new THREE.Points(ringGeo, new THREE.PointsMaterial({
    size: 0.5, vertexColors: true, sizeAttenuation: true,
    map: TEX, transparent: true, opacity: 0,
    alphaTest: 0.005, depthWrite: false, blending: THREE.AdditiveBlending,
}));
scene.add(ringPoints);

// inner pulse ring
const RING2_N  = 140;
const ring2Pos = new Float32Array(RING2_N * 3);
const ring2Col = new Float32Array(RING2_N * 3);
for (let i = 0; i < RING2_N; i++) {
    const a = (i / RING2_N) * Math.PI * 2;
    ring2Pos[i*3]   = Math.cos(a) * 5;
    ring2Pos[i*3+1] = Math.sin(a) * 5;
    ring2Pos[i*3+2] = 0;
    ring2Col[i*3]=1; ring2Col[i*3+1]=1; ring2Col[i*3+2]=1;
}
const ring2Geo = new THREE.BufferGeometry();
ring2Geo.setAttribute('position', new THREE.BufferAttribute(ring2Pos, 3));
ring2Geo.setAttribute('color',    new THREE.BufferAttribute(ring2Col, 3));
const ring2Points = new THREE.Points(ring2Geo, new THREE.PointsMaterial({
    size: 0.7, vertexColors: true, sizeAttenuation: true,
    map: TEX, transparent: true, opacity: 0,
    alphaTest: 0.005, depthWrite: false, blending: THREE.AdditiveBlending,
}));
scene.add(ring2Points);

// ── Mouse repulsion field ─────────────────────────────────────────────────
// Project mouse to world coords at z=0
const _raycaster = new THREE.Raycaster();
const _plane     = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
const _mWorld    = new THREE.Vector3();

function getMouseWorld() {
    _raycaster.setFromCamera(mouse, camera);
    _raycaster.ray.intersectPlane(_plane, _mWorld);
}

// ── Main update ───────────────────────────────────────────────────────────
let lastNow = performance.now();

function update(now) {
    const dt  = Math.min((now - lastNow) / 1000, 0.05); lastNow = now;
    const t   = performance.now() * 0.001;

    scrollT  += (targetT  - scrollT)  * 0.035;
    mouseLag.x += (mouse.x - mouseLag.x) * 0.06;
    mouseLag.y += (mouse.y - mouseLag.y) * 0.06;

    // 0 = vertical rain  →  1 = horizontal flow
    const s = scrollT;

    // gravity direction lerps from -Y (rain) to +X (pipeline)
    const gX = THREE.MathUtils.lerp(0,  1, s);
    const gY = THREE.MathUtils.lerp(-1, 0, s);

    getMouseWorld();
    const mx = _mWorld.x || 0;
    const my = _mWorld.y || 0;

    particles.forEach((p, idx) => {
    const col = columns[p.col];

    // ── acceleration ───────────────────────────────────────────────────
    // base gravity
    let ax = gX * col.speed * 60 * dt;
    let ay = gY * col.speed * 60 * dt;

    // mouse repulsion
    const dxM = p.baseX - mx;
    const dyM = p.y     - my;
    const dM  = Math.sqrt(dxM*dxM + dyM*dyM);
    const repulseR = 14;
    if (dM < repulseR && dM > 0.1) {
        const f = (1 - dM / repulseR) * 22;
        ax += (dxM / dM) * f * dt;
        ay += (dyM / dM) * f * dt;
    }

    // ── move ───────────────────────────────────────────────────────────
    p.baseX += ax;
    p.y     += ay;

    // ── wrap ───────────────────────────────────────────────────────────
    // vertical rain: wrap top→bottom
    if (s < 0.5) {
        if (p.y < -WORLD_H * 1.2) {
        p.y     = WORLD_H * 1.2;
        p.baseX = (Math.random() - 0.5) * WORLD_W * 2.2;
        }
    }
    // horizontal flow: wrap left→right
    if (s >= 0.5) {
        if (p.baseX > WORLD_W * 1.2) {
        p.baseX = -WORLD_W * 1.2;
        p.y     = (Math.random() - 0.5) * WORLD_H * 2.2;
        }
    }
    // keep in wide bounds either way
    if (Math.abs(p.baseX) > WORLD_W * 2)  p.baseX *= -0.8;
    if (Math.abs(p.y)     > WORLD_H * 2)  p.y     *= -0.8;

    // ── speed-based brightness ─────────────────────────────────────────
    const speed2 = ax*ax + ay*ay;
    const shimmer = 0.5 + 0.5 * Math.sin(t * 4 + p.phase);
    // centre glow: brighter when near origin
    const centreDist = Math.sqrt(p.baseX*p.baseX + p.y*p.y);
    const br = Math.min(1, p.brightness * shimmer + Math.sqrt(speed2) * 0.4);

    posArr[idx*3]   = p.baseX;
    posArr[idx*3+1] = p.y;
    posArr[idx*3+2] = p.z;
    colArr[idx*3]   = br;
    colArr[idx*3+1] = br;
    colArr[idx*3+2] = br;
    });

    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate    = true;

    // ── background dust slow drift ─────────────────────────────────────────
    for (let i = 0; i < BG; i++) {
    bgPos[i*3]   += bgVel[i*3]   + gX * 0.012;
    bgPos[i*3+1] += bgVel[i*3+1] + gY * 0.012;
    if (bgPos[i*3]   >  WORLD_W*2)  bgPos[i*3]   = -WORLD_W*2;
    if (bgPos[i*3]   < -WORLD_W*2)  bgPos[i*3]   =  WORLD_W*2;
    if (bgPos[i*3+1] >  WORLD_H*2)  bgPos[i*3+1] = -WORLD_H*2;
    if (bgPos[i*3+1] < -WORLD_H*2)  bgPos[i*3+1] =  WORLD_H*2;
    }
    bgGeo.attributes.position.needsUpdate = true;

    // ── processor ring ────────────────────────────────────────────────────
    const ringOpacity = THREE.MathUtils.smoothstep(s, 0.18, 0.55);
    ringPoints.material.opacity  = ringOpacity * 0.7;
    ring2Points.material.opacity = ringOpacity * 0.55;

    const pulse = 1 + 0.12 * Math.sin(t * 3.5);
    for (let i = 0; i < RING_N; i++) {
    const a = ringBase[i] + t * 0.25;
    const r = 12 * pulse;
    ringPos[i*3]   = Math.cos(a) * r;
    ringPos[i*3+1] = Math.sin(a) * r;
    }
    for (let i = 0; i < RING2_N; i++) {
    const a = (i / RING2_N) * Math.PI * 2 - t * 0.6;
    const r = 5 * (1 + 0.08 * Math.sin(t * 5 + i));
    ring2Pos[i*3]   = Math.cos(a) * r;
    ring2Pos[i*3+1] = Math.sin(a) * r;
    }
    ringGeo.attributes.position.needsUpdate  = true;
    ring2Geo.attributes.position.needsUpdate = true;

    // ── camera: subtle z push on scroll, tiny mouse drift ─────────────────
    const camZ   = THREE.MathUtils.lerp(80, 55, s);
    const camTilt= THREE.MathUtils.lerp(0, -8, s);
    camera.position.lerp(
    new THREE.Vector3(mouseLag.x * 3, mouseLag.y * 2 + camTilt, camZ),
    0.04
    );
    camera.lookAt(0, camTilt * 0.4, 0);
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

// ── Loop ─────────────────────────────────────────────────────────────────
function animate(now) {
    requestAnimationFrame(animate);
    update(now);
    renderer.render(scene, camera);
}
animate(performance.now());