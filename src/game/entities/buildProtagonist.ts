import * as THREE from 'three';
import {
  createTwilightMaterial,
  type OutlineRegistry,
  type TwilightUniforms,
} from '../pipeline';

export interface ProtagonistUpdateParams {
  feetPos: THREE.Vector3;
  yaw: number;
  pitch: number;
  walkSpeed: number;
  isMoving: boolean;
  viewMode: 'first-person' | 'overview';
  hideAll?: boolean;
}

export interface ProtagonistRig {
  root: THREE.Group;
  headGroup: THREE.Group;
  bodyGroup: THREE.Group;
  leftHandGroup: THREE.Group;
  rightHandGroup: THREE.Group;
  triangleCount: number;
  setRenderPassMode: (mode: 'first-person' | 'overview' | 'mirror') => void;
  triggerHandReach: (strength?: number) => void;
  update: (dt: number, elapsed: number, params: ProtagonistUpdateParams) => void;
}

interface LoftStation {
  /** Center position of this cross-section ring */
  x: number;
  y: number;
  z: number;
  /** Half-width along X */
  rx: number;
  /** Half-depth along Z */
  rz: number;
  /** Optional angular shape deformation callback (theta in [0, 2*PI]) */
  mod?: (theta: number, out: [number, number]) => void;
  /** Optional tilt around X axis (radians) */
  tiltX?: number;
  /** Optional tilt around Z axis (radians) */
  tiltZ?: number;
}

/**
 * Generates a smooth, watertight, organic lofted BufferGeometry from cross-section stations.
 * Computes smooth seam-welded vertex normals so clothing, limbs, and fingers have zero boxy edges.
 */
function createOrganicLoft(
  stations: LoftStation[],
  radialSegs: number,
  capBottom = true,
  capTop = true
): THREE.BufferGeometry {
  const ringCount = stations.length;
  const stride = radialSegs + 1;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const modPair: [number, number] = [0, 0];

  for (let r = 0; r < ringCount; r++) {
    const st = stations[r];
    const v = r / Math.max(1, ringCount - 1);
    const cosTx = st.tiltX ? Math.cos(st.tiltX) : 1;
    const sinTx = st.tiltX ? Math.sin(st.tiltX) : 0;
    const cosTz = st.tiltZ ? Math.cos(st.tiltZ) : 1;
    const sinTz = st.tiltZ ? Math.sin(st.tiltZ) : 0;

    for (let s = 0; s <= radialSegs; s++) {
      const u = s / radialSegs;
      const theta = u * Math.PI * 2;
      let lx = Math.cos(theta) * st.rx;
      let lz = Math.sin(theta) * st.rz;
      let ly = 0;

      if (st.mod) {
        modPair[0] = lx;
        modPair[1] = lz;
        st.mod(theta, modPair);
        lx = modPair[0];
        lz = modPair[1];
      }

      // Apply optional cross-section tilt
      if (st.tiltX) {
        const ny = ly * cosTx - lz * sinTx;
        const nz = ly * sinTx + lz * cosTx;
        ly = ny;
        lz = nz;
      }
      if (st.tiltZ) {
        const nx = lx * cosTz - ly * sinTz;
        const ny = lx * sinTz + ly * cosTz;
        lx = nx;
        ly = ny;
      }

      positions.push(st.x + lx, st.y + ly, st.z + lz);
      uvs.push(u, v);
    }
  }

  for (let r = 0; r < ringCount - 1; r++) {
    for (let s = 0; s < radialSegs; s++) {
      const a = r * stride + s;
      const b = a + 1;
      const c = (r + 1) * stride + s;
      const d = c + 1;
      indices.push(a, c, b);
      indices.push(b, c, d);
    }
  }

  if (capBottom && ringCount > 0) {
    const first = stations[0];
    const centerIdx = positions.length / 3;
    positions.push(first.x, first.y, first.z);
    uvs.push(0.5, 0);
    for (let s = 0; s < radialSegs; s++) {
      indices.push(centerIdx, s, s + 1);
    }
  }

  if (capTop && ringCount > 0) {
    const last = stations[ringCount - 1];
    const baseRing = (ringCount - 1) * stride;
    const centerIdx = positions.length / 3;
    positions.push(last.x, last.y, last.z);
    uvs.push(0.5, 1);
    for (let s = 0; s < radialSegs; s++) {
      indices.push(centerIdx, baseRing + s + 1, baseRing + s);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();

  // Weld seam normals (s === 0 and s === radialSegs) so specular/cel shading wraps invisibly
  const norm = geo.attributes.normal;
  for (let r = 0; r < ringCount; r++) {
    const i0 = r * stride;
    const i1 = r * stride + radialSegs;
    const nx = norm.getX(i0) + norm.getX(i1);
    const ny = norm.getY(i0) + norm.getY(i1);
    const nz = norm.getZ(i0) + norm.getZ(i1);
    const inv = 1 / Math.max(1e-6, Math.hypot(nx, ny, nz));
    norm.setXYZ(i0, nx * inv, ny * inv, nz * inv);
    norm.setXYZ(i1, nx * inv, ny * inv, nz * inv);
  }
  norm.needsUpdate = true;
  return geo;
}

/**
 * Generates a smooth, organically tapered curved anime hair lock along a 3D CatmullRomCurve3.
 */
function createHairStrandGeometry(
  points: THREE.Vector3[],
  tubularSegs: number,
  radialSegs: number,
  baseWidth: number,
  baseThickness: number
): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(points);
  const frames = curve.computeFrenetFrames(tubularSegs, false);
  const stride = radialSegs + 1;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const p = new THREE.Vector3();

  for (let i = 0; i <= tubularSegs; i++) {
    const t = i / tubularSegs;
    curve.getPointAt(t, p);
    const N = frames.normals[i];
    const B = frames.binormals[i];
    // Smooth organic profile: full near root, graceful tapered tip
    const rootEase = Math.sin(Math.min(1, t * 4.5) * Math.PI * 0.5);
    const tipTaper = Math.pow(Math.max(0.02, 1 - t), 0.78);
    const w = baseWidth * (0.35 + 0.65 * rootEase) * tipTaper;
    const th = baseThickness * (0.4 + 0.6 * rootEase) * tipTaper;

    for (let j = 0; j <= radialSegs; j++) {
      const u = j / radialSegs;
      const phi = u * Math.PI * 2;
      const cx = Math.cos(phi) * w;
      const cy = Math.sin(phi) * th;
      positions.push(
        p.x + B.x * cx + N.x * cy,
        p.y + B.y * cx + N.y * cy,
        p.z + B.z * cx + N.z * cy
      );
      uvs.push(u, t);
    }
  }

  for (let i = 0; i < tubularSegs; i++) {
    for (let j = 0; j < radialSegs; j++) {
      const a = i * stride + j;
      const b = a + 1;
      const c = (i + 1) * stride + j;
      const d = c + 1;
      indices.push(a, c, b);
      indices.push(b, c, d);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Generates a high-resolution sculpted anime head geometry (~1,400 tris) with soft cheeks,
 * gentle V-line chin taper, subtle brow & nose contour, and natural cranial volume.
 */
function createSculptedAnimeHeadGeometry(): THREE.BufferGeometry {
  const geo = new THREE.SphereGeometry(0.108, 32, 22);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i);
    let y = pos.getY(i);
    let z = pos.getZ(i);

    const nx = x / 0.108;
    const ny = y / 0.108;
    const nz = z / 0.108; // Face points toward -Z!

    // Elongate head slightly vertically & narrow temples gently
    x *= 0.94;
    y *= 1.07;
    z *= 0.99;

    // Gentle cranial dome fullness at top-back (+Z, +Y)
    if (ny > 0.1) {
      const topW = Math.min(1, (ny - 0.1) / 0.9);
      x *= 1.0 + 0.04 * topW;
      if (nz > 0) {
        z *= 1.0 + 0.08 * topW * nz;
      }
    }

    // Taper lower jaw smoothly into a soft anime V-line chin (ny < 0)
    if (ny < 0.05) {
      const jawT = Math.min(1, (0.05 - ny) / 1.05);
      const jawPinch = Math.pow(jawT, 1.45);
      x *= 1.0 - 0.36 * jawPinch;
      // Pull chin gently forward (-Z) and downward for clean anime profile
      if (nz < 0) {
        z -= 0.011 * jawPinch * Math.max(0, -nz);
      } else {
        // Tuck underside of jaw cleanly toward neck
        z *= 1.0 - 0.22 * jawPinch;
      }
      y -= 0.008 * jawPinch * Math.max(0, -nz);
    }

    // Soft rounded cheeks on lower-mid front sides
    if (nz < -0.15 && ny < 0.1 && ny > -0.65) {
      const cheekY = Math.exp(-Math.pow((ny + 0.24) / 0.28, 2));
      const cheekX = Math.exp(-Math.pow((Math.abs(nx) - 0.56) / 0.34, 2));
      const cheekAmt = cheekY * cheekX * Math.max(0, -nz);
      x += Math.sign(x) * 0.0065 * cheekAmt;
      z -= 0.0045 * cheekAmt;
    }

    // Subtle brow & soft nose bridge contour (front face center)
    if (nz < -0.55) {
      const frontMask = Math.pow(Math.max(0, (-nz - 0.55) / 0.45), 1.3);
      // Slight gentle flattening across eye plane
      const eyeBand = Math.exp(-Math.pow((ny - 0.02) / 0.22, 2)) * Math.exp(-Math.pow((Math.abs(nx) - 0.34) / 0.22, 2));
      z += 0.0032 * eyeBand * frontMask;

      // Delicate anime nose bridge & tip
      const noseCenter = Math.exp(-Math.pow(nx / 0.14, 2));
      const noseProfile = Math.exp(-Math.pow((ny + 0.17) / 0.13, 2));
      z -= 0.0095 * noseCenter * noseProfile * frontMask;
    }

    pos.setXYZ(i, x, y, z);
  }
  geo.computeVertexNormals();
  return geo;
}

/**
 * Generates an anatomically sculpted palm loft transitioning seamlessly from an oval wrist
 * through fleshy thenar (thumb) & hypothenar (pinky) pads to a naturally arched knuckle ridge.
 * Local space: +Y wrist, -Y toward knuckles, +Z inner palm, -Z dorsal back, -side*X thumb side.
 */
function createSculptedPalmGeometry(side: -1 | 1): THREE.BufferGeometry {
  const stations: LoftStation[] = [
    // Deep wrist collar overlapping smoothly into the skin wrist-joint sphere (zero gap under flexion/pronation)
    { x: 0, y: 0.016, z: 0.0, rx: 0.0255, rz: 0.0235 },
    { x: 0, y: 0.005, z: 0.0, rx: 0.0275, rz: 0.0225 },
    // Wrist-palm transition
    { x: -side * 0.002, y: -0.008, z: 0.001, rx: 0.032, rz: 0.0205 },
    // Heel of hand (thenar pad swells on thumb side -side*X, palm +Z)
    {
      x: -side * 0.005,
      y: -0.024,
      z: 0.0015,
      rx: 0.039,
      rz: 0.0175,
      mod: (theta, out) => {
        const cosT = Math.cos(theta);
        const sinT = Math.sin(theta);
        // Fleshy thenar mound on thumb-side palm
        const thumbSide = Math.max(0, -side * cosT);
        const palmSide = Math.max(0, sinT);
        out[0] += -side * 0.0055 * thumbSide;
        out[1] += 0.0065 * thumbSide * palmSide;
      },
    },
    // Mid-palm with gentle inner palm cupping & wider thenar base
    {
      x: -side * 0.004,
      y: -0.044,
      z: 0.001,
      rx: 0.042,
      rz: 0.0155,
      mod: (theta, out) => {
        const cosT = Math.cos(theta);
        const sinT = Math.sin(theta);
        const thumbSide = Math.max(0, -side * cosT);
        const palmSide = Math.max(0, sinT);
        const centerCup = Math.max(0, 1 - Math.abs(cosT) * 1.4) * palmSide;
        out[0] += -side * 0.0045 * thumbSide;
        out[1] += 0.0048 * thumbSide * palmSide - 0.0032 * centerCup;
      },
    },
    // Upper palm widening toward metacarpal heads
    {
      x: -side * 0.001,
      y: -0.064,
      z: 0.0005,
      rx: 0.0415,
      rz: 0.0138,
      mod: (theta, out) => {
        const cosT = Math.cos(theta);
        const sinT = Math.sin(theta);
        // Slight anatomical transverse arch (dorsal center slightly convex, palm center slightly cupped)
        const arch = (1 - cosT * cosT) * 0.0022;
        out[1] -= arch * (sinT > 0 ? 0.9 : 1.1);
      },
    },
    // Knuckle ridge (MCP joints)
    {
      x: 0.0,
      y: -0.080,
      z: 0.0,
      rx: 0.0395,
      rz: 0.0122,
      mod: (theta, out) => {
        const cosT = Math.cos(theta);
        const sinT = Math.sin(theta);
        const arch = (1 - cosT * cosT) * 0.0025;
        out[1] -= arch * (sinT > 0 ? 0.8 : 1.15);
      },
    },
    // Rounded inter-digital web margin
    { x: 0.0, y: -0.087, z: 0.0, rx: 0.035, rz: 0.0082 },
  ];
  return createOrganicLoft(stations, 16, true, true);
}

/**
 * Generates a smooth, organically tapered finger phalanx loft (proximal or distal with rounded fingertip)
 * featuring subtle knuckle contours and anatomically flattened oval cross-sections.
 */
function createFingerSegmentGeometry(
  length: number,
  baseRad: number,
  tipRad: number,
  isTip: boolean
): THREE.BufferGeometry {
  const stations: LoftStation[] = [];
  if (!isTip) {
    // Proximal segment: soft knuckle base -> slightly slender shaft -> gentle PIP joint swell
    stations.push(
      { x: 0, y: baseRad * 0.35, z: 0, rx: baseRad * 0.82, rz: baseRad * 0.78 },
      { x: 0, y: 0, z: 0, rx: baseRad * 1.04, rz: baseRad * 0.96 },
      { x: 0, y: -length * 0.35, z: 0, rx: baseRad * 0.92, rz: baseRad * 0.88 },
      { x: 0, y: -length * 0.75, z: 0, rx: (baseRad + tipRad) * 0.46, rz: (baseRad + tipRad) * 0.44 },
      { x: 0, y: -length, z: 0, rx: tipRad * 1.04, rz: tipRad * 0.98 },
      { x: 0, y: -length - tipRad * 0.35, z: 0, rx: tipRad * 0.72, rz: tipRad * 0.68 }
    );
  } else {
    // Middle+Distal gracefully curved segment ending in a smooth rounded fingertip pad
    const curveZ = length * 0.08;
    stations.push(
      { x: 0, y: baseRad * 0.32, z: 0, rx: baseRad * 0.82, rz: baseRad * 0.78 },
      { x: 0, y: 0, z: 0, rx: baseRad * 1.02, rz: baseRad * 0.95 },
      { x: 0, y: -length * 0.42, z: curveZ * 0.4, rx: (baseRad * 0.58 + tipRad * 0.42), rz: (baseRad * 0.54 + tipRad * 0.40) },
      { x: 0, y: -length * 0.78, z: curveZ * 0.85, rx: tipRad * 1.05, rz: tipRad * 0.92 },
      { x: 0, y: -length * 0.94, z: curveZ, rx: tipRad * 0.82, rz: tipRad * 0.68 },
      { x: 0, y: -length * 1.04, z: curveZ * 1.05, rx: tipRad * 0.32, rz: tipRad * 0.28 }
    );
  }
  return createOrganicLoft(stations, 10, true, true);
}

/**
 * Builds a ~10,000-triangle smoothly sculpted MiSide-inspired anime protagonist character:
 * - Anatomically lofted pullover hoodie, draped hood, curved drawstrings & relaxed trousers
 * - High-resolution sculpted anime head with layered flowing curved hair strands
 * - Natural, gracefully sculpted 5-fingered hands (arched palm, fleshy thenar mound,
 *   opposable thumb + 4 organically contoured curved fingers on BOTH hands)
 */
export function createProtagonist(
  uniforms: TwilightUniforms,
  outlines: OutlineRegistry
): ProtagonistRig {
  const root = new THREE.Group();
  root.name = 'ProtagonistRig';

  const bodyGroup = new THREE.Group();
  bodyGroup.name = 'ProtagonistBody';
  root.add(bodyGroup);

  // Materials (matte hand-painted MiSide shader)
  const skinMat = createTwilightMaterial(uniforms, {
    color: 0xfadcc8,
    roughness: 0.86,
    metalness: 0.0,
    celStrength: 0.72,
    rimScale: 0.52,
  });
  const skinShadowMat = createTwilightMaterial(uniforms, {
    color: 0xf0cab4,
    roughness: 0.88,
    metalness: 0.0,
    celStrength: 0.70,
    rimScale: 0.42,
  });
  const hoodieMat = createTwilightMaterial(uniforms, {
    color: 0x2c2b36,
    roughness: 0.92,
    metalness: 0.0,
    celStrength: 0.68,
    rimScale: 0.58,
  });
  const hoodieRibMat = createTwilightMaterial(uniforms, {
    color: 0x22212c,
    roughness: 0.94,
    metalness: 0.0,
    celStrength: 0.64,
  });
  const drawstringMat = createTwilightMaterial(uniforms, {
    color: 0xe6dfd6,
    roughness: 0.88,
    metalness: 0.0,
    celStrength: 0.55,
  });
  const pantsMat = createTwilightMaterial(uniforms, {
    color: 0x31364a,
    roughness: 0.92,
    metalness: 0.0,
    celStrength: 0.66,
  });
  const sockMat = createTwilightMaterial(uniforms, {
    color: 0xe8e2dc,
    roughness: 0.92,
    metalness: 0.0,
    celStrength: 0.54,
  });
  const slipperMat = createTwilightMaterial(uniforms, {
    color: 0x4d455e,
    roughness: 0.90,
    metalness: 0.0,
    celStrength: 0.62,
  });
  const hairMat = createTwilightMaterial(uniforms, {
    color: 0x342422,
    roughness: 0.84,
    metalness: 0.0,
    celStrength: 0.74,
    rimScale: 0.82,
  });
  const eyeWhiteMat = createTwilightMaterial(uniforms, {
    color: 0xfcf8f6,
    roughness: 0.85,
    metalness: 0.0,
    celStrength: 0.35,
  });
  const irisMat = createTwilightMaterial(uniforms, {
    color: 0x5c3c28,
    roughness: 0.72,
    metalness: 0.0,
    celStrength: 0.45,
  });
  const pupilMat = createTwilightMaterial(uniforms, {
    color: 0x1b1314,
    roughness: 0.70,
    metalness: 0.0,
    celStrength: 0.30,
  });
  const mouthMat = createTwilightMaterial(uniforms, {
    color: 0xc98a7c,
    roughness: 0.88,
    metalness: 0.0,
    celStrength: 0.45,
  });

  // =========================================================================
  // 1. SCULPTED PELVIS & ARTICULATED RELAXED TROUSERS (HIP -> KNEE -> ANKLE)
  //    Every joint is overlapped with solid matching spheres so zero gaps show!
  // =========================================================================
  const pelvisGroup = new THREE.Group();
  pelvisGroup.name = 'ProtagonistPelvis';
  pelvisGroup.position.set(0, 0.82, 0);
  bodyGroup.add(pelvisGroup);

  const pelvisGeo = createOrganicLoft(
    [
      { x: 0, y: -0.095, z: 0.004, rx: 0.148, rz: 0.098 },
      { x: 0, y: -0.035, z: 0.005, rx: 0.170, rz: 0.110 },
      { x: 0, y: 0.030, z: 0.004, rx: 0.176, rz: 0.114 },
      { x: 0, y: 0.105, z: 0.0, rx: 0.168, rz: 0.108 },
    ],
    22,
    true,
    true
  );
  const pelvis = new THREE.Mesh(pelvisGeo, pantsMat);
  outlines.addOutline(pelvis, 1.014);
  pelvisGroup.add(pelvis);

  interface LegRig {
    hipPivot: THREE.Group;
    kneePivot: THREE.Group;
    anklePivot: THREE.Group;
  }

  const buildLeg = (side: -1 | 1): LegRig => {
    const hipPivot = new THREE.Group();
    hipPivot.position.set(side * 0.092, 0.0, 0);

    // Solid hip socket sphere preventing any pelvis/thigh gap at extreme strides
    const hipCap = new THREE.Mesh(new THREE.SphereGeometry(0.088, 14, 12), pantsMat);
    hipCap.scale.set(0.98, 1.04, 1.02);
    hipPivot.add(hipCap);

    // Upper trouser thigh loft overlapping both hip socket (+0.05) and knee pivot (-0.435)
    const thighGeo = createOrganicLoft(
      [
        { x: 0, y: 0.055, z: 0.002, rx: 0.085, rz: 0.087 },
        { x: 0, y: -0.045, z: 0.001, rx: 0.083, rz: 0.085 },
        { x: 0, y: -0.155, z: -0.002, rx: 0.077, rz: 0.079 },
        { x: 0, y: -0.275, z: -0.003, rx: 0.071, rz: 0.073 },
        { x: 0, y: -0.385, z: -0.004, rx: 0.066, rz: 0.068 },
        { x: 0, y: -0.438, z: -0.002, rx: 0.060, rz: 0.062 },
      ],
      18,
      true,
      true
    );
    const thighMesh = new THREE.Mesh(thighGeo, pantsMat);
    outlines.addOutline(thighMesh, 1.015);
    hipPivot.add(thighMesh);

    // Articulated Knee Pivot (world Y = 0.82 - 0.41 = 0.41)
    const kneePivot = new THREE.Group();
    kneePivot.position.set(0, -0.41, 0);
    hipPivot.add(kneePivot);

    // Solid overlapping knee joint sphere bridging thigh & calf cleanly at all flex angles
    const kneeCap = new THREE.Mesh(new THREE.SphereGeometry(0.065, 14, 12), pantsMat);
    kneeCap.scale.set(1.0, 1.06, 1.04);
    kneePivot.add(kneeCap);

    // Lower trouser calf loft overlapping above knee (+0.032) down to sealed ankle cuff (-0.325)
    const calfGeo = createOrganicLoft(
      [
        { x: 0, y: 0.032, z: -0.002, rx: 0.063, rz: 0.065 },
        {
          x: 0,
          y: -0.035,
          z: 0.0,
          rx: 0.064,
          rz: 0.066,
          mod: (t, o) => {
            o[1] += Math.sin(t * 2) * 0.0018;
          },
        },
        { x: 0, y: -0.135, z: 0.003, rx: 0.059, rz: 0.061 },
        { x: 0, y: -0.235, z: 0.003, rx: 0.054, rz: 0.056 },
        { x: 0, y: -0.312, z: 0.001, rx: 0.052, rz: 0.054 },
        { x: 0, y: -0.328, z: 0.0, rx: 0.048, rz: 0.050 },
      ],
      18,
      true,
      true
    );
    const calfMesh = new THREE.Mesh(calfGeo, pantsMat);
    outlines.addOutline(calfMesh, 1.015);
    kneePivot.add(calfMesh);

    // Soft sock upper ankle seated deep inside the closed trouser cuff (-0.275 .. -0.355)
    const sockUpperGeo = createOrganicLoft(
      [
        { x: 0, y: -0.275, z: 0, rx: 0.043, rz: 0.045 },
        { x: 0, y: -0.325, z: 0, rx: 0.039, rz: 0.041 },
        { x: 0, y: -0.358, z: -0.002, rx: 0.038, rz: 0.041 },
      ],
      14,
      true,
      true
    );
    kneePivot.add(new THREE.Mesh(sockUpperGeo, sockMat));

    // Articulated Ankle Pivot (world Y = 0.82 - 0.41 - 0.35 = 0.06)
    const anklePivot = new THREE.Group();
    anklePivot.position.set(0, -0.35, 0);
    kneePivot.add(anklePivot);

    // Solid sock ankle sphere bridging shin & slipper cleanly during heel-strike/toe-off
    const ankleCap = new THREE.Mesh(new THREE.SphereGeometry(0.039, 12, 10), sockMat);
    ankleCap.position.set(0, 0.002, -0.003);
    anklePivot.add(ankleCap);

    // Lower sock instep meeting slipper collar
    const sockLowerGeo = createOrganicLoft(
      [
        { x: 0, y: 0.008, z: -0.003, rx: 0.038, rz: 0.042 },
        { x: 0, y: -0.025, z: -0.010, rx: 0.039, rz: 0.048 },
        { x: 0, y: -0.045, z: -0.018, rx: 0.038, rz: 0.052 },
      ],
      14,
      true,
      true
    );
    anklePivot.add(new THREE.Mesh(sockLowerGeo, sockMat));

    // Rounded organic indoor slipper (sole rests at local y = -0.060 -> world Y = 0.000!)
    const slipperGeo = createOrganicLoft(
      [
        { x: 0, y: -0.060, z: -0.042, rx: 0.046, rz: 0.110 },
        { x: 0, y: -0.046, z: -0.046, rx: 0.049, rz: 0.118 },
        { x: 0, y: -0.024, z: -0.054, rx: 0.045, rz: 0.108 },
        { x: 0, y: -0.004, z: -0.064, rx: 0.036, rz: 0.082 },
        { x: 0, y: 0.006, z: -0.072, rx: 0.022, rz: 0.048 },
      ],
      16,
      true,
      true
    );
    const slipper = new THREE.Mesh(slipperGeo, slipperMat);
    outlines.addOutline(slipper, 1.018);
    anklePivot.add(slipper);

    pelvisGroup.add(hipPivot);
    return { hipPivot, kneePivot, anklePivot };
  };

  const leftLeg = buildLeg(-1);
  const rightLeg = buildLeg(1);

  // =========================================================================
  // 2. SCULPTED PULLOVER HOODIE TORSO, DRAPED HOOD & CURVED DRAWSTRINGS
  // =========================================================================
  const torsoGroup = new THREE.Group();
  torsoGroup.position.set(0, 0.06, 0);
  pelvisGroup.add(torsoGroup);

  // Anatomically lofted hoodie torso (smooth sloped shoulders, chest drape, waist curve, soft ribbed hem)
  const hoodieStations: LoftStation[] = [
    { x: 0, y: -0.015, z: 0.002, rx: 0.168, rz: 0.106 },
    { x: 0, y: 0.025, z: 0.002, rx: 0.174, rz: 0.110 },
    {
      x: 0,
      y: 0.085,
      z: 0.0,
      rx: 0.184,
      rz: 0.118,
      mod: (t, o) => {
        // Gentle fabric gather ripples above waistband
        const r = 1 + 0.018 * Math.sin(t * 5 + 0.4);
        o[0] *= r;
        o[1] *= r;
      },
    },
    { x: 0, y: 0.165, z: -0.002, rx: 0.179, rz: 0.115 },
    { x: 0, y: 0.255, z: -0.004, rx: 0.182, rz: 0.117 },
    {
      x: 0,
      y: 0.345,
      z: -0.005,
      rx: 0.194,
      rz: 0.122,
      mod: (t, o) => {
        // Soft natural pectoral & upper back contour
        const sinT = Math.sin(t);
        if (sinT < 0) o[1] *= 1.05;
      },
    },
    { x: 0, y: 0.435, z: -0.002, rx: 0.205, rz: 0.118 },
    { x: 0, y: 0.495, z: 0.002, rx: 0.195, rz: 0.106 },
    { x: 0, y: 0.535, z: 0.006, rx: 0.145, rz: 0.092 },
    { x: 0, y: 0.562, z: 0.008, rx: 0.086, rz: 0.078 },
  ];
  const hoodieTorso = new THREE.Mesh(
    createOrganicLoft(hoodieStations, 28, true, true),
    hoodieMat
  );
  outlines.addOutline(hoodieTorso, 1.014);
  torsoGroup.add(hoodieTorso);

  // Ribbed bottom hem band (closed top & bottom so looking down never exposes hollow edge)
  const hemGeo = createOrganicLoft(
    [
      { x: 0, y: -0.024, z: 0.002, rx: 0.172, rz: 0.110 },
      { x: 0, y: 0.016, z: 0.002, rx: 0.177, rz: 0.113 },
      { x: 0, y: 0.050, z: 0.002, rx: 0.179, rz: 0.114 },
    ],
    24,
    true,
    true
  );
  torsoGroup.add(new THREE.Mesh(hemGeo, hoodieRibMat));

  // Inner dark neck-opening cap so first-person downward view never sees inside torso mesh
  const neckSealCap = new THREE.Mesh(
    new THREE.SphereGeometry(0.082, 14, 10),
    hoodieRibMat
  );
  neckSealCap.scale.set(1.05, 0.42, 0.96);
  neckSealCap.position.set(0, 0.548, 0.007);
  torsoGroup.add(neckSealCap);

  // Soft contoured front kangaroo pocket (-Z)
  const pocketGeo = createOrganicLoft(
    [
      { x: 0, y: 0.068, z: -0.104, rx: 0.116, rz: 0.022 },
      { x: 0, y: 0.115, z: -0.112, rx: 0.118, rz: 0.025 },
      { x: 0, y: 0.175, z: -0.109, rx: 0.102, rz: 0.022 },
      { x: 0, y: 0.210, z: -0.102, rx: 0.084, rz: 0.014 },
    ],
    14,
    true,
    true
  );
  torsoGroup.add(new THREE.Mesh(pocketGeo, hoodieRibMat));

  // Draped collar & soft back hood behind neck (+Z)
  const collarRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.088, 0.028, 12, 24),
    hoodieMat
  );
  collarRing.rotation.x = Math.PI / 2 + 0.18;
  collarRing.position.set(0, 0.558, 0.012);
  torsoGroup.add(collarRing);

  const backHoodGeo = createOrganicLoft(
    [
      { x: 0, y: 0.455, z: 0.125, rx: 0.082, rz: 0.032 },
      { x: 0, y: 0.485, z: 0.145, rx: 0.112, rz: 0.052 },
      { x: 0, y: 0.530, z: 0.148, rx: 0.118, rz: 0.058 },
      { x: 0, y: 0.568, z: 0.115, rx: 0.104, rz: 0.048 },
      { x: 0, y: 0.578, z: 0.065, rx: 0.082, rz: 0.034 },
    ],
    18,
    true,
    true
  );
  const backHood = new THREE.Mesh(backHoodGeo, hoodieMat);
  outlines.addOutline(backHood, 1.016);
  torsoGroup.add(backHood);

  // Twin curved organic drawstrings resting over chest (-Z)
  for (const side of [-1, 1]) {
    const cordCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(side * 0.038, 0.535, -0.088),
      new THREE.Vector3(side * 0.046, 0.465, -0.118),
      new THREE.Vector3(side * 0.052, 0.385, -0.125),
      new THREE.Vector3(side * 0.049, 0.305, -0.121),
    ]);
    const cordMesh = new THREE.Mesh(
      new THREE.TubeGeometry(cordCurve, 12, 0.0042, 6, false),
      drawstringMat
    );
    torsoGroup.add(cordMesh);

    const aglet = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0052, 0.005, 0.018, 6),
      hoodieRibMat
    );
    aglet.position.set(side * 0.049, 0.296, -0.121);
    torsoGroup.add(aglet);
  }

  // Smooth sculpted neck loft
  const neckGeo = createOrganicLoft(
    [
      { x: 0, y: 0.535, z: 0.004, rx: 0.062, rz: 0.058 },
      { x: 0, y: 0.585, z: 0.002, rx: 0.050, rz: 0.049 },
      { x: 0, y: 0.635, z: 0.0, rx: 0.047, rz: 0.047 },
      { x: 0, y: 0.675, z: -0.002, rx: 0.050, rz: 0.048 },
    ],
    18,
    false,
    false
  );
  const neck = new THREE.Mesh(neckGeo, skinShadowMat);
  torsoGroup.add(neck);

  // =========================================================================
  // 3. HIGH-RESOLUTION SCULPTED ANIME HEAD & FLOWING LAYERED HAIR
  // =========================================================================
  const headGroup = new THREE.Group();
  headGroup.name = 'ProtagonistHead';
  headGroup.position.set(0, 0.652, 0);
  torsoGroup.add(headGroup);

  const headMesh = new THREE.Mesh(createSculptedAnimeHeadGeometry(), skinMat);
  headMesh.position.set(0, 0.106, 0);
  outlines.addOutline(headMesh, 1.016);
  headGroup.add(headMesh);

  // Soft sculpted ears
  for (const side of [-1, 1]) {
    const earGeo = createOrganicLoft(
      [
        { x: 0, y: -0.022, z: 0.002, rx: 0.007, rz: 0.011 },
        { x: side * 0.005, y: -0.008, z: 0.004, rx: 0.010, rz: 0.016 },
        { x: side * 0.006, y: 0.008, z: 0.003, rx: 0.011, rz: 0.018 },
        { x: side * 0.002, y: 0.024, z: 0.0, rx: 0.008, rz: 0.013 },
      ],
      10,
      true,
      true
    );
    const ear = new THREE.Mesh(earGeo, skinShadowMat);
    ear.position.set(side * 0.098, 0.096, 0.004);
    ear.rotation.y = side * -0.22;
    headGroup.add(ear);
  }

  // Clean stylized anime eyes (facing -Z), brows & gentle smile
  for (const side of [-1, 1]) {
    const eyeGroup = new THREE.Group();
    eyeGroup.position.set(side * 0.037, 0.098, -0.098);
    eyeGroup.rotation.y = side * -0.18;

    const sclera = new THREE.Mesh(
      new THREE.CircleGeometry(0.016, 16),
      eyeWhiteMat
    );
    sclera.scale.set(1.06, 0.72, 1);
    sclera.rotation.y = Math.PI;
    eyeGroup.add(sclera);

    const iris = new THREE.Mesh(new THREE.CircleGeometry(0.0105, 16), irisMat);
    iris.scale.set(0.92, 1.04, 1);
    iris.rotation.y = Math.PI;
    iris.position.set(0, -0.001, -0.0012);
    eyeGroup.add(iris);

    const pupil = new THREE.Mesh(new THREE.CircleGeometry(0.0052, 12), pupilMat);
    pupil.rotation.y = Math.PI;
    pupil.position.set(0, -0.001, -0.002);
    eyeGroup.add(pupil);

    const catchlight = new THREE.Mesh(new THREE.CircleGeometry(0.003, 8), eyeWhiteMat);
    catchlight.rotation.y = Math.PI;
    catchlight.position.set(-0.0038, 0.0038, -0.0028);
    eyeGroup.add(catchlight);

    // Curved upper lash arc
    const lashCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.017, 0.004, -0.0018),
      new THREE.Vector3(0.0, 0.0125, -0.0022),
      new THREE.Vector3(0.017, 0.005, -0.0018),
    ]);
    const lash = new THREE.Mesh(
      new THREE.TubeGeometry(lashCurve, 8, 0.0022, 5, false),
      pupilMat
    );
    eyeGroup.add(lash);

    // Gentle curved eyebrow
    const browCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.017, 0.023, -0.001),
      new THREE.Vector3(0.0, 0.027, -0.0015),
      new THREE.Vector3(0.017, 0.024, -0.001),
    ]);
    const brow = new THREE.Mesh(
      new THREE.TubeGeometry(browCurve, 6, 0.0018, 5, false),
      hairMat
    );
    eyeGroup.add(brow);

    headGroup.add(eyeGroup);
  }

  // Gentle curved smile
  const smileCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.014, 0.048, -0.097),
    new THREE.Vector3(0.0, 0.0435, -0.100),
    new THREE.Vector3(0.014, 0.048, -0.097),
  ]);
  headGroup.add(
    new THREE.Mesh(new THREE.TubeGeometry(smileCurve, 8, 0.0016, 5, false), mouthMat)
  );

  // Flowing Layered Dark-Brown Anime Hair (smooth sculpted dome + 14 curved tapered hair locks)
  const hairCapGeo = new THREE.SphereGeometry(0.118, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.68);
  {
    const hp = hairCapGeo.attributes.position;
    for (let i = 0; i < hp.count; i++) {
      const x = hp.getX(i);
      const y = hp.getY(i);
      const z = hp.getZ(i);
      const wave = 1 + 0.022 * Math.sin(Math.atan2(z, x) * 7);
      hp.setXYZ(i, x * 0.98 * wave, y * 1.06, z * 1.04 * wave);
    }
    hairCapGeo.computeVertexNormals();
  }
  const hairCap = new THREE.Mesh(hairCapGeo, hairMat);
  hairCap.position.set(0, 0.118, 0.010);
  outlines.addOutline(hairCap, 1.016);
  headGroup.add(hairCap);

  // Sculpted back hair cushion covering nape smoothly
  const backHairGeo = createOrganicLoft(
    [
      { x: 0, y: 0.005, z: 0.068, rx: 0.072, rz: 0.030 },
      { x: 0, y: 0.048, z: 0.088, rx: 0.098, rz: 0.045 },
      { x: 0, y: 0.105, z: 0.095, rx: 0.108, rz: 0.052 },
      { x: 0, y: 0.165, z: 0.072, rx: 0.096, rz: 0.046 },
    ],
    18,
    true,
    true
  );
  headGroup.add(new THREE.Mesh(backHairGeo, hairMat));

  // 14 curved tapered hair strands (front bangs, cheek-framing locks, back nape locks, crown tuft)
  const hairStrandSpecs: { pts: [number, number, number][]; w: number; th: number }[] = [
    // 5 sweeping front bangs
    { pts: [[-0.02, 0.215, -0.03], [-0.052, 0.185, -0.092], [-0.074, 0.135, -0.102], [-0.082, 0.092, -0.094]], w: 0.024, th: 0.010 },
    { pts: [[-0.01, 0.220, -0.035], [-0.028, 0.186, -0.104], [-0.038, 0.138, -0.112], [-0.044, 0.098, -0.106]], w: 0.025, th: 0.010 },
    { pts: [[0.002, 0.222, -0.035], [0.004, 0.188, -0.108], [-0.002, 0.142, -0.115], [-0.008, 0.102, -0.109]], w: 0.026, th: 0.011 },
    { pts: [[0.014, 0.218, -0.034], [0.034, 0.185, -0.103], [0.042, 0.138, -0.111], [0.034, 0.098, -0.105]], w: 0.025, th: 0.010 },
    { pts: [[0.025, 0.214, -0.028], [0.060, 0.182, -0.090], [0.080, 0.132, -0.098], [0.086, 0.088, -0.088]], w: 0.024, th: 0.010 },
    // 4 temple & cheek-framing side locks (2 left, 2 right)
    { pts: [[-0.065, 0.195, -0.015], [-0.102, 0.148, -0.045], [-0.112, 0.092, -0.048], [-0.096, 0.038, -0.038]], w: 0.024, th: 0.012 },
    { pts: [[-0.075, 0.185, 0.022], [-0.110, 0.135, 0.008], [-0.114, 0.078, -0.005], [-0.102, 0.028, -0.002]], w: 0.024, th: 0.012 },
    { pts: [[0.065, 0.195, -0.015], [0.102, 0.148, -0.045], [0.112, 0.092, -0.048], [0.096, 0.038, -0.038]], w: 0.024, th: 0.012 },
    { pts: [[0.075, 0.185, 0.022], [0.110, 0.135, 0.008], [0.114, 0.078, -0.005], [0.102, 0.028, -0.002]], w: 0.024, th: 0.012 },
    // 4 layered back nape locks
    { pts: [[-0.065, 0.165, 0.080], [-0.082, 0.102, 0.104], [-0.074, 0.038, 0.096], [-0.058, -0.008, 0.074]], w: 0.028, th: 0.014 },
    { pts: [[-0.022, 0.170, 0.095], [-0.026, 0.102, 0.120], [-0.022, 0.035, 0.110], [-0.018, -0.014, 0.084]], w: 0.030, th: 0.014 },
    { pts: [[0.022, 0.170, 0.095], [0.026, 0.102, 0.120], [0.022, 0.035, 0.110], [0.018, -0.014, 0.084]], w: 0.030, th: 0.014 },
    { pts: [[0.065, 0.165, 0.080], [0.082, 0.102, 0.104], [0.074, 0.038, 0.096], [0.058, -0.008, 0.074]], w: 0.028, th: 0.014 },
    // Crown anime tuft
    { pts: [[0.005, 0.228, 0.01], [0.018, 0.252, -0.018], [0.042, 0.256, -0.048], [0.062, 0.236, -0.068]], w: 0.015, th: 0.008 },
  ];
  for (const spec of hairStrandSpecs) {
    const pts = spec.pts.map(([x, y, z]) => new THREE.Vector3(x, y, z));
    const strand = new THREE.Mesh(createHairStrandGeometry(pts, 7, 6, spec.w, spec.th), hairMat);
    headGroup.add(strand);
  }

  // =========================================================================
  // 4. ORGANIC SCULPTED ARMS & ANATOMICAL 5-FINGERED HANDS (Left & Right!)
  // =========================================================================
  interface FingerJointRig {
    basePivot: THREE.Group;
    tipPivot: THREE.Group;
    restBaseCurl: number;
    restTipCurl: number;
    isThumb: boolean;
  }

  interface ArmRig {
    shoulderPivot: THREE.Group;
    forearmPivot: THREE.Group;
    handGroup: THREE.Group;
    fingers: FingerJointRig[];
  }

  const buildAnatomicalHand = (
    side: -1 | 1
  ): { handGroup: THREE.Group; fingers: FingerJointRig[] } => {
    // Hand local coordinates:
    //   +Y: wrist, -Y: toward fingertips
    //   +Z: inner palm face, -Z: back of hand (dorsal)
    //   -side * X: thumb/radial side, +side * X: pinky/ulnar side
    const handGroup = new THREE.Group();
    handGroup.name = side < 0 ? 'ProtagonistLeftHand' : 'ProtagonistRightHand';

    // Solid skin wrist-joint bridge sealing forearm-to-palm transition at all wrist angles
    const wristJointBridge = new THREE.Mesh(
      new THREE.SphereGeometry(0.0255, 12, 10),
      skinMat
    );
    wristJointBridge.scale.set(1.06, 0.88, 0.94);
    wristJointBridge.position.set(0, 0.004, 0);
    handGroup.add(wristJointBridge);

    const palmMesh = new THREE.Mesh(createSculptedPalmGeometry(side), skinMat);
    handGroup.add(palmMesh);

    const fingers: FingerJointRig[] = [];

    const addFinger = (
      name: string,
      attachX: number,
      attachY: number,
      attachZ: number,
      proxLen: number,
      distLen: number,
      baseRad: number,
      midRad: number,
      tipRad: number,
      splayZ: number,
      yawY: number,
      restBaseCurl: number,
      restTipCurl: number,
      isThumb = false
    ) => {
      const basePivot = new THREE.Group();
      basePivot.name = name;
      basePivot.position.set(attachX, attachY, attachZ);
      basePivot.rotation.set(restBaseCurl, yawY, splayZ, 'YXZ');

      // Solid MCP knuckle joint sphere sealing palm-to-finger hinge
      const mcpKnuckle = new THREE.Mesh(
        new THREE.SphereGeometry(baseRad * 1.02, 8, 8),
        skinMat
      );
      basePivot.add(mcpKnuckle);

      const proxMesh = new THREE.Mesh(
        createFingerSegmentGeometry(proxLen, baseRad, midRad, false),
        skinMat
      );
      basePivot.add(proxMesh);

      const tipPivot = new THREE.Group();
      tipPivot.position.set(0, -proxLen, 0);
      tipPivot.rotation.x = restTipCurl;

      // Solid PIP knuckle joint sphere sealing proximal-to-distal finger bend
      const pipKnuckle = new THREE.Mesh(
        new THREE.SphereGeometry(midRad * 1.0, 8, 8),
        skinMat
      );
      tipPivot.add(pipKnuckle);

      const distMesh = new THREE.Mesh(
        createFingerSegmentGeometry(distLen, midRad * 0.98, tipRad, true),
        skinMat
      );
      tipPivot.add(distMesh);

      basePivot.add(tipPivot);
      handGroup.add(basePivot);

      fingers.push({
        basePivot,
        tipPivot,
        restBaseCurl,
        restTipCurl,
        isThumb,
      });
    };

    // 1. OPPOSABLE THUMB (emerges smoothly from fleshy thenar mound, angled naturally forward +Z & inward toward palm)
    addFinger(
      'Thumb',
      -side * 0.036,
      -0.032,
      0.011,
      0.032,
      0.030,
      0.0112,
      0.0094,
      0.0076,
      -side * 0.44, // Gentle radial abduction (NOT sticking awkwardly straight sideways)
      side * 0.68,  // Natural palmar opposition twist so thumb pad faces index/middle fingers!
      -0.36,        // Forward reach in +Z palm direction
      -0.22,        // Subtle natural thumb bend
      true
    );

    // 2. INDEX FINGER (mounted on radial side of arched knuckle ridge, natural slight curl toward +Z palm)
    addFinger(
      'IndexFinger',
      -side * 0.0285,
      -0.081,
      0.001,
      0.036,
      0.038,
      0.0086,
      0.0074,
      0.0058,
      -side * 0.055,
      0.0,
      -0.18,
      -0.24
    );

    // 3. MIDDLE FINGER (highest point of anatomical knuckle arch, longest finger)
    addFinger(
      'MiddleFinger',
      -side * 0.009,
      -0.084,
      -0.001,
      0.041,
      0.042,
      0.0088,
      0.0076,
      0.0060,
      -side * 0.005,
      0.0,
      -0.22,
      -0.28
    );

    // 4. RING FINGER (stepping smoothly down the ulnar arch)
    addFinger(
      'RingFinger',
      side * 0.0105,
      -0.082,
      0.0,
      0.037,
      0.038,
      0.0082,
      0.0070,
      0.0055,
      side * 0.035,
      0.0,
      -0.27,
      -0.33
    );

    // 5. PINKY FINGER (lowest on knuckle arch, most gracefully curled in resting cascade)
    addFinger(
      'PinkyFinger',
      side * 0.028,
      -0.077,
      0.002,
      0.029,
      0.030,
      0.0070,
      0.0060,
      0.0046,
      side * 0.075,
      0.0,
      -0.33,
      -0.38
    );

    return { handGroup, fingers };
  };

  const buildArm = (side: -1 | 1): ArmRig => {
    const shoulderPivot = new THREE.Group();
    shoulderPivot.position.set(side * 0.198, 0.472, 0);

    // Solid overlapping deltoid shoulder dome seated cleanly into the hoodie torso socket (zero armpit/shoulder gap)
    const shoulderCap = new THREE.Mesh(new THREE.SphereGeometry(0.068, 16, 12), hoodieMat);
    shoulderCap.scale.set(1.04, 1.02, 1.0);
    shoulderCap.position.set(-side * 0.012, 0.008, 0);
    shoulderPivot.add(shoulderCap);

    // Sculpted upper sleeve overlapping deeply into torso shoulder (+0.055) and down past elbow (-0.295)
    const upperArmGeo = createOrganicLoft(
      [
        { x: -side * 0.036, y: 0.052, z: 0, rx: 0.058, rz: 0.060 },
        { x: -side * 0.008, y: 0.020, z: 0, rx: 0.065, rz: 0.063 },
        { x: 0, y: -0.025, z: 0, rx: 0.063, rz: 0.061 },
        { x: 0, y: -0.100, z: 0, rx: 0.057, rz: 0.056 },
        { x: 0, y: -0.185, z: 0.002, rx: 0.054, rz: 0.054 },
        { x: 0, y: -0.262, z: 0.002, rx: 0.052, rz: 0.052 },
        { x: 0, y: -0.295, z: 0.001, rx: 0.047, rz: 0.047 },
      ],
      16,
      true,
      true
    );
    const upperArm = new THREE.Mesh(upperArmGeo, hoodieMat);
    outlines.addOutline(upperArm, 1.015);
    shoulderPivot.add(upperArm);

    const forearmPivot = new THREE.Group();
    forearmPivot.position.set(0, -0.268, 0);
    shoulderPivot.add(forearmPivot);

    // Solid overlapping elbow joint sphere so flexing the arm up to 110° never reveals seam gaps
    const elbowCap = new THREE.Mesh(new THREE.SphereGeometry(0.051, 14, 12), hoodieMat);
    elbowCap.scale.set(1.0, 1.04, 1.02);
    forearmPivot.add(elbowCap);

    // Sculpted forearm sleeve starting above elbow (+0.032) with gentle blouson gather above ribbed cuff
    const forearmSleeveGeo = createOrganicLoft(
      [
        { x: 0, y: 0.032, z: 0, rx: 0.048, rz: 0.048 },
        { x: 0, y: -0.025, z: 0, rx: 0.051, rz: 0.051 },
        { x: 0, y: -0.090, z: 0, rx: 0.049, rz: 0.049 },
        { x: 0, y: -0.142, z: 0, rx: 0.051, rz: 0.050 },
        { x: 0, y: -0.165, z: 0, rx: 0.045, rz: 0.044 },
      ],
      16,
      true,
      true
    );
    const forearmSleeve = new THREE.Mesh(forearmSleeveGeo, hoodieMat);
    outlines.addOutline(forearmSleeve, 1.015);
    forearmPivot.add(forearmSleeve);

    // Closed solid ribbed sleeve cuff (capped top & bottom so looking down sleeve never reveals hollow interior)
    const cuffGeo = createOrganicLoft(
      [
        { x: 0, y: -0.152, z: 0, rx: 0.046, rz: 0.045 },
        { x: 0, y: -0.178, z: 0, rx: 0.042, rz: 0.041 },
        { x: 0, y: -0.200, z: 0, rx: 0.039, rz: 0.038 },
      ],
      14,
      true,
      true
    );
    forearmPivot.add(new THREE.Mesh(cuffGeo, hoodieRibMat));

    // Organic tapered lower forearm extending deeply up inside the sleeve cuff (-0.145 .. -0.268)
    // Cross-section transitions smoothly to circular at wrist joint (-0.258) so hand rotation never creates a step
    const wristGeo = createOrganicLoft(
      [
        { x: 0, y: -0.145, z: 0, rx: 0.038, rz: 0.037 },
        { x: 0, y: -0.195, z: 0, rx: 0.034, rz: 0.033 },
        { x: 0, y: -0.228, z: 0, rx: 0.029, rz: 0.028 },
        { x: 0, y: -0.256, z: 0, rx: 0.0255, rz: 0.025 },
        { x: 0, y: -0.268, z: 0, rx: 0.023, rz: 0.0225 },
      ],
      14,
      true,
      true
    );
    forearmPivot.add(new THREE.Mesh(wristGeo, skinMat));

    const { handGroup, fingers } = buildAnatomicalHand(side);
    handGroup.position.set(0, -0.258, 0);
    // CRITICAL SIGN: -side * (PI * 0.45) makes +Z inner palm face INWARD toward the body
    // and radial thumb (-side * X) point FORWARD (-Z), never everted outward!
    handGroup.rotation.y = -side * (Math.PI * 0.45);
    forearmPivot.add(handGroup);

    torsoGroup.add(shoulderPivot);
    return {
      shoulderPivot,
      forearmPivot,
      handGroup,
      fingers,
    };
  };

  const leftArm = buildArm(-1);
  const rightArm = buildArm(1);

  // Tally exact triangle count across the character geometry (excluding outline shells)
  let triangleCount = 0;
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.isMesh) {
      mesh.receiveShadow = true;
      mesh.castShadow = false;
      if (!mesh.name.endsWith('_outline')) {
        const g = mesh.geometry;
        if (g.index) {
          triangleCount += Math.floor(g.index.count / 3);
        } else if (g.attributes.position) {
          triangleCount += Math.floor(g.attributes.position.count / 3);
        }
      }
    }
  });

  // Animation state (zero per-frame GC allocations)
  let walkCycle = 0;
  let smoothMoveBlend = 0;
  let smoothSprintBlend = 0;
  let reachTimer = 0;
  let reachBlend = 0;
  let currentPassMode: 'first-person' | 'overview' | 'mirror' = 'first-person';

  const setRenderPassMode = (mode: 'first-person' | 'overview' | 'mirror') => {
    currentPassMode = mode;
    if (mode === 'first-person') {
      headGroup.visible = false;
      neck.visible = false;
      collarRing.visible = false;
      backHood.visible = false;
      // Offset body slightly behind eye vertical axis so looking down shows natural torso & legs without near-plane clipping
      bodyGroup.position.set(0, 0, 0.16);
    } else {
      headGroup.visible = true;
      neck.visible = true;
      collarRing.visible = true;
      backHood.visible = true;
      bodyGroup.position.set(0, 0, 0);
    }
  };

  setRenderPassMode('first-person');

  const triggerHandReach = (strength = 1.0) => {
    reachTimer = Math.max(reachTimer, 0.58 * Math.max(0.5, strength));
  };

  // Biomechanical multi-joint leg gait curve (hip swing, swing-phase knee lift + heel-strike cushion, ankle push/strike)
  const applyLegGait = (
    leg: LegRig,
    phase: number,
    moveBlend: number,
    sprintBlend: number,
    idleShift: number
  ) => {
    const sinP = Math.sin(phase);
    const sin2P = Math.sin(phase * 2.0);

    // Asymmetric natural stride: slightly longer forward reach (+), grounded backward push (-)
    const hipAmp = 0.42 + sprintBlend * 0.20;
    const rawHipX = (sinP * hipAmp + sin2P * 0.045) * (sinP >= 0 ? 1.06 : 0.90);
    const hipX = rawHipX * moveBlend;

    // Anatomical knee flexion is NEGATIVE rotation.x (calves bend backward +Z):
    // Peaks smoothly during swing phase to lift foot clear of floor + subtle cushion bend on heel-strike
    const swingPeak = Math.pow(Math.max(0, Math.cos(phase - 0.35)), 1.55);
    const impactCushion = Math.pow(Math.max(0, Math.sin(phase - 0.35)), 2.2) * 0.18;
    const kneeBend = (swingPeak * (0.62 + sprintBlend * 0.28) + impactCushion) * moveBlend;
    const kneeX = -(kneeBend + idleShift * 0.025);

    // Ankle pitch: positive dorsiflexion lifts toes for heel-strike & swing clearance; negative plantarflexion pushes off
    const heelStrikeLift = Math.max(0, Math.sin(phase - 0.15)) * 0.16;
    const toeOffPush = Math.max(0, -Math.sin(phase + 0.25)) * 0.26;
    const swingClearance = swingPeak * 0.10;
    const ankleX = (heelStrikeLift + swingClearance - toeOffPush) * moveBlend;

    leg.hipPivot.rotation.set(hipX, 0, 0);
    leg.kneePivot.rotation.set(kneeX, 0, 0);
    leg.anklePivot.rotation.set(ankleX, 0, 0);
  };

  const update = (dt: number, elapsed: number, params: ProtagonistUpdateParams) => {
    if (params.hideAll) {
      root.visible = false;
      return;
    }
    root.visible = true;

    root.position.copy(params.feetPos);
    root.rotation.set(0, params.yaw, 0);

    const targetMove = params.isMoving ? 1.0 : 0.0;
    const targetSprint =
      params.isMoving && params.walkSpeed > 3.5 ? 1.0 : 0.0;
    smoothMoveBlend = THREE.MathUtils.damp(smoothMoveBlend, targetMove, 8.5, dt);
    smoothSprintBlend = THREE.MathUtils.damp(smoothSprintBlend, targetSprint, 6.5, dt);

    if (params.isMoving) {
      // Natural cadence proportional to movement speed (avoids frantic choppy steps)
      const cadence = 2.45 * params.walkSpeed;
      walkCycle += dt * cadence;
    } else if (smoothMoveBlend > 0.004) {
      // Gently glide stride phase toward nearest neutral standing plant (multiple of PI) while decelerating
      const nearestPlant = Math.round(walkCycle / Math.PI) * Math.PI;
      walkCycle = THREE.MathUtils.damp(walkCycle, nearestPlant, 7.0, dt);
    }

    const move = smoothMoveBlend;
    const sprint = smoothSprintBlend;
    const strideSin = Math.sin(walkCycle) * move;
    const strideCos = Math.cos(walkCycle) * move;

    // Double-frequency vertical center-of-mass bob (rises at mid-stance, dips softly at double-support)
    const verticalBob = -Math.cos(walkCycle * 2.0) * (0.020 + sprint * 0.014) * move;
    // Gentle lateral weight transfer over the planted stance foot
    const hipSwayX = -strideSin * (0.015 + sprint * 0.006);
    const idleBreath = Math.sin(elapsed * 1.85);
    const breathLift = idleBreath * 0.0048;

    // Pelvis motion (hips twist gently with legs, subtle roll over stance leg)
    pelvisGroup.position.set(hipSwayX, 0.82 + verticalBob, 0);
    pelvisGroup.rotation.set(
      -0.012 * move,
      strideSin * (0.065 + sprint * 0.025),
      strideCos * 0.028
    );

    // Upper torso counter-rotation, subtle forward walk momentum lean & organic breathing
    torsoGroup.position.set(0, 0.06 + breathLift, 0);
    torsoGroup.rotation.set(
      -(0.032 + sprint * 0.048) * move + idleBreath * 0.008,
      -strideSin * (0.105 + sprint * 0.045),
      -strideCos * 0.032
    );

    // Articulated Left & Right Legs (180° out of phase)
    const idleWeightShift = Math.sin(elapsed * 0.72) * (1.0 - move);
    applyLegGait(leftLeg, walkCycle, move, sprint, Math.max(0, idleWeightShift));
    applyLegGait(rightLeg, walkCycle + Math.PI, move, sprint, Math.max(0, -idleWeightShift));

    if (reachTimer > 0) {
      reachTimer = Math.max(0, reachTimer - dt);
    }
    const targetReach = reachTimer > 0 ? 1.0 : 0.0;
    reachBlend = THREE.MathUtils.damp(reachBlend, targetReach, 11.0, dt);

    headGroup.rotation.x = THREE.MathUtils.clamp(params.pitch * 0.65, -0.55, 0.55);
    headGroup.rotation.y = strideSin * 0.035;

    // Phase-lagged natural arm swing (left arm swings opposite to left leg, elbows & wrists trail organically)
    const leftArmSwing = -Math.sin(walkCycle) * move;
    const rightArmSwing = Math.sin(walkCycle) * move;
    const leftElbowLag = Math.max(0, -Math.sin(walkCycle - 0.55)) * move;
    const rightElbowLag = Math.max(0, Math.sin(walkCycle - 0.55)) * move;
    const leftWristLag = -Math.sin(walkCycle - 0.95) * move;
    const rightWristLag = Math.sin(walkCycle - 0.95) * move;

    const armSwingAmp = 0.36 + sprint * 0.24;
    const elbowSwingAmp = 0.26 + sprint * 0.24;
    const isFp = currentPassMode === 'first-person';

    // Relaxed natural standing posture (no stiff floating arms or everted palms!)
    // Arms hang naturally by the sides with subtle ~12° elbow bend, palms facing inward toward thighs & thumbs forward
    const restShoulderX = isFp ? 0.055 : 0.04;
    const restShoulderZ = 0.095;
    const restForearmX = isFp ? 0.22 : 0.18;

    // Left Arm
    leftArm.shoulderPivot.rotation.set(
      restShoulderX + leftArmSwing * armSwingAmp + idleBreath * 0.012,
      -leftArmSwing * 0.06,
      -restShoulderZ - idleBreath * 0.012 - Math.abs(leftArmSwing) * 0.025
    );
    leftArm.forearmPivot.rotation.set(
      restForearmX + leftElbowLag * elbowSwingAmp + idleBreath * 0.014,
      0.0,
      0.045
    );
    // Left Hand: +PI * 0.44 => inner palm faces INWARD (+X), thumb points FORWARD (-Z)
    leftArm.handGroup.rotation.set(
      0.03 + leftWristLag * 0.11,
      Math.PI * 0.44 - leftElbowLag * 0.10,
      -0.04 + leftWristLag * 0.03
    );

    // Right Arm (blends smoothly from relaxed gait/idle into natural forward interaction reach)
    const baseRightShoulderX =
      restShoulderX + rightArmSwing * armSwingAmp + idleBreath * 0.012;
    const baseRightShoulderY = rightArmSwing * 0.06;
    const baseRightShoulderZ =
      restShoulderZ + idleBreath * 0.012 + Math.abs(rightArmSwing) * 0.025;
    const baseRightForearmX =
      restForearmX + rightElbowLag * elbowSwingAmp + idleBreath * 0.014;

    const reachShoulderX = 1.04 + THREE.MathUtils.clamp(params.pitch * 0.55, -0.42, 0.42);
    const reachShoulderY = 0.18;
    const reachShoulderZ = 0.08;
    const reachForearmX = 0.52;

    rightArm.shoulderPivot.rotation.set(
      THREE.MathUtils.lerp(baseRightShoulderX, reachShoulderX, reachBlend),
      THREE.MathUtils.lerp(baseRightShoulderY, reachShoulderY, reachBlend),
      THREE.MathUtils.lerp(baseRightShoulderZ, reachShoulderZ, reachBlend)
    );
    rightArm.forearmPivot.rotation.set(
      THREE.MathUtils.lerp(baseRightForearmX, reachForearmX, reachBlend),
      THREE.MathUtils.lerp(0.0, -0.14, reachBlend),
      THREE.MathUtils.lerp(-0.045, -0.10, reachBlend)
    );
    // Right Hand: -PI * 0.44 => inner palm faces INWARD (-X), thumb points FORWARD (-Z);
    // during forward reach, smoothly pronates to -0.26 so palm angles naturally inward-downward & thumb stays medial
    rightArm.handGroup.rotation.set(
      THREE.MathUtils.lerp(0.03 + rightWristLag * 0.11, -0.14, reachBlend),
      THREE.MathUtils.lerp(-Math.PI * 0.44 + rightElbowLag * 0.10, -0.26, reachBlend),
      THREE.MathUtils.lerp(0.04 - rightWristLag * 0.03, 0.06, reachBlend)
    );

    // Gentle anatomical breathing & swing relaxation curl on all 5 fingers (negative X curls inward toward +Z palm)
    const breathCurl = idleBreath * 0.032;
    const leftSwingCurl = leftElbowLag * 0.09;
    const rightSwingCurl = rightElbowLag * 0.09;
    for (let i = 0; i < leftArm.fingers.length; i++) {
      const f = leftArm.fingers[i];
      const weight = 0.68 + i * 0.09;
      f.basePivot.rotation.x = f.restBaseCurl - breathCurl * weight - leftSwingCurl * weight;
      f.tipPivot.rotation.x = f.restTipCurl - breathCurl * 0.72 - leftSwingCurl * 0.8;
    }
    for (let i = 0; i < rightArm.fingers.length; i++) {
      const f = rightArm.fingers[i];
      const openScale = 1.0 - reachBlend * 0.52;
      const weight = 0.68 + i * 0.09;
      f.basePivot.rotation.x =
        f.restBaseCurl * openScale - breathCurl * 0.45 * weight - rightSwingCurl * (1 - reachBlend) * weight;
      f.tipPivot.rotation.x =
        f.restTipCurl * openScale - breathCurl * 0.45 - rightSwingCurl * (1 - reachBlend) * 0.8;
    }
  };

  return {
    root,
    headGroup,
    bodyGroup,
    leftHandGroup: leftArm.handGroup,
    rightHandGroup: rightArm.handGroup,
    triangleCount,
    setRenderPassMode,
    triggerHandReach,
    update,
  };
}
