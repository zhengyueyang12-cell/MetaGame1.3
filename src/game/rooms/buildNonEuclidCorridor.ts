import * as THREE from 'three';
import { createBeveledBox, createBeveledSlab } from '../geometries';
import { mergeStaticGroupToSingleMesh } from '../SceneManager';
import type { RoomBuildContext } from './roomContext';

/**
 * Builds an ultra-deep (56m visual depth), clean, doorless Non-Euclidean Apartment Hallway
 * outside the Entryway front door (X = -8.00 .. -64.00, centered on Z = 4.60, floor Y = -0.08).
 *
 * Architectural Style:
 * - Clean, cozy apartment interior finish: warm patterned living wallpaper on upper walls,
 *   honey-oak vertical beadboard wainscoting + chair rail + baseboard on lower walls, and
 *   warm oak hardwood planks underfoot — ZERO side doors or cluttered projections.
 * - Sparse warm round flush ceiling dome lamps (`圆灯`) spaced generously every 7.0 meters
 *   for moody alternating pools of light & shadow stretching deep into the vanishing point.
 * - Built as 14 clean 4.0m modular segments (each merged to 1 draw call) with undistorted
 *   world-meter UVs; segments strictly behind the approaching `endGroup` are hidden invisibly.
 * - At the far end sits a REAL hinged, pushable/openable apartment armored door (`endDoorPivot`)
 *   that slides hyperbolically closer from 54m away down to X = -17.20 as the player walks West.
 *   Pushing or opening that door reveals a 1:1 lit 180°-rotated Entryway behind it so walking
 *   straight through folds seamlessly back into the player's own Entryway!
 */
export function buildNonEuclidCorridor(
  ctx: RoomBuildContext,
  playDoorAudio: (open: boolean) => void
): void {
  const { scene, textures, outlines, mat, metaState, registerInteractable } = ctx;

  const root = new THREE.Group();
  root.name = 'NonEuclidCorridor';
  root.visible = false;
  scene.add(root);

  const FLOOR_Y = -0.08;
  const CEIL_Y = 3.02;
  const CORR_H = CEIL_Y - FLOOR_Y; // 3.10m matching apartment ceiling height
  const Z_CENTER = 4.60;
  const HALF_W = 1.08; // Interior Z = 3.52 .. 5.68 (clean 2.16m width)
  const BAY_LEN = 4.0;
  const BAY_COUNT = 18; // Spans X = -8.00 .. -80.00 (72 meters of deep vanishing perspective!)

  // Clean apartment-harmonized materials (wallpaper + honey-oak wainscoting + warm oak floor)
  const hallWallpaperMat = mat({
    map: textures.wallpaperLiving,
    color: 0xf0eef8,
    roughness: 0.90,
    metalness: 0.0,
    celStrength: 0.54,
  });
  const hallWainscotMat = mat({
    map: textures.wainscotWood,
    bumpMap: textures.furnitureWoodBump,
    bumpScale: 0.005,
    color: 0xe6d3c4,
    roughness: 0.78,
    metalness: 0.02,
    celStrength: 0.52,
    woodLacquer: 0.16,
  });
  const hallOakTrimMat = mat({
    map: textures.furnitureOak,
    color: 0xf2d9b6,
    roughness: 0.64,
    metalness: 0.02,
    woodLacquer: 0.24,
  });
  const hallWoodFloorMat = mat({
    map: textures.woodFloor,
    bumpMap: textures.woodFloorBump,
    bumpScale: 0.012,
    roughnessMap: textures.woodFloorRoughness,
    color: 0xfcf2e4,
    roughness: 0.68,
    metalness: 0.02,
    woodLacquer: 0.20,
    celStrength: 0.50,
  });
  const hallCeilMat = mat({
    color: 0xf1eff8,
    roughness: 0.90,
    metalness: 0.0,
    celStrength: 0.48,
  });
  const crownMat = mat({
    color: 0xf6f3fa,
    roughness: 0.76,
    metalness: 0.02,
  });
  const darkMetalMat = mat({
    color: 0x352e45,
    roughness: 0.32,
    metalness: 0.76,
  });
  const brassMat = mat({
    color: 0xc99c58,
    roughness: 0.30,
    metalness: 0.82,
  });
  const doorSteelMat = mat({
    color: 0x564d69,
    roughness: 0.48,
    metalness: 0.42,
  });
  const roundLampGlowMat = new THREE.MeshBasicMaterial({ color: 0xfff0d8 });

  // Helper to assign crisp world-meter UVs so wallpaper, wainscoting & wood floor never stretch
  const makeBoxWorldUV = (
    w: number,
    h: number,
    d: number,
    tileX: number,
    tileY: number,
    tileZ: number
  ) => {
    const g = new THREE.BoxGeometry(w, h, d);
    const uv = g.attributes.uv;
    const norm = g.attributes.normal;
    for (let i = 0; i < uv.count; i++) {
      const nx = Math.abs(norm.getX(i));
      const ny = Math.abs(norm.getY(i));
      const u = uv.getX(i);
      const v = uv.getY(i);
      if (ny > 0.5) {
        uv.setXY(i, u * (w / tileX), v * (d / tileZ));
      } else if (nx > 0.5) {
        uv.setXY(i, u * (d / tileZ), v * (h / tileY));
      } else {
        uv.setXY(i, u * (w / tileX), v * (h / tileY));
      }
    }
    uv.needsUpdate = true;
    return g;
  };

  // =========================================================================
  // 1. 14 CLEAN MODULAR CORRIDOR BAYS (56m DEEP: X = -8.0 .. -64.0)
  //    Clean wallpaper + honey-oak wainscoting + warm oak floor + sparse round lamps!
  // =========================================================================
  const bays: { group: THREE.Group; frontX: number }[] = [];

  for (let b = 0; b < BAY_COUNT; b++) {
    const frontX = -8.0 - b * BAY_LEN;
    const centerX = frontX - BAY_LEN / 2;
    const bayGroup = new THREE.Group();
    bayGroup.name = `NonEuclidCleanBay_${b}`;

    // Warm oak hardwood floor slab (undistorted world-meter plank scale)
    const floorGeo = makeBoxWorldUV(BAY_LEN + 0.02, 0.16, HALF_W * 2 + 0.24, 2.2, 1.0, 2.2);
    const fMesh = new THREE.Mesh(floorGeo, hallWoodFloorMat);
    fMesh.position.set(centerX, FLOOR_Y - 0.08, Z_CENTER);
    fMesh.receiveShadow = true;
    bayGroup.add(fMesh);

    // Clean ceiling slab
    const ceilMesh = new THREE.Mesh(
      new THREE.BoxGeometry(BAY_LEN + 0.02, 0.16, HALF_W * 2 + 0.24),
      hallCeilMat
    );
    ceilMesh.position.set(centerX, CEIL_Y + 0.08, Z_CENTER);
    bayGroup.add(ceilMesh);

    // North & South Clean Wallpaper Walls + Honey-Oak Wainscoting + Chair Rail + Baseboard + Crown
    for (const side of [-1, 1] as const) {
      const wallZ = Z_CENTER + side * (HALF_W + 0.08);
      const innerZ = Z_CENTER + side * HALF_W;

      const wallGeo = makeBoxWorldUV(BAY_LEN + 0.02, CORR_H, 0.16, 2.2, 2.2, 1.0);
      const wall = new THREE.Mesh(wallGeo, hallWallpaperMat);
      wall.position.set(centerX, FLOOR_Y + CORR_H / 2, wallZ);
      wall.receiveShadow = true;
      bayGroup.add(wall);

      // Clean lower honey-oak wood wainscoting (0.94m tall)
      const wainGeo = makeBoxWorldUV(BAY_LEN + 0.02, 0.94, 0.024, 1.8, 0.94, 1.0);
      const wain = new THREE.Mesh(wainGeo, hallWainscotMat);
      wain.position.set(centerX, FLOOR_Y + 0.47, innerZ - side * 0.012);
      wain.receiveShadow = true;
      bayGroup.add(wain);

      // Honey-oak beveled chair rail cap along top of wainscoting
      const chairRail = new THREE.Mesh(
        createBeveledBox(BAY_LEN + 0.02, 0.044, 0.046, 0.008, 2),
        hallOakTrimMat
      );
      chairRail.position.set(centerX, FLOOR_Y + 0.955, innerZ - side * 0.020);
      bayGroup.add(chairRail);

      // Honey-oak floor baseboard
      const baseboard = new THREE.Mesh(
        createBeveledBox(BAY_LEN + 0.02, 0.072, 0.036, 0.006, 2),
        hallOakTrimMat
      );
      baseboard.position.set(centerX, FLOOR_Y + 0.036, innerZ - side * 0.016);
      bayGroup.add(baseboard);

      // Clean white ceiling crown molding
      const crown = new THREE.Mesh(
        createBeveledBox(BAY_LEN + 0.02, 0.048, 0.042, 0.008, 1),
        crownMat
      );
      crown.position.set(centerX, CEIL_Y - 0.024, innerZ - side * 0.018);
      bayGroup.add(crown);
    }

    // Sparse, warm Round Flush Ceiling Dome Lamps (圆灯 — only every 3rd bay, i.e., every 12.0 meters!)
    if (b % 3 === 1) {
      const rim = new THREE.Mesh(
        new THREE.CylinderGeometry(0.18, 0.195, 0.032, 20),
        crownMat
      );
      rim.position.set(centerX, CEIL_Y - 0.016, Z_CENTER);
      bayGroup.add(rim);

      const dome = new THREE.Mesh(
        new THREE.SphereGeometry(0.155, 18, 12, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.5),
        roundLampGlowMat
      );
      dome.position.set(centerX, CEIL_Y - 0.022, Z_CENTER);
      bayGroup.add(dome);
    }

    mergeStaticGroupToSingleMesh(bayGroup, outlines, `NonEuclidCleanBayMerged_${b}`);
    root.add(bayGroup);
    bays.push({ group: bayGroup, frontX });
  }

  // Sparse soft warm-cream corridor round-lamp PointLights (aligned with the 12m round ceiling lamps)
  for (const lx of [-14.0, -26.0]) {
    const corrLight = new THREE.PointLight(0xffe9d2, 0.72, 14.0, 1.25);
    corrLight.position.set(lx, CEIL_Y - 0.28, Z_CENTER);
    corrLight.castShadow = false;
    scene.add(corrLight);
  }

  // =========================================================================
  // 2. APPROACHING NON-EUCLIDEAN END WALL + REAL PUSHABLE/OPENABLE ARMORED DOOR
  //    Starts 68m away at X = -76.0 and contracts hyperbolically to X = -16.00 (exact bay seam!).
  //    Player pushes or opens this exact apartment door to step smoothly back into Entryway!
  // =========================================================================
  const endGroup = new THREE.Group();
  endGroup.name = 'NonEuclidReturnPortalEnd';
  endGroup.position.set(-76.0, FLOOR_Y, Z_CENTER);
  endGroup.userData.dynamic = true;

  // Clean matching wallpaper + wainscoting end partition framing the return doorway (Z = -0.56 .. +0.56)
  for (const side of [-1, 1] as const) {
    const sideW = new THREE.Mesh(
      makeBoxWorldUV(0.18, CORR_H, 0.64, 1.0, 2.2, 2.2),
      hallWallpaperMat
    );
    sideW.position.set(0, CORR_H / 2, side * 0.88);
    endGroup.add(sideW);

    const sideWain = new THREE.Mesh(
      makeBoxWorldUV(0.024, 0.94, 0.62, 1.0, 0.94, 1.8),
      hallWainscotMat
    );
    sideWain.position.set(0.095, 0.47, side * 0.87);
    endGroup.add(sideWain);

    const sideRail = new THREE.Mesh(
      createBeveledBox(0.044, 0.044, 0.62, 0.008, 1),
      hallOakTrimMat
    );
    sideRail.position.set(0.105, 0.955, side * 0.87);
    endGroup.add(sideRail);

    const jamb = new THREE.Mesh(
      createBeveledBox(0.22, 2.34, 0.08, 0.008, 2),
      darkMetalMat
    );
    jamb.position.set(0, 1.17, side * 0.56);
    endGroup.add(jamb);
  }

  const endHeaderWall = new THREE.Mesh(
    makeBoxWorldUV(0.18, CORR_H - 2.28, 1.16, 1.0, 2.2, 2.2),
    hallWallpaperMat
  );
  endHeaderWall.position.set(0, 2.28 + (CORR_H - 2.28) / 2, 0);
  endGroup.add(endHeaderWall);

  const endHeaderFrame = new THREE.Mesh(
    createBeveledBox(0.22, 0.09, 1.22, 0.008, 2),
    darkMetalMat
  );
  endHeaderFrame.position.set(0, 2.31, 0);
  endGroup.add(endHeaderFrame);

  const endThreshold = new THREE.Mesh(
    createBeveledBox(0.20, 0.024, 1.12, 0.004, 2),
    darkMetalMat
  );
  endThreshold.position.set(0, 0.012, 0);
  endGroup.add(endThreshold);

  // 1:1 Lit 180°-Rotated Return Entryway Interior right behind the pushable end door!
  const dioWallMat = mat({
    map: textures.wallpaperLiving,
    color: 0xf4f2fa,
    roughness: 0.90,
    metalness: 0.0,
    celStrength: 0.56,
  });
  const dioWainscotMat = mat({
    map: textures.wainscotWood,
    color: 0xe6d5c8,
    roughness: 0.82,
    metalness: 0.02,
    celStrength: 0.54,
  });
  const dioOakMat = mat({
    map: textures.furnitureOak,
    color: 0xebd8ca,
    roughness: 0.54,
    metalness: 0.04,
  });
  const dioCeilMat = mat({
    color: 0xf4f2fa,
    roughness: 0.92,
    metalness: 0.0,
    celStrength: 0.48,
  });

  const dioDepth = 6.2;

  const dioFloorGenkan = new THREE.Mesh(
    new THREE.BoxGeometry(2.12, 0.14, 4.10),
    mat({ map: textures.genkanTile, color: 0xb9b0cf, roughness: 0.68 })
  );
  dioFloorGenkan.position.set(-1.06, -0.07, 0);
  dioFloorGenkan.receiveShadow = true;
  endGroup.add(dioFloorGenkan);

  const dioStep = new THREE.Mesh(
    createBeveledSlab(0.16, 0.095, 4.00, 0.02, 0.01),
    mat({ color: 0xc99474, roughness: 0.78 })
  );
  dioStep.position.set(-2.12, 0.044, 0);
  endGroup.add(dioStep);

  const dioFloorWood = new THREE.Mesh(
    makeBoxWorldUV(dioDepth - 2.12, 0.22, 4.20, 2.2, 1.0, 2.2),
    hallWoodFloorMat
  );
  dioFloorWood.position.set(-2.12 - (dioDepth - 2.12) / 2, -0.03, 0);
  dioFloorWood.receiveShadow = true;
  endGroup.add(dioFloorWood);

  const dioCeil = new THREE.Mesh(
    new THREE.BoxGeometry(dioDepth + 0.2, 0.14, 4.30),
    dioCeilMat
  );
  dioCeil.position.set(-dioDepth / 2, 3.25, 0);
  endGroup.add(dioCeil);

  for (const [wz, sign] of [
    [1.95, 1],
    [-2.00, -1],
  ] as const) {
    const sWall = new THREE.Mesh(
      makeBoxWorldUV(dioDepth, 3.22, 0.16, 2.2, 2.2, 1.0),
      dioWallMat
    );
    sWall.position.set(-dioDepth / 2, 1.61, wz + sign * 0.08);
    endGroup.add(sWall);

    const sWain = new THREE.Mesh(
      makeBoxWorldUV(dioDepth, 0.92, 0.022, 1.8, 0.92, 1.0),
      dioWainscotMat
    );
    sWain.position.set(-dioDepth / 2, 0.46, wz - sign * 0.011);
    endGroup.add(sWain);

    const sRail = new THREE.Mesh(
      new THREE.BoxGeometry(dioDepth, 0.045, 0.042),
      hallOakTrimMat
    );
    sRail.position.set(-dioDepth / 2, 0.93, wz - sign * 0.020);
    endGroup.add(sRail);
  }

  const dioBackWall = new THREE.Mesh(
    makeBoxWorldUV(0.18, 3.28, 4.30, 1.0, 2.2, 2.2),
    dioWallMat
  );
  dioBackWall.position.set(-dioDepth - 0.09, 1.64, 0);
  endGroup.add(dioBackWall);

  const dioShoeCab = new THREE.Mesh(
    createBeveledBox(1.56, 1.04, 0.44, 0.012, 2),
    dioOakMat
  );
  dioShoeCab.position.set(-2.55, 0.60, 1.66);
  endGroup.add(dioShoeCab);

  const dioBench = new THREE.Mesh(
    createBeveledBox(1.10, 0.44, 0.38, 0.012, 2),
    dioOakMat
  );
  dioBench.position.set(-1.35, 0.22, -1.64);
  endGroup.add(dioBench);

  const dioLamp = new THREE.Mesh(
    new THREE.CircleGeometry(0.24, 16),
    roundLampGlowMat
  );
  dioLamp.rotation.x = Math.PI / 2;
  dioLamp.position.set(-1.75, 3.16, 0);
  endGroup.add(dioLamp);

  // Opaque light-blocking shroud behind diorama so corridor bays behind endGroup never bleed through
  const shroudBack = new THREE.Mesh(
    new THREE.PlaneGeometry(6.4, 5.2),
    new THREE.MeshBasicMaterial({ color: 0x161024, side: THREE.DoubleSide })
  );
  shroudBack.rotation.y = Math.PI / 2;
  shroudBack.position.set(-dioDepth - 0.24, 1.65, 0);
  endGroup.add(shroudBack);

  mergeStaticGroupToSingleMesh(endGroup, outlines, 'NonEuclidReturnEndMerged');

  // =========================================================================
  // 3. HINGED PUSHABLE / OPENABLE END ARMORED DOOR (`endDoorPivot`)
  //    Hinged on the right jamb (local Z = +0.54, leaf extends -Z by 1.08m).
  //    Swings INWARD West (-X) into the returning Entryway when pushed or interacted!
  // =========================================================================
  const endDoorPivot = new THREE.Group();
  endDoorPivot.name = 'NonEuclidEndDoorPivot';
  endDoorPivot.position.set(-0.02, 0, 0.54);
  endDoorPivot.userData.dynamic = true;

  const endDoorPanel = new THREE.Mesh(
    createBeveledBox(0.072, 2.26, 1.06, 0.009, 3),
    doorSteelMat
  );
  endDoorPanel.position.set(0, 1.13, -0.54);
  outlines.addOutline(endDoorPanel, 1.014);
  endDoorPivot.add(endDoorPanel);

  for (const py of [0.38, 0.86, 1.38, 1.86]) {
    const stamp = new THREE.Mesh(
      createBeveledBox(0.084, 0.36, 0.78, 0.008, 2),
      doorSteelMat
    );
    stamp.position.set(0, py, -0.54);
    endDoorPivot.add(stamp);
  }

  const endPeephole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.022, 0.022, 0.10, 14),
    brassMat
  );
  endPeephole.rotation.z = Math.PI / 2;
  endPeephole.position.set(0, 1.56, -0.54);
  endDoorPivot.add(endPeephole);

  const endLockBox = new THREE.Mesh(
    createBeveledBox(0.086, 0.24, 0.11, 0.010, 2),
    darkMetalMat
  );
  endLockBox.position.set(0.015, 1.10, -0.94);
  endDoorPivot.add(endLockBox);

  for (const hSide of [-1, 1] as const) {
    const grip = new THREE.Mesh(
      createBeveledBox(0.030, 0.028, 0.14, 0.008, 2),
      brassMat
    );
    grip.position.set(hSide * 0.074, 1.04, -0.89);
    endDoorPivot.add(grip);
  }

  const endLed = new THREE.Mesh(
    new THREE.SphereGeometry(0.012, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0x5ef2ff })
  );
  endLed.position.set(0.064, 1.18, -0.94);
  endDoorPivot.add(endLed);

  endGroup.add(endDoorPivot);

  registerInteractable(
    'non_euclid_end_door',
    '尽头的防盗门',
    '推开房门',
    'entryway',
    endDoorPivot,
    () => {
      const corr = metaState.nonEuclidCorridor;
      corr.endDoorIsOpen = !corr.endDoorIsOpen;
      corr.endDoorAudioPlayed = true;
      playDoorAudio(corr.endDoorIsOpen);
      return {
        title: corr.endDoorIsOpen ? '推开尽头的房门' : '合上房门',
        message: corr.endDoorIsOpen
          ? '厚重的防盗门缓缓向内敞开——门后透出的，竟是熟悉而温暖的玄关灯光。'
          : '防盗门轻轻合拢，长廊再次归于寂静。',
      };
    }
  );

  // Dynamic warm light inside the returning Entryway diorama (synced with endGroup.position.x)
  const dioramaLight = new THREE.PointLight(0xffeed8, 0.96, 10.5, 1.12);
  dioramaLight.position.set(-1.85, 2.75, 0);
  dioramaLight.castShadow = false;
  endGroup.add(dioramaLight);

  root.add(endGroup);

  metaState.nonEuclidCorridor.group = root;
  metaState.nonEuclidCorridor.shellGroup = null;
  metaState.nonEuclidCorridor.endGroup = endGroup;
  metaState.nonEuclidCorridor.endDoorPivot = endDoorPivot;
  metaState.nonEuclidCorridor.endDoorAngle = 0;
  metaState.nonEuclidCorridor.endDoorVel = 0;
  metaState.nonEuclidCorridor.endDoorIsOpen = false;
  metaState.nonEuclidCorridor.endDoorAudioPlayed = false;
  metaState.nonEuclidCorridor.bays = bays;
  metaState.nonEuclidCorridor.dioramaLight = dioramaLight;
}
