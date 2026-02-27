import * as THREE from 'three';
import { GLTFLoader }         from 'three/addons/loaders/GLTFLoader.js';
import { MeshSurfaceSampler } from 'three/addons/math/MeshSurfaceSampler.js';

// ── Renderer ──────────────────────────────────────────────────────────────────
const canvas   = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearColor(0x000000);

const scene = new THREE.Scene();
scene.fog   = new THREE.FogExp2(0x000000, 0.018);
const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 600);

// ── Mouse ─────────────────────────────────────────────────────────────────────
const mouse    = new THREE.Vector2(0, 0);
const mouseLag = new THREE.Vector2(0, 0);
window.addEventListener('mousemove', (e) => {
    mouse.x =  (e.clientX / window.innerWidth  - 0.5) * 2;
    mouse.y = -(e.clientY / window.innerHeight - 0.5) * 2;
});

// ── Road spline ───────────────────────────────────────────────────────────────
const roadPoints = [
    new THREE.Vector3(  0,   0,    0),
    new THREE.Vector3( 10,   1,  -40),
    new THREE.Vector3( 30,   4,  -80),
    new THREE.Vector3( 20,   7, -120),
    new THREE.Vector3(-10,  10, -160),
    new THREE.Vector3(-35,  13, -195),
    new THREE.Vector3(-40,  17, -235),
    new THREE.Vector3(-20,  22, -275),
    new THREE.Vector3( 15,  26, -310),
    new THREE.Vector3( 40,  30, -345),
    new THREE.Vector3( 45,  35, -385),
    new THREE.Vector3( 20,  40, -425),
    new THREE.Vector3(-15,  44, -460),
    new THREE.Vector3(-40,  48, -495),
    new THREE.Vector3(-35,  52, -535),
    new THREE.Vector3(  0,  56, -570),
    new THREE.Vector3( 30,  60, -600),
];
const roadCurve = new THREE.CatmullRomCurve3(roadPoints, false, 'catmullrom', 0.5);

// ── Generic particle builder with rest positions ───────────────────────────────
function makeParticleGeo(positions, colors) {
    const rest = positions.slice(); // copy as rest
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    g.setAttribute('color',    new THREE.BufferAttribute(colors,    3));
    g.setAttribute('aRest',    new THREE.BufferAttribute(rest,      3));
    return g;
}

// ── Road particles ────────────────────────────────────────────────────────────
function buildRoadParticles() {
    const N = 12000, roadW = 5.5;
    const pos = new Float32Array(N * 3);
    const col = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
        const t    = i / N;
        const pt   = roadCurve.getPoint(t);
        const tan  = roadCurve.getTangent(t);
        const perp = new THREE.Vector3(-tan.z, 0, tan.x).normalize();
        const spread = (Math.random() - 0.5) * roadW;
        pos[i*3]   = pt.x + perp.x * spread;
        pos[i*3+1] = pt.y - 0.18 + (Math.random() - 0.5) * 0.25;
        pos[i*3+2] = pt.z + perp.z * spread;
        const centre = Math.abs(spread) < 0.3;
        const br = centre ? 0.55 : 0.18 + Math.random() * 0.12;
        col[i*3]=br*0.7; col[i*3+1]=br*0.7; col[i*3+2]=br*0.7;
    }
    const g = makeParticleGeo(pos, col);
    return new THREE.Points(g, new THREE.PointsMaterial({
        size: 0.18, vertexColors: true, sizeAttenuation: true, transparent: true, opacity: 0.7,
    }));
}

// ── Terrain ───────────────────────────────────────────────────────────────────
function buildTerrain() {
    const N = 60000;
    const pos = new Float32Array(N * 3);
    const col = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
        const t  = Math.random();
        const pt = roadCurve.getPoint(t);
        const rx = (Math.random() - 0.5) * 160;
        const rz = (Math.random() - 0.5) * 40;
        const x  = pt.x + rx;
        const z  = pt.z + rz;
        const bump = Math.sin(x*0.08)*8 + Math.cos(z*0.12)*6
                    + Math.sin(x*0.03+z*0.04)*15 + (Math.random()-0.5)*3;
        const y  = pt.y - 0.5 + bump * (Math.abs(rx) / 80);
        pos[i*3]=x; pos[i*3+1]=y; pos[i*3+2]=z;
        // grey gradient based on height
        const relH = Math.min(1, Math.max(0, (y - pt.y + 20) / 45));
        const gr = THREE.MathUtils.lerp(0.08, 0.55, relH);
        col[i*3]=gr; col[i*3+1]=gr; col[i*3+2]=gr;
    }
    const g = makeParticleGeo(pos, col);
    return new THREE.Points(g, new THREE.PointsMaterial({
        size: 0.22, vertexColors: true, sizeAttenuation: true, transparent: true, opacity: 0.65,
    }));
}

// ── Stars ─────────────────────────────────────────────────────────────────────
function buildStars() {
    const N = 3000;
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
    pos[i*3]  =(Math.random()-0.5)*600;
    pos[i*3+1]=Math.random()*200+20;
    pos[i*3+2]=(Math.random()-0.5)*600;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    return new THREE.Points(g, new THREE.PointsMaterial({
    size: 0.25, color: 0xffffff, sizeAttenuation: true, transparent: true, opacity: 0.6,
    }));
}

const roadPoints3D = buildRoadParticles();
const terrainPoints = buildTerrain();
scene.add(roadPoints3D);
scene.add(terrainPoints);
scene.add(buildStars());

// velocities for road + terrain repulsion
const roadVel    = new Float32Array(roadPoints3D.geometry.attributes.position.count * 3);
const terrainVel = new Float32Array(terrainPoints.geometry.attributes.position.count * 3);

// car particle velocity (allocated once model loads)
let carVel       = null;
let carBodyPoints = null;   // reference to the merged body Points

// ── Colour map ────────────────────────────────────────────────────────────────
const COLOR_MAP = {
    body: 0xffffff, glass: 0xccddff, window: 0xccddff, windshield: 0xccddff,
    wheel: 0x555555, tire: 0x444444, rim: 0xdddddd, light: 0xffffff,
    headlight: 0xffffff, interior: 0x888888, bumper: 0xeeeeee,
    hood: 0xffffff, roof: 0xffffff, door: 0xffffff, trunk: 0xffffff,
    chrome: 0xffffff, mirror: 0xeeeeee, default: 0xdddddd,
};

function getColor(name) {
    const l = (name || '').toLowerCase();
    for (const [k, v] of Object.entries(COLOR_MAP)) if (l.includes(k)) return v;
    return COLOR_MAP.default;
}

// ── Sample mesh ───────────────────────────────────────────────────────────────
function sampleMesh(mesh, n, hexColor) {
    const sampler = new MeshSurfaceSampler(mesh).build();
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const tmp = new THREE.Vector3();
    const nrm = new THREE.Vector3();
    const c   = new THREE.Color(hexColor);
    for (let i = 0; i < n; i++) {
    sampler.sample(tmp, nrm);
    const scatter = 0.04 + Math.random() * 0.10;
    tmp.addScaledVector(nrm, scatter);
    tmp.x += (Math.random() - 0.5) * 0.06;
    tmp.y += (Math.random() - 0.5) * 0.06;
    tmp.z += (Math.random() - 0.5) * 0.06;
    pos[i*3]=tmp.x; pos[i*3+1]=tmp.y; pos[i*3+2]=tmp.z;
    const br = 0.7 + Math.random() * 0.3;
    col[i*3]=c.r*br; col[i*3+1]=c.g*br; col[i*3+2]=c.b*br;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color',    new THREE.BufferAttribute(col, 3));
    return g;
}

function mergeGeos(geos) {
    let total = 0;
    for (const g of geos) total += g.attributes.position.count;
    const pos = new Float32Array(total * 3);
    const col = new Float32Array(total * 3);
    let off = 0;
    for (const g of geos) {
    pos.set(g.attributes.position.array, off * 3);
    col.set(g.attributes.color.array,    off * 3);
    off += g.attributes.position.count;
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.setAttribute('color',    new THREE.BufferAttribute(col, 3));
    return out;
}

// ── Car & wheel setup ─────────────────────────────────────────────────────────
const carPivot = new THREE.Object3D();
scene.add(carPivot);

// Wheel pivots: we create 4 invisible pivots at wheel positions,
// each holding a sampled particle Points. We rotate these every frame.
const wheelPivots = [];   // { pivot, isLeft }

new GLTFLoader().load('assets/objects/car.glb', (gltf) => {
    const root = gltf.scene;
    const box    = new THREE.Box3().setFromObject(root);
    const centre = box.getCenter(new THREE.Vector3());
    const size   = box.getSize(new THREE.Vector3());
    const sc     = 3.2 / Math.max(size.x, size.y, size.z);
    root.scale.setScalar(sc);
    root.position.set(-centre.x * sc, -box.min.y * sc, -centre.z * sc);

    // ── FIX 1: rotate 180° so car faces forward (−Z) ─────────────────────
    root.rotation.y = Math.PI;
    root.updateMatrixWorld(true);

    const bodyGeos  = [];

    root.traverse((child) => {
        if (!child.isMesh) return;
        child.updateMatrixWorld(true);

        const name     = (child.name || '').toLowerCase();
        const isWheel  = name.includes('wheel') || name.includes('tire')
                    || name.includes('tyre')  || name.includes('rim');

        const geo = child.geometry.clone().applyMatrix4(child.matrixWorld);
        if (!geo.attributes.normal) geo.computeVertexNormals();
        geo.computeBoundingBox();

        const d = geo.boundingBox.getSize(new THREE.Vector3()).length();
        const n = Math.max(200, Math.min(8000, Math.floor(d * 2500)));
        const sampledGeo = sampleMesh(
        new THREE.Mesh(geo, new THREE.MeshBasicMaterial()),
        n, getColor(child.name)
        );

        if (isWheel) {
        // ── Build a dedicated pivot at the wheel's bounding-box centre ────
        const wCentre = geo.boundingBox.getCenter(new THREE.Vector3());

        // Shift sampled positions so they're relative to wheel centre
        const pa = sampledGeo.attributes.position.array;
        for (let i = 0; i < pa.length; i += 3) {
            pa[i]   -= wCentre.x;
            pa[i+1] -= wCentre.y;
            pa[i+2] -= wCentre.z;
        }
        sampledGeo.attributes.position.needsUpdate = true;

        const pivot = new THREE.Object3D();
        pivot.position.copy(wCentre);

        const pts = new THREE.Points(sampledGeo, new THREE.PointsMaterial({
            size: 0.045, vertexColors: true,
            sizeAttenuation: true, transparent: true, opacity: 0.85,
        }));
        pivot.add(pts);
        carPivot.add(pivot);

        // Determine spin direction from X sign (left vs right wheel)
        wheelPivots.push({ pivot, flip: wCentre.x < 0 ? -1 : 1 });
        } else {
        bodyGeos.push(sampledGeo);
        }
    });

    // Merge body parts into one Points object
    if (bodyGeos.length > 0) {
        const bodyPoints = new THREE.Points(
        mergeGeos(bodyGeos),
        new THREE.PointsMaterial({
            size: 0.045, vertexColors: true,
            sizeAttenuation: true, transparent: true, opacity: 0.85,
        })
        );
        carPivot.add(bodyPoints);
        carBodyPoints = bodyPoints;   // ← keep reference
        // store rest positions on the merged geo
        const pa = bodyPoints.geometry.attributes.position.array;
        const restAttr = new THREE.BufferAttribute(pa.slice(), 3);
        bodyPoints.geometry.setAttribute('aRest', restAttr);
        carVel = new Float32Array(pa.length);
    }

    document.getElementById('hint').textContent = '↓ Scroll pour découvrir ↓';
    document.getElementById('hint').style.opacity = '1';
    },
    (xhr) => {
    if (xhr.total) {
        const pct = (xhr.loaded / xhr.total * 100).toFixed(0);
        document.getElementById('hint').textContent = `Chargement… ${pct}%`;
        document.getElementById('hint').style.opacity = '1';
    }
    },
    (err) => { console.error(err); }
);

// ── Scroll ────────────────────────────────────────────────────────────────────
let scrollT = 0, targetT = 0, lastT = 0;

window.addEventListener('scroll', () => {
    const maxScroll = document.body.scrollHeight - window.innerHeight;
    targetT = Math.min(1, Math.max(0, window.scrollY / maxScroll));
    if (targetT > 0.02) document.getElementById('hint').style.opacity = '0';
}, { passive: true });

// card observer
const observer = new IntersectionObserver(
    (entries) => entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('visible'); }),
    { threshold: 0.2 }
);
document.querySelectorAll('.card').forEach(c => observer.observe(c));

// ── Camera constants ──────────────────────────────────────────────────────────
const CAM_DISTANCE   = 9;
const CAM_ANGLE_DEG  = 40;
const CAM_HEIGHT     = 2.8;
const CAM_LOOK_AHEAD = 3;

const _up       = new THREE.Vector3(0, 1, 0);
const _carPos   = new THREE.Vector3();
const _carAhead = new THREE.Vector3();
const _camPos   = new THREE.Vector3();
const _mat      = new THREE.Matrix4();
const _quat     = new THREE.Quaternion();
let   swayAngle = 0;

// ── Mouse repulsion on road + terrain (world space) ───────────────────────────
const ROAD_REPULSE_RADIUS     = 8;
const ROAD_REPULSE_STRENGTH   = 1.2;
const ROAD_SPRING             = 0.10;
const ROAD_DAMPING            = 0.75;

const CAR_REPULSE_RADIUS      = 1.2;
const CAR_REPULSE_STRENGTH    = 0.25;
const CAR_SPRING              = 0.08;
const CAR_DAMPING             = 0.80;

// Project mouse onto the road plane at car position
const _raycaster = new THREE.Raycaster();
const _roadPlane = new THREE.Plane();
const _mouseWorld= new THREE.Vector3();

function repulsePoints(points, vel, radius, strength, spring, damping, useLocalSpace) {
    const geo     = points.geometry;
    const posArr  = geo.attributes.position.array;
    const restArr = geo.attributes.aRest.array;
    const n       = geo.attributes.position.count;

    _raycaster.setFromCamera(mouse, camera);

    let mx, my, mz;

    if (useLocalSpace) {
    // project mouse onto a plane facing the camera, at the car's world position
    const carWorldPos = new THREE.Vector3();
    carPivot.getWorldPosition(carWorldPos);
    const camDir = new THREE.Vector3();
    camera.getWorldDirection(camDir);
    _roadPlane.setFromNormalAndCoplanarPoint(camDir.negate(), carWorldPos);
    _raycaster.ray.intersectPlane(_roadPlane, _mouseWorld);
    if (!_mouseWorld) return;
    // transform into car-local space
    const invMat = new THREE.Matrix4().copy(carPivot.matrixWorld).invert();
    const localM = _mouseWorld.clone().applyMatrix4(invMat);
    mx = localM.x; my = localM.y; mz = localM.z;
    } else {
    // world space: horizontal plane at car height
    _roadPlane.setFromNormalAndCoplanarPoint(_up, _carPos);
    _raycaster.ray.intersectPlane(_roadPlane, _mouseWorld);
    if (!_mouseWorld) return;
    mx = _mouseWorld.x; my = _mouseWorld.y; mz = _mouseWorld.z;
    }

    for (let i = 0; i < n; i++) {
    const rx = restArr[i*3], ry = restArr[i*3+1], rz = restArr[i*3+2];
    const dx = rx - mx, dy = ry - my, dz = rz - mz;
    const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);

    let fx = 0, fy = 0, fz = 0;
    if (dist < radius && dist > 0.001) {
        const s = (1 - dist / radius) * strength;
        fx = (dx / dist) * s;
        fy = useLocalSpace ? (dy / dist) * s : (dy / dist) * s * 0.3;
        fz = (dz / dist) * s;
    }

    const tx = rx + fx, ty = ry + fy, tz = rz + fz;

    vel[i*3]   += (tx - posArr[i*3])   * spring;
    vel[i*3+1] += (ty - posArr[i*3+1]) * spring;
    vel[i*3+2] += (tz - posArr[i*3+2]) * spring;

    vel[i*3]   *= damping; vel[i*3+1] *= damping; vel[i*3+2] *= damping;

    posArr[i*3]   += vel[i*3];
    posArr[i*3+1] += vel[i*3+1];
    posArr[i*3+2] += vel[i*3+2];
    }
    geo.attributes.position.needsUpdate = true;
}

// ── Main update ───────────────────────────────────────────────────────────────
function updateScene(t) {
    const tCar = Math.min(t, 0.9999);
    roadCurve.getPoint(tCar, _carPos);
    roadCurve.getPoint(Math.min(tCar + 0.002, 0.9999), _carAhead);

    const forward = _carAhead.clone().sub(_carPos).normalize();
    const right   = new THREE.Vector3().crossVectors(forward, _up).normalize();

    // place & orient car
    _mat.lookAt(_carPos, _carAhead, _up);
    _quat.setFromRotationMatrix(_mat);
    carPivot.quaternion.copy(_quat);
    carPivot.position.copy(_carPos);

    // body lean
    swayAngle += (forward.x * 0.04 - swayAngle) * 0.06;
    carPivot.rotation.z = -swayAngle;

    // ── Wheel rotation ────────────────────────────────────────────────────────
    // distance travelled this frame → convert to radians
    const speed       = (t - lastT) * 620;          // approx world units
    const wheelRadius = 0.38;
    const deltaAngle  = speed / wheelRadius;
    lastT = t;

    wheelPivots.forEach(({ pivot, flip }) => {
    // wheels spin around their local X axis (axle)
    pivot.rotation.x += deltaAngle * flip;
    });

    // ── Camera ────────────────────────────────────────────────────────────────
    const angleRad = THREE.MathUtils.degToRad(CAM_ANGLE_DEG);
    const drift    = Math.sin(t * Math.PI * 3) * 0.05;
    const camDir   = new THREE.Vector3()
    .addScaledVector(forward, -Math.cos(angleRad))
    .addScaledVector(right,    Math.sin(angleRad) + drift)
    .normalize();

    mouseLag.x += (mouse.x - mouseLag.x) * 0.05;
    mouseLag.y += (mouse.y - mouseLag.y) * 0.05;

    _camPos
    .copy(_carPos)
    .addScaledVector(camDir, CAM_DISTANCE)
    .add(new THREE.Vector3(
        right.x * mouseLag.x * 0.4,
        CAM_HEIGHT + mouseLag.y * 0.3,
        right.z * mouseLag.x * 0.4
    ));

    camera.position.lerp(_camPos, 0.07);

    const lookTarget = _carPos.clone()
    .addScaledVector(forward, CAM_LOOK_AHEAD)
    .add(new THREE.Vector3(0, 0.6, 0));
    camera.lookAt(lookTarget);


    // ── Mouse repulsion on road & terrain ─────────────────────────────────────
    repulsePoints(roadPoints3D,  roadVel,    ROAD_REPULSE_RADIUS, ROAD_REPULSE_STRENGTH, ROAD_SPRING, ROAD_DAMPING, false);
    repulsePoints(terrainPoints, terrainVel, ROAD_REPULSE_RADIUS, ROAD_REPULSE_STRENGTH * 0.5, ROAD_SPRING, ROAD_DAMPING, false);

    // ── Mouse repulsion on car body ────────────────────────────────────────────
    if (carBodyPoints && carVel) {
    repulsePoints(carBodyPoints, carVel, CAR_REPULSE_RADIUS, CAR_REPULSE_STRENGTH, CAR_SPRING, CAR_DAMPING, true);
    }
}

// ── Resize ────────────────────────────────────────────────────────────────────
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// ── Render loop ───────────────────────────────────────────────────────────────
function animate() {
    requestAnimationFrame(animate);
    scrollT += (targetT - scrollT) * 0.06;
    updateScene(scrollT);
    renderer.render(scene, camera);
}
animate();