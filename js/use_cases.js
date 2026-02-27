import * as THREE from 'three';

// ── Renderer ──────────────────────────────────────────────────────────────
const canvas   = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearColor(0x000000);

const scene = new THREE.Scene();
scene.fog   = new THREE.Fog(0x000000, 180, 420);

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 800);
// start top-down, scroll tilts to isometric
camera.position.set(0, 160, 0.01);
camera.lookAt(0, 0, 0);

// ── Circle sprite ─────────────────────────────────────────────────────────
function makeCircleTex(size = 128) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d'), r = size / 2;
  const g = ctx.createRadialGradient(r, r, 0, r, r, r);
  g.addColorStop(0,    'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.85)');
  g.addColorStop(0.6,  'rgba(255,255,255,0.25)');
  g.addColorStop(1,    'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(r, r, r, 0, Math.PI * 2); ctx.fill();
  return new THREE.CanvasTexture(c);
}
const TEX = makeCircleTex();

const spriteMat = (sz, op, blend = THREE.AdditiveBlending) =>
  new THREE.PointsMaterial({
    size: sz, color: 0xffffff, sizeAttenuation: true,
    map: TEX, transparent: true, opacity: op,
    alphaTest: 0.005, depthWrite: false, blending: blend,
  });

// ── Scroll ────────────────────────────────────────────────────────────────
let scrollT = 0, targetT = 0;
window.addEventListener('scroll', () => {
  targetT = Math.min(1, window.scrollY / (document.body.scrollHeight - window.innerHeight));
}, { passive: true });

// ── Mouse ─────────────────────────────────────────────────────────────────
const mouse    = new THREE.Vector2(0, 0);
const mouseLag = new THREE.Vector2(0, 0);
window.addEventListener('mousemove', e => {
  mouse.x =  (e.clientX / window.innerWidth  - 0.5) * 2;
  mouse.y = -(e.clientY / window.innerHeight - 0.5) * 2;
});

// ── City grid definition ──────────────────────────────────────────────────
// Nodes on a grid + some diagonal connectors for variety
const GRID_COLS  = 11;
const GRID_ROWS  = 11;
const CELL_SIZE  = 18;
const GRID_W     = (GRID_COLS - 1) * CELL_SIZE;
const GRID_H     = (GRID_ROWS - 1) * CELL_SIZE;

// Build intersection nodes
const intersections = [];   // { pos: Vector3, brightness, flashT }
for (let r = 0; r < GRID_ROWS; r++) {
  for (let c = 0; c < GRID_COLS; c++) {
    intersections.push({
      pos: new THREE.Vector3(
        c * CELL_SIZE - GRID_W / 2,
        0,
        r * CELL_SIZE - GRID_H / 2,
      ),
      brightness: 0,
      flashT: 0,
    });
  }
}

function nodeIdx(r, c) { return r * GRID_COLS + c; }

// Road segments: { a, b, pts[] curve points for vehicles }
const roads = [];

function addRoad(iA, iB) {
  roads.push({ a: iA, b: iB });
}

// horizontal roads
for (let r = 0; r < GRID_ROWS; r++)
  for (let c = 0; c < GRID_COLS - 1; c++)
    addRoad(nodeIdx(r, c), nodeIdx(r, c + 1));

// vertical roads
for (let c = 0; c < GRID_COLS; c++)
  for (let r = 0; r < GRID_ROWS - 1; r++)
    addRoad(nodeIdx(r, c), nodeIdx(r + 1, c));

// a few diagonals for interest
const diags = [
  [0,0,2,2],[2,2,4,0],[4,0,6,2],[6,2,8,0],[8,0,10,2],
  [0,10,2,8],[2,8,4,10],[4,10,6,8],[6,8,8,10],[8,10,10,8],
  [0,5,2,3],[2,3,4,5],[4,5,6,3],[6,3,8,5],[8,5,10,3],
];
diags.forEach(([r1,c1,r2,c2]) => addRoad(nodeIdx(r1,c1), nodeIdx(r2,c2)));

// ── Road lines ────────────────────────────────────────────────────────────
const roadLinePosArr = new Float32Array(roads.length * 2 * 3);
const roadLineColArr = new Float32Array(roads.length * 2 * 3);
roads.forEach((rd, i) => {
  const pa = intersections[rd.a].pos;
  const pb = intersections[rd.b].pos;
  roadLinePosArr[i*6]  =pa.x; roadLinePosArr[i*6+1]=pa.y; roadLinePosArr[i*6+2]=pa.z;
  roadLinePosArr[i*6+3]=pb.x; roadLinePosArr[i*6+4]=pb.y; roadLinePosArr[i*6+5]=pb.z;
  // dim white base
  for (let k = 0; k < 6; k += 3) {
    roadLineColArr[i*6+k]=0.12; roadLineColArr[i*6+k+1]=0.14; roadLineColArr[i*6+k+2]=0.18;
  }
});
const roadLineGeo = new THREE.BufferGeometry();
roadLineGeo.setAttribute('position', new THREE.BufferAttribute(roadLinePosArr, 3));
roadLineGeo.setAttribute('color',    new THREE.BufferAttribute(roadLineColArr, 3));
scene.add(new THREE.LineSegments(roadLineGeo,
  new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.55 })
));

// ── Building footprints (filled grey squares inside each block) ───────────
const buildingMeshes = new THREE.Group();
for (let r = 0; r < GRID_ROWS - 1; r++) {
for (let c = 0; c < GRID_COLS - 1; c++) {
    // skip ~20% of blocks randomly to create variety
    if (Math.random() < 0.2) continue;

    const cx = (c + 0.5) * CELL_SIZE - GRID_W / 2;
    const cz = (r + 0.5) * CELL_SIZE - GRID_H / 2;

    // building size: 55–80% of cell, random per block
    const size  = CELL_SIZE * (0.55 + Math.random() * 0.25);
    const geo   = new THREE.PlaneGeometry(size, size);
    geo.rotateX(-Math.PI / 2);
    const mat   = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.05,
    side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(cx, 0.05, cz);
    buildingMeshes.add(mesh);

    // building outline (bright border)
    const half = size / 2;
    const pts  = [
    new THREE.Vector3(-half, 0, -half),
    new THREE.Vector3( half, 0, -half),
    new THREE.Vector3( half, 0,  half),
    new THREE.Vector3(-half, 0,  half),
    new THREE.Vector3(-half, 0, -half),
    ];
    const lineGeo = new THREE.BufferGeometry().setFromPoints(pts);
    const lineMat = new THREE.LineBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.2,
    });
    const outline = new THREE.Line(lineGeo, lineMat);
    outline.position.set(cx, 0.1, cz);
    buildingMeshes.add(outline);
}
}
scene.add(buildingMeshes);

// ── Intersection node points ───────────────────────────────────────────────
const intPosArr = new Float32Array(intersections.length * 3);
const intColArr = new Float32Array(intersections.length * 3);
intersections.forEach((nd, i) => {
  intPosArr[i*3]=nd.pos.x; intPosArr[i*3+1]=nd.pos.y; intPosArr[i*3+2]=nd.pos.z;
  intColArr[i*3]=0.3; intColArr[i*3+1]=0.3; intColArr[i*3+2]=0.3;
});
const intGeo = new THREE.BufferGeometry();
intGeo.setAttribute('position', new THREE.BufferAttribute(intPosArr, 3));
intGeo.setAttribute('color',    new THREE.BufferAttribute(intColArr, 3));
const intMat = (sz, op) => new THREE.PointsMaterial({
  size: sz, vertexColors: true, sizeAttenuation: true,
  map: TEX, transparent: true, opacity: op,
  alphaTest: 0.005, depthWrite: false, blending: THREE.AdditiveBlending,
});
scene.add(new THREE.Points(intGeo, intMat(1.2, 1.0)));
scene.add(new THREE.Points(intGeo, intMat(4.0, 0.18)));
scene.add(new THREE.Points(intGeo, intMat(9.0, 0.06)));

// ── Vehicles ──────────────────────────────────────────────────────────────
const NUM_VEHICLES = 220;
const vehicles = [];

function spawnVehicle() {
  const rdIdx = Math.floor(Math.random() * roads.length);
  const fwd   = Math.random() > 0.5;
  return {
    roadIdx: rdIdx,
    t: Math.random(),
    forward: fwd,
    speed: 0.0015 + Math.random() * 0.0025,
    pos: new THREE.Vector3(),
  };
}
for (let i = 0; i < NUM_VEHICLES; i++) vehicles.push(spawnVehicle());

// vehicle points (core + glow)
const vPosArr = new Float32Array(NUM_VEHICLES * 3);
const vColArr = new Float32Array(NUM_VEHICLES * 3).fill(1);
const vGeo = new THREE.BufferGeometry();
vGeo.setAttribute('position', new THREE.BufferAttribute(vPosArr, 3));
vGeo.setAttribute('color',    new THREE.BufferAttribute(vColArr, 3));
const vMat = (sz, op) => new THREE.PointsMaterial({
  size: sz, vertexColors: true, sizeAttenuation: true,
  map: TEX, transparent: true, opacity: op,
  alphaTest: 0.005, depthWrite: false, blending: THREE.AdditiveBlending,
});
scene.add(new THREE.Points(vGeo, vMat(0.7,  1.0)));
scene.add(new THREE.Points(vGeo, vMat(2.2,  0.22)));

// ── V2X flash pool ────────────────────────────────────────────────────────
const MAX_FLASH = 120;
const flashes   = Array.from({ length: MAX_FLASH }, (_, i) => ({
  idx: i, active: false, pos: new THREE.Vector3(), life: 0,
}));
let flashPtr = 0;
const flPosArr = new Float32Array(MAX_FLASH * 3);
const flColArr = new Float32Array(MAX_FLASH * 3);
for (let i = 0; i < MAX_FLASH; i++) flPosArr[i*3+1] = -9999;
const flGeo = new THREE.BufferGeometry();
flGeo.setAttribute('position', new THREE.BufferAttribute(flPosArr, 3));
flGeo.setAttribute('color',    new THREE.BufferAttribute(flColArr, 3));
scene.add(new THREE.Points(flGeo, new THREE.PointsMaterial({
  size: 6.0, vertexColors: true, sizeAttenuation: true,
  map: TEX, transparent: true, opacity: 0.55,
  alphaTest: 0.005, depthWrite: false, blending: THREE.AdditiveBlending,
})));
scene.add(new THREE.Points(flGeo, new THREE.PointsMaterial({
  size: 18.0, vertexColors: true, sizeAttenuation: true,
  map: TEX, transparent: true, opacity: 0.12,
  alphaTest: 0.005, depthWrite: false, blending: THREE.AdditiveBlending,
})));

function spawnFlash(pos) {
  const f = flashes[flashPtr % MAX_FLASH]; flashPtr++;
  f.active = true; f.pos.copy(pos); f.life = 1.0;
}

// ── Background dust ───────────────────────────────────────────────────────
const BG = 6000;
const bgPos = new Float32Array(BG * 3);
const bgVel = new Float32Array(BG * 3);
for (let i = 0; i < BG; i++) {
  const theta = Math.random() * Math.PI * 2;
  const phi   = Math.acos(2 * Math.random() - 1);
  const r     = 100 + Math.random() * 200;
  bgPos[i*3]   = r * Math.sin(phi) * Math.cos(theta);
  bgPos[i*3+1] = r * Math.sin(phi) * Math.sin(theta);
  bgPos[i*3+2] = r * Math.cos(phi);
  bgVel[i*3]   = (Math.random() - 0.5) * 0.025;
  bgVel[i*3+1] = (Math.random() - 0.5) * 0.008;
  bgVel[i*3+2] = (Math.random() - 0.5) * 0.025;
}
const bgGeo = new THREE.BufferGeometry();
bgGeo.setAttribute('position', new THREE.BufferAttribute(bgPos, 3));
scene.add(new THREE.Points(bgGeo, new THREE.PointsMaterial({
  size: 0.3, color: 0xffffff, sizeAttenuation: true,
  map: TEX, transparent: true, opacity: 0.28,
  alphaTest: 0.005, depthWrite: false, blending: THREE.AdditiveBlending,
})));

function updateBg() {
  for (let i = 0; i < BG; i++) {
    bgPos[i*3]   += bgVel[i*3];
    bgPos[i*3+1] += bgVel[i*3+1];
    bgPos[i*3+2] += bgVel[i*3+2];
    const dx=bgPos[i*3], dy=bgPos[i*3+1], dz=bgPos[i*3+2];
    const d2 = dx*dx+dy*dy+dz*dz;
    if (d2 > 300*300) {
      bgVel[i*3]*=-1; bgVel[i*3+1]*=-1; bgVel[i*3+2]*=-1;
    }
  }
  bgGeo.attributes.position.needsUpdate = true;
}

// ── Update intersections ──────────────────────────────────────────────────
function updateIntersections(dt) {
  const t = performance.now() * 0.001;
  intersections.forEach((nd, i) => {
    nd.flashT = Math.max(0, nd.flashT - dt * 3.5);
    nd.brightness *= (1 - dt * 2.8);
    const idle = 0.12 + 0.05 * Math.sin(t * 0.9 + i * 0.4);
    const br   = Math.max(idle, nd.brightness + nd.flashT);
    intColArr[i*3]=br; intColArr[i*3+1]=br; intColArr[i*3+2]=br;
  });
  intGeo.attributes.color.needsUpdate = true;
}

// ── Road line brightness from vehicle proximity ────────────────────────────
function updateRoadLines(dt) {
  const arr = roadLineGeo.attributes.color.array;
  // decay all roads
  for (let i = 0; i < roads.length; i++) {
    for (let k = 0; k < 6; k += 3) {
      arr[i*6+k]   = Math.max(0.10, arr[i*6+k]   * 0.97);
      arr[i*6+k+1] = Math.max(0.11, arr[i*6+k+1] * 0.97);
      arr[i*6+k+2] = Math.max(0.14, arr[i*6+k+2] * 0.97);
    }
  }
  // light up road of each active vehicle
  vehicles.forEach(v => {
    const i = v.roadIdx;
    const br = 0.55;
    for (let k = 0; k < 6; k += 3) {
      arr[i*6+k]   = Math.min(1, arr[i*6+k]   + br * 0.04);
      arr[i*6+k+1] = Math.min(1, arr[i*6+k+1] + br * 0.04);
      arr[i*6+k+2] = Math.min(1, arr[i*6+k+2] + br * 0.06);
    }
  });
  roadLineGeo.attributes.color.needsUpdate = true;
}

// ── Update vehicles ───────────────────────────────────────────────────────
const _tmp = new THREE.Vector3();
let v2xTimer = 0;

function updateVehicles(dt) {
  v2xTimer += dt;
  const checkV2X = v2xTimer > 0.08;
  if (checkV2X) v2xTimer = 0;

  vehicles.forEach((v, vi) => {
    v.t += v.speed * (v.forward ? 1 : -1);

    // arrived at end node → pick a new road from that intersection
    if (v.t >= 1 || v.t <= 0) {
      const endNode = v.t >= 1
        ? roads[v.roadIdx].b
        : roads[v.roadIdx].a;

      // find all roads connected to endNode
      const connected = roads
        .map((r, i) => ({ r, i }))
        .filter(({ r }) => r.a === endNode || r.b === endNode);
      if (connected.length > 0) {
        const pick = connected[Math.floor(Math.random() * connected.length)];
        v.roadIdx = pick.i;
        v.forward = pick.r.a === endNode;
        v.t       = v.forward ? 0 : 1;
      } else {
        v.t = v.forward ? 0 : 1;
        v.forward = !v.forward;
      }
      // pulse the intersection
      intersections[endNode].brightness += 0.7;
      intersections[endNode].flashT      = 0.5;
    }

    // interpolate position
    const rd = roads[v.roadIdx];
    const pa = intersections[rd.a].pos;
    const pb = intersections[rd.b].pos;
    v.pos.lerpVectors(pa, pb, Math.max(0, Math.min(1, v.t)));
    v.pos.y = 0.3;

    vPosArr[vi*3]   = v.pos.x;
    vPosArr[vi*3+1] = v.pos.y;
    vPosArr[vi*3+2] = v.pos.z;

    // V2X: check proximity to other vehicles
    if (checkV2X && vi % 3 === 0) {
      for (let vj = vi + 1; vj < vehicles.length; vj++) {
        const d = v.pos.distanceTo(vehicles[vj].pos);
        if (d < 6 && Math.random() < 0.35) {
          // midpoint flash
          _tmp.lerpVectors(v.pos, vehicles[vj].pos, 0.5);
          spawnFlash(_tmp);
          intersections[roads[v.roadIdx].a].brightness += 0.4;
          intersections[roads[v.roadIdx].b].brightness += 0.4;
        }
      }
    }
  });
  vGeo.attributes.position.needsUpdate = true;
}

// ── Update flashes ────────────────────────────────────────────────────────
function updateFlashes(dt) {
  flashes.forEach(f => {
    if (!f.active) { flPosArr[f.idx*3+1] = -9999; return; }
    f.life -= dt * 4.5;
    if (f.life <= 0) { f.active = false; flPosArr[f.idx*3+1] = -9999; return; }
    flPosArr[f.idx*3]   = f.pos.x;
    flPosArr[f.idx*3+1] = f.pos.y;
    flPosArr[f.idx*3+2] = f.pos.z;
    const br = f.life;
    flColArr[f.idx*3]=br; flColArr[f.idx*3+1]=br; flColArr[f.idx*3+2]=br;
  });
  flGeo.attributes.position.needsUpdate = true;
  flGeo.attributes.color.needsUpdate    = true;
}

// ── Camera: top-down → isometric → street level on scroll ────────────────
function updateCamera() {
// remove mouseLag entirely from this function
    const s = scrollT;
    let camY, camZ, camX;
    if (s < 0.4) {
        const k = s / 0.4;
        camY = THREE.MathUtils.lerp(160, 80, k);
        camZ = THREE.MathUtils.lerp(0.01, 80, k);
        camX = THREE.MathUtils.lerp(0, 15, k);
    } else {
        const k     = (s - 0.4) / 0.6;
        const angle = k * Math.PI * 1.2;
        const rad   = THREE.MathUtils.lerp(105, 48, k);
        camY = THREE.MathUtils.lerp(80, 35, k);
        camX = Math.sin(angle) * rad + 15;
        camZ = Math.cos(angle) * rad;
    }
    camera.position.lerp(new THREE.Vector3(camX, camY, camZ), 0.035);
    camera.lookAt(0, 0, 0);   // always fixed
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
let last = performance.now();
function animate(now) {
  requestAnimationFrame(animate);
  const dt = Math.min((now - last) / 1000, 0.05); last = now;
  scrollT += (targetT - scrollT) * 0.04;

  updateVehicles(dt);
  updateFlashes(dt);
  updateIntersections(dt);
  updateRoadLines(dt);
  updateBg();
  updateCamera();

  renderer.render(scene, camera);
}
animate(performance.now());