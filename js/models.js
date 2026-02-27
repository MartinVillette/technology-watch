import * as THREE from 'three';

// ── Renderer ──────────────────────────────────────────────────────────────────
const canvas   = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearColor(0x000000);

const scene = new THREE.Scene();
// fog starts far away so background particles are visible
scene.fog = new THREE.Fog(0x000000, 120, 320);

const camera = new THREE.PerspectiveCamera(52, window.innerWidth / window.innerHeight, 0.1, 800);
// 3/4 elevated view — see depth clearly
const BASE_CAM  = new THREE.Vector3(-10, 28, 100);
const BASE_LOOK = new THREE.Vector3(0, 0, 0);
camera.position.copy(BASE_CAM);
camera.lookAt(BASE_LOOK);

// ── Circle sprite ─────────────────────────────────────────────────────────────
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

// ── Mouse / scroll ────────────────────────────────────────────────────────────
const mouse = new THREE.Vector2(0, 0);
const mouseLag = new THREE.Vector2(0, 0);
window.addEventListener('mousemove', e => {
    mouse.x =  (e.clientX / window.innerWidth  - 0.5) * 2;
    mouse.y = -(e.clientY / window.innerHeight - 0.5) * 2;
});
let scrollT = 0, targetT = 0;
window.addEventListener('scroll', () => {
    targetT = Math.min(1, window.scrollY / (document.body.scrollHeight - window.innerHeight));
}, { passive: true });

// ── Network — TRUE 3-D grid layout ────────────────────────────────────────────
// Each layer is a 2-D grid of nodes (rows × cols) spread on Y and Z axes.
// Layers are separated along the X axis (input on the left).
// This gives the network real VOLUME — wide, tall AND deep.

const LAYER_DEFS = [
    { cols: 2, rows: 2 },   // layer 0 — input   (left)
    { cols: 3, rows: 3 },   // layer 1
    { cols: 4, rows: 4 },   // layer 2 — hidden
    { cols: 4, rows: 4 },   // layer 3 — hidden
    { cols: 3, rows: 3 },   // layer 4
    { cols: 2, rows: 2 },   // layer 5 — output  (right)
];

const LAYER_X_GAP = 22;   // spacing between layers (left → right)
const NODE_Y_GAP  = 10;   // vertical spacing within a grid
const NODE_Z_GAP  = 10;   // depth spacing within a grid

const nodes = [];
LAYER_DEFS.forEach((def, li) => {
    const x = (li - (LAYER_DEFS.length - 1) / 2) * LAYER_X_GAP;
    for (let row = 0; row < def.rows; row++) {
    for (let col = 0; col < def.cols; col++) {
        const y = (row - (def.rows - 1) / 2) * NODE_Y_GAP;
        const z = (col - (def.cols - 1) / 2) * NODE_Z_GAP;
        nodes.push({
        layer: li, row, col,
        pos: new THREE.Vector3(x, y, z),
        brightness: 0,
        });
    }
    }
});

// Connect every node in layer L to every node in layer L+1
const edges = [];
for (let li = 0; li < LAYER_DEFS.length - 1; li++) {
    const A = nodes.filter(n => n.layer === li);
    const B = nodes.filter(n => n.layer === li + 1);
    A.forEach(na => B.forEach(nb =>
    edges.push({ a: nodes.indexOf(na), b: nodes.indexOf(nb) })
    ));
}

// ── Edge lines ────────────────────────────────────────────────────────────────
const ePosArr = new Float32Array(edges.length * 2 * 3);
const eColArr = new Float32Array(edges.length * 2 * 3).fill(0.06);
edges.forEach((e, i) => {
    const pa = nodes[e.a].pos, pb = nodes[e.b].pos;
    ePosArr[i*6]=pa.x;   ePosArr[i*6+1]=pa.y; ePosArr[i*6+2]=pa.z;
    ePosArr[i*6+3]=pb.x; ePosArr[i*6+4]=pb.y; ePosArr[i*6+5]=pb.z;
});
const eGeo = new THREE.BufferGeometry();
eGeo.setAttribute('position', new THREE.BufferAttribute(ePosArr, 3));
eGeo.setAttribute('color',    new THREE.BufferAttribute(eColArr, 3));
scene.add(new THREE.LineSegments(eGeo, new THREE.LineBasicMaterial({ vertexColors: true })));

// ── Nodes (core + glow + halo) ────────────────────────────────────────────────
const nPosArr = new Float32Array(nodes.length * 3);
const nColArr = new Float32Array(nodes.length * 3).fill(0.35);
nodes.forEach((nd, i) => {
    nPosArr[i*3]=nd.pos.x; nPosArr[i*3+1]=nd.pos.y; nPosArr[i*3+2]=nd.pos.z;
});
const nGeo = new THREE.BufferGeometry();
nGeo.setAttribute('position', new THREE.BufferAttribute(nPosArr, 3));
nGeo.setAttribute('color',    new THREE.BufferAttribute(nColArr, 3));
const nMat = (sz, op) => new THREE.PointsMaterial({
    size: sz, vertexColors: true, sizeAttenuation: true,
    map: TEX, transparent: true, opacity: op,
    alphaTest: 0.01, depthWrite: false,
});
scene.add(new THREE.Points(nGeo, nMat(2.5,  1.0)));
scene.add(new THREE.Points(nGeo, nMat(7.0,  0.18)));
scene.add(new THREE.Points(nGeo, nMat(16.0, 0.05)));

// ── Pulse pool ────────────────────────────────────────────────────────────────
const MAX_P   = 800;
const pPosArr = new Float32Array(MAX_P * 3);
const pColArr = new Float32Array(MAX_P * 3);
for (let i = 0; i < MAX_P; i++) pPosArr[i*3+2] = -9999;
const pool = Array.from({ length: MAX_P }, (_, i) => ({
    idx: i, active: false, edgeIdx: 0, t: 0, speed: 0,
}));
let pPtr = 0;
const pGeo = new THREE.BufferGeometry();
pGeo.setAttribute('position', new THREE.BufferAttribute(pPosArr, 3));
pGeo.setAttribute('color',    new THREE.BufferAttribute(pColArr, 3));
const pMat = (sz, op) => new THREE.PointsMaterial({
    size: sz, vertexColors: true, sizeAttenuation: true,
    map: TEX, transparent: true, opacity: op,
    alphaTest: 0.01, depthWrite: false,
});
scene.add(new THREE.Points(pGeo, pMat(1.6, 1.0)));
scene.add(new THREE.Points(pGeo, pMat(4.5, 0.25)));

function spawnPulse(edgeIdx, speed) {
    const p = pool[pPtr % MAX_P]; pPtr++;
    p.active = true; p.edgeIdx = edgeIdx; p.t = 0;
    p.speed  = speed ?? (0.009 + Math.random() * 0.013);
}
function updatePulses() {
    pool.forEach(p => {
    if (!p.active) { pPosArr[p.idx*3+2] = -9999; return; }
    p.t += p.speed;
    if (p.t >= 1) {
        p.active = false; pPosArr[p.idx*3+2] = -9999;
        activateNode(edges[p.edgeIdx].b, 0.9);
        propagateFrom(edges[p.edgeIdx].b, 0.65);
        return;
    }
    const { a, b } = edges[p.edgeIdx];
    const pa = nodes[a].pos, pb = nodes[b].pos;
    pPosArr[p.idx*3]   = pa.x + (pb.x - pa.x) * p.t;
    pPosArr[p.idx*3+1] = pa.y + (pb.y - pa.y) * p.t;
    pPosArr[p.idx*3+2] = pa.z + (pb.z - pa.z) * p.t;
    const br = Math.sin(p.t * Math.PI);
    pColArr[p.idx*3]=br; pColArr[p.idx*3+1]=br; pColArr[p.idx*3+2]=br;
    });
    pGeo.attributes.position.needsUpdate = true;
    pGeo.attributes.color.needsUpdate    = true;
}

// ── Activation ────────────────────────────────────────────────────────────────
function activateNode(idx, br) {
    nodes[idx].brightness = Math.min(1, nodes[idx].brightness + br);
}
function propagateFrom(nodeIdx, strength) {
    if (strength < 0.05) return;
    edges.map((e, i) => ({ e, i }))
    .filter(({ e }) => e.a === nodeIdx)
    .forEach(({ i }) => {
        setTimeout(() => {
        if (Math.random() < strength) spawnPulse(i);
        }, Math.random() * 180);
    });
}

// ── Mouse → closest node ──────────────────────────────────────────────────────
const _proj = new THREE.Vector3();
let lastNode = -1, mTimer = 0;
function handleMouse(dt) {
    mTimer += dt; if (mTimer < 0.05) return; mTimer = 0;
    let minD = Infinity, closest = -1;
    nodes.forEach((nd, i) => {
    _proj.copy(nd.pos).project(camera);
    const sx = ( _proj.x + 1) / 2 * window.innerWidth;
    const sy = (-_proj.y + 1) / 2 * window.innerHeight;
    const mx = ( mouse.x + 1) / 2 * window.innerWidth;
    const my = (-mouse.y + 1) / 2 * window.innerHeight;
    const d  = Math.hypot(sx - mx, sy - my);
    if (d < minD) { minD = d; closest = i; }
    });
    if (closest !== lastNode && minD < 120) {
    lastNode = closest;
    activateNode(closest, 1.0);
    propagateFrom(closest, 1.0);
    edges.map((e, i) => ({ e, i })).filter(({ e }) => e.b === closest)
        .forEach(({ i }) => { if (Math.random() < 0.5) spawnPulse(i, 0.012); });
    }
}

// ── Node / edge update ────────────────────────────────────────────────────────
function updateNodes(dt) {
    const t = performance.now() * 0.001;
    nodes.forEach((nd, i) => {
    nd.brightness *= (1 - dt * 2.2);
    const idle = 0.18 + 0.07 * Math.sin(t * 1.1 + i * 0.78);
    const br   = Math.max(idle, nd.brightness);
    nColArr[i*3]=br; nColArr[i*3+1]=br; nColArr[i*3+2]=br;
    });
    nGeo.attributes.color.needsUpdate = true;
}
function updateEdges() {
    const arr = eGeo.attributes.color.array;
    edges.forEach((e, i) => {
    const br = Math.max(0.045, nodes[e.a].brightness * 0.5, nodes[e.b].brightness * 0.5);
    arr[i*6]=br;   arr[i*6+1]=br;   arr[i*6+2]=br;
    arr[i*6+3]=br; arr[i*6+4]=br;   arr[i*6+5]=br;
    });
    eGeo.attributes.color.needsUpdate = true;
}

// ── Background particles — distributed in a SPHERE around the network ─────────
// Using additive blending so they glow properly against black

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
    // distribute in a sphere shell so they surround the NN from all sides
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
    bg1.pos[i*3]  += bg1.vel[i*3];
    bg1.pos[i*3+1]+= bg1.vel[i*3+1];
    bg1.pos[i*3+2]+= bg1.vel[i*3+2];
    const dx=bg1.pos[i*3], dy=bg1.pos[i*3+1], dz=bg1.pos[i*3+2];
    if (dx*dx+dy*dy+dz*dz > bg1.r*bg1.r) {
        bg1.vel[i*3]*=-1; bg1.vel[i*3+1]*=-1; bg1.vel[i*3+2]*=-1;
    }
    }
    for (let i = 0; i < BG2; i++) {
    bg2.pos[i*3]  += bg2.vel[i*3];
    bg2.pos[i*3+1]+= bg2.vel[i*3+1];
    bg2.pos[i*3+2]+= bg2.vel[i*3+2];
    const dx=bg2.pos[i*3], dy=bg2.pos[i*3+1], dz=bg2.pos[i*3+2];
    if (dx*dx+dy*dy+dz*dz > bg2.r*bg2.r) {
        bg2.vel[i*3]*=-1; bg2.vel[i*3+1]*=-1; bg2.vel[i*3+2]*=-1;
    }
    }
    bg1Geo.attributes.position.needsUpdate = true;
    bg2Geo.attributes.position.needsUpdate = true;
}

// ── Idle pulses ───────────────────────────────────────────────────────────────
let idleT = 0;
function idlePulses(dt) {
    idleT += dt;
    if (idleT > 0.5) {
    idleT = 0;
    const pool0 = edges.map((e, i) => ({ e, i })).filter(({ e }) => nodes[e.a].layer === 0);
    const pick  = pool0[Math.floor(Math.random() * pool0.length)];
    if (pick) { activateNode(pick.e.a, 0.6); spawnPulse(pick.i, 0.008); }
    }
}

// ── Camera ────────────────────────────────────────────────────────────────────
function updateCamera() {
    mouseLag.x += (mouse.x - mouseLag.x) * 0.04;
    mouseLag.y += (mouse.y - mouseLag.y) * 0.04;

    // full 180° horizontal orbit on scroll
    const angle  = scrollT * Math.PI;           // 0 → π as you scroll down
    const radius = 100 - scrollT * 55;
    const orbitX = Math.sin(angle) * radius;
    const orbitZ = Math.cos(angle) * radius;
    const orbitY = 28 + scrollT * 20;           // slowly rises as you scroll

    camera.position.lerp(new THREE.Vector3(
        orbitX + mouseLag.x * 2.0,
        orbitY + mouseLag.y * 1.4,
        orbitZ,
    ), 0.03);
    camera.lookAt(BASE_LOOK);
}

// ── Resize ────────────────────────────────────────────────────────────────────
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

window.addEventListener('scroll', () => {
    const maxScroll = document.body.scrollHeight - window.innerHeight;
    targetT = Math.min(1, Math.max(0, window.scrollY / maxScroll));
    if (targetT > 0.02) document.getElementById('hint').style.opacity = '0';
}, { passive: true });

// ── Loop ──────────────────────────────────────────────────────────────────────
let last = performance.now();
function animate(now) {
    requestAnimationFrame(animate);
    const dt = Math.min((now - last) / 1000, 0.05); last = now;
    scrollT += (targetT - scrollT) * 0.04;
    handleMouse(dt);
    idlePulses(dt);
    updatePulses();
    updateNodes(dt);
    updateEdges();
    updateBg();
    updateCamera();
    renderer.render(scene, camera);
}
animate(performance.now());