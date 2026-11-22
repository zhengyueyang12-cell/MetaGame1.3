import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { MToonMaterial, VRM, VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import { retargetMixamoFbxToVrmWithMeta } from './mixamoVrmRetarget';
import type { RoomId } from '../types';

/**
 * Bedroom Bed-Edge Seat Anchor (South edge of the plush mattress in buildBedroom.ts):
 * - Bed center: (-6.54, 0, -4.05), mattress South edge Z = -3.12, top surface Y = 0.565
 * - Clear of pillows (X = -7.42) and plush star cushion (-5.78, -3.49)
 * - Facing slightly East-South (yaw = +0.52 rad) toward the bedroom entrance door (-1.22, -3.60)
 */
export const BEDROOM_BED_SEAT_ANCHOR = {
  x: -6.12,
  seatSurfaceY: 0.565,
  z: -3.12,
  facingYaw: 0.52,
  defaultDoorLookPoint: new THREE.Vector3(-1.35, 1.42, -3.55),
};

const MTOON_GI_EQUALIZATION_TARGET = 0.34;

// Zero-GC scratch objects for per-frame gaze, head tracking, and seated height calibration
const _tmpBox = new THREE.Box3();
const _headWorldPos = new THREE.Vector3();
const _hipsWorldPos = new THREE.Vector3();
const _rootWorldPos = new THREE.Vector3();
const _toTargetWorld = new THREE.Vector3();
const _toTargetLocal = new THREE.Vector3();
const _desiredLookWorld = new THREE.Vector3();
const _invRootQuat = new THREE.Quaternion();
const _addHeadQuat = new THREE.Quaternion();
const _addNeckQuat = new THREE.Quaternion();
const _addChestQuat = new THREE.Quaternion();
const _tmpEuler = new THREE.Euler(0, 0, 0, 'YXZ');

export type HeroineAnimSlot = 'idle' | 'walk' | 'sit';

export class HeroineAvatarController {
  public readonly root: THREE.Group;
  public readonly lookAtTarget: THREE.Object3D;

  private readonly gltfLoader: GLTFLoader;
  private readonly fbxLoader: FBXLoader;

  private vrm: VRM | null = null;
  private mixer: THREE.AnimationMixer | null = null;
  private sharedFbx: Partial<Record<'idle' | 'walk', THREE.Group>> = {};
  private sitFbx: THREE.Group | null = null;
  private actions: Partial<Record<HeroineAnimSlot, THREE.AnimationAction>> = {};

  private vrmStandingHipsHeight = 0.88;
  private sitClipHipsY: number | null = null;
  private spawned = false;
  private disposed = false;

  // Smooth head/neck gaze & eye tracking state
  private currentHeadYaw = 0;
  private currentHeadPitch = 0;
  private lookAtInitialized = false;

  // Natural randomized blinking state (with occasional double-blink)
  private blinkTimer = 2.4;
  private blinkElapsed = -1;
  private blinkDuration = 0.16;
  private pendingDoubleBlink = false;

  constructor() {
    this.root = new THREE.Group();
    this.root.name = 'HeroineVrmAvatarRoot';
    this.root.visible = false;
    this.root.position.set(
      BEDROOM_BED_SEAT_ANCHOR.x,
      0,
      BEDROOM_BED_SEAT_ANCHOR.z
    );
    this.root.rotation.set(0, BEDROOM_BED_SEAT_ANCHOR.facingYaw, 0);

    this.lookAtTarget = new THREE.Object3D();
    this.lookAtTarget.name = 'HeroineLookAtTarget';
    this.lookAtTarget.position.copy(BEDROOM_BED_SEAT_ANCHOR.defaultDoorLookPoint);

    this.gltfLoader = new GLTFLoader();
    this.gltfLoader.register((parser) => new VRMLoaderPlugin(parser));
    this.fbxLoader = new FBXLoader();
  }

  public hasVrm(): boolean {
    return this.vrm !== null;
  }

  public getVrmVersion(): string | null {
    return this.vrm?.meta?.metaVersion ?? null;
  }

  public hasSitClip(): boolean {
    return Boolean(this.actions.sit);
  }

  public isSpawned(): boolean {
    return this.spawned;
  }

  /**
   * Immediately spawns and seats the heroine on the bedroom bed-edge anchor facing the bedroom door.
   */
  public spawnOnBedroomBed(): void {
    this.spawned = true;
    this.applyBedEdgeTransform();
    if (this.vrm) {
      this.root.visible = true;
    }
  }

  public setSpawned(visible: boolean): void {
    this.spawned = visible;
    if (visible) {
      this.applyBedEdgeTransform();
    }
    this.root.visible = visible && this.vrm !== null;
  }

  private applyBedEdgeTransform(): void {
    // Align pelvis cleanly onto the mattress surface whether using sit.fbx or procedural sitting
    const effectiveHipsY =
      this.actions.sit && this.sitClipHipsY !== null
        ? this.sitClipHipsY
        : this.vrmStandingHipsHeight;
    const pelvisSeatOffset = 0.085;
    const rootY = BEDROOM_BED_SEAT_ANCHOR.seatSurfaceY + pelvisSeatOffset - effectiveHipsY;

    this.root.position.set(
      BEDROOM_BED_SEAT_ANCHOR.x,
      rootY,
      BEDROOM_BED_SEAT_ANCHOR.z
    );
    this.root.rotation.set(0, BEDROOM_BED_SEAT_ANCHOR.facingYaw, 0);
  }

  private tuneMaterialsForRoomLighting(vrmScene: THREE.Object3D): void {
    vrmScene.traverse((obj) => {
      obj.frustumCulled = false;
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;

      mesh.castShadow = true;
      mesh.receiveShadow = true;

      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (let i = 0; i < materials.length; i++) {
        const mat = materials[i];
        if (!mat) continue;

        mat.toneMapped = true;
        const mtoon = mat as MToonMaterial;
        if (mtoon.isMToonMaterial || mat instanceof MToonMaterial) {
          const curGi =
            typeof mtoon.giEqualizationFactor === 'number'
              ? mtoon.giEqualizationFactor
              : 0.9;
          mtoon.giEqualizationFactor = Math.min(curGi, MTOON_GI_EQUALIZATION_TARGET);
          mtoon.needsUpdate = true;
        }
      }
    });
  }

  public async loadHeroineFromBlob(blob: Blob): Promise<void> {
    const objectUrl = URL.createObjectURL(blob);
    try {
      const gltf = await this.gltfLoader.loadAsync(objectUrl);
      if (this.disposed) return;

      const loadedVrm = gltf.userData.vrm as VRM | undefined;
      if (!loadedVrm) {
        throw new Error('该文件不是有效的女主 VRM 模型');
      }

      this.disposeCurrentVrm();

      VRMUtils.removeUnnecessaryVertices(gltf.scene);
      VRMUtils.combineSkeletons(gltf.scene);
      VRMUtils.rotateVRM0(loadedVrm);
      this.tuneMaterialsForRoomLighting(loadedVrm.scene);

      // Ground feet to local Y = 0 and measure standing hips height for exact mattress seating
      loadedVrm.scene.position.set(0, 0, 0);
      loadedVrm.scene.updateMatrixWorld(true);
      _tmpBox.setFromObject(loadedVrm.scene);
      if (!_tmpBox.isEmpty() && Number.isFinite(_tmpBox.min.y)) {
        const yOffset = -_tmpBox.min.y;
        if (Math.abs(yOffset) < 0.8) {
          loadedVrm.scene.position.y = yOffset;
        }
      }
      loadedVrm.scene.updateMatrixWorld(true);

      const hipsNode = loadedVrm.humanoid.getNormalizedBoneNode('hips');
      if (hipsNode) {
        hipsNode.getWorldPosition(_hipsWorldPos);
        loadedVrm.scene.getWorldPosition(_rootWorldPos);
        const dy = Math.abs(_hipsWorldPos.y - _rootWorldPos.y);
        if (dy > 0.25 && dy < 1.5) {
          this.vrmStandingHipsHeight = dy;
        }
      }

      // Wire VRM LookAt eye tracker to world-space lookAtTarget
      if (loadedVrm.lookAt) {
        loadedVrm.lookAt.target = this.lookAtTarget;
        loadedVrm.lookAt.autoUpdate = true;
      }

      this.vrm = loadedVrm;
      this.root.add(loadedVrm.scene);
      this.mixer = new THREE.AnimationMixer(loadedVrm.scene);
      this.actions = {};
      this.sitClipHipsY = null;

      this.rebindAllClips();
      this.applyBedEdgeTransform();
      this.root.visible = this.spawned;
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  public async loadSitFbxFromBlob(blob: Blob): Promise<void> {
    const objectUrl = URL.createObjectURL(blob);
    try {
      const fbxGroup = await this.fbxLoader.loadAsync(objectUrl);
      if (this.disposed) return;

      if (!fbxGroup.animations || fbxGroup.animations.length === 0) {
        throw new Error('sit.fbx 中未检测到骨骼动画轨道');
      }
      this.sitFbx = fbxGroup;
      if (this.vrm) {
        this.rebindSingleClip('sit', fbxGroup);
        this.applyBedEdgeTransform();
      }
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  /**
   * Reuses already-loaded protagonist idle.fbx / walk.fbx Mixamo assets for the heroine's
   * humanoid skeleton retargeting (ready for future standing/walking phases too).
   */
  public syncSharedFbx(slot: 'idle' | 'walk', fbxGroup: THREE.Group | null): void {
    if (fbxGroup) {
      this.sharedFbx[slot] = fbxGroup;
      if (this.vrm) {
        this.rebindSingleClip(slot, fbxGroup);
      }
    } else {
      delete this.sharedFbx[slot];
      this.clearAction(slot);
    }
  }

  public removeHeroineVrm(): void {
    this.disposeCurrentVrm();
  }

  public removeSitClip(): void {
    this.sitFbx = null;
    this.sitClipHipsY = null;
    this.clearAction('sit');
    if (this.vrm) {
      this.applyBedEdgeTransform();
    }
  }

  private clearAction(slot: HeroineAnimSlot): void {
    const prev = this.actions[slot];
    if (prev) {
      prev.stop();
      this.mixer?.uncacheAction(prev.getClip());
      delete this.actions[slot];
    }
  }

  private rebindAllClips(): void {
    if (!this.vrm || !this.mixer) return;
    this.mixer.stopAllAction();
    this.actions = {};
    this.sitClipHipsY = null;

    if (this.sharedFbx.idle) {
      this.rebindSingleClip('idle', this.sharedFbx.idle);
    }
    if (this.sharedFbx.walk) {
      this.rebindSingleClip('walk', this.sharedFbx.walk);
    }
    if (this.sitFbx) {
      this.rebindSingleClip('sit', this.sitFbx);
    }
  }

  private rebindSingleClip(slot: HeroineAnimSlot, fbxGroup: THREE.Group): void {
    if (!this.vrm || !this.mixer) return;
    this.clearAction(slot);

    const result = retargetMixamoFbxToVrmWithMeta(
      fbxGroup,
      this.vrm,
      `heroine_${slot}`
    );
    if (!result) return;

    // For sit.fbx, inspect the retargeted hips Y track so we can seat her flush on the bed surface
    if (slot === 'sit') {
      const hipsNode = this.vrm.humanoid.getNormalizedBoneNode('hips');
      const hipsTrackName = hipsNode ? `${hipsNode.name}.position` : null;
      const hipsTrack = hipsTrackName
        ? result.clip.tracks.find((t) => t.name === hipsTrackName)
        : undefined;
      if (hipsTrack && hipsTrack.values.length >= 2) {
        const y0 = hipsTrack.values[1];
        if (Number.isFinite(y0) && y0 > 0.12 && y0 < 1.35) {
          this.sitClipHipsY = y0;
        }
      }
    }

    const action = this.mixer.clipAction(result.clip);
    action.setLoop(THREE.LoopRepeat, Infinity);
    action.enabled = true;
    action.setEffectiveTimeScale(1.0);
    action.setEffectiveWeight(slot === 'sit' ? 1.0 : 0.0);
    action.play();
    this.actions[slot] = action;
  }

  /**
   * Natural procedural sitting pose on the bedroom bed edge when no custom `sit.fbx` is loaded:
   * - Thighs lifted forward (~84 deg, negative X in VRM normalized right-handed coords)
   * - Shins dangling smoothly downward (+82 deg at knees)
   * - Arms & hands resting softly near thighs / mattress edge
   */
  private applyProceduralSeatedPose(vrm: VRM, elapsed: number): void {
    const h = vrm.humanoid;

    const hips = h.getNormalizedBoneNode('hips');
    const spine = h.getNormalizedBoneNode('spine');
    const chest = h.getNormalizedBoneNode('chest');
    const leftUpperLeg = h.getNormalizedBoneNode('leftUpperLeg');
    const rightUpperLeg = h.getNormalizedBoneNode('rightUpperLeg');
    const leftLowerLeg = h.getNormalizedBoneNode('leftLowerLeg');
    const rightLowerLeg = h.getNormalizedBoneNode('rightLowerLeg');
    const leftFoot = h.getNormalizedBoneNode('leftFoot');
    const rightFoot = h.getNormalizedBoneNode('rightFoot');
    const leftUpperArm = h.getNormalizedBoneNode('leftUpperArm');
    const rightUpperArm = h.getNormalizedBoneNode('rightUpperArm');
    const leftLowerArm = h.getNormalizedBoneNode('leftLowerArm');
    const rightLowerArm = h.getNormalizedBoneNode('rightLowerArm');
    const leftHand = h.getNormalizedBoneNode('leftHand');
    const rightHand = h.getNormalizedBoneNode('rightHand');

    const sway = Math.sin(elapsed * 0.72) * 0.015;
    const breath = Math.sin(elapsed * 1.65);

    if (hips) {
      hips.rotation.set(0.03, 0, 0);
    }
    if (spine) {
      spine.rotation.set(0.04 + breath * 0.012, 0, sway * 0.5);
    }
    if (chest) {
      chest.rotation.set(0.02 + breath * 0.022, 0, sway * 0.6);
    }

    // Thighs lifted forward cleanly (+Z) & slightly angled inward for a natural seated silhouette
    if (leftUpperLeg) {
      leftUpperLeg.rotation.set(-1.46, 0.05, 0.04);
    }
    if (rightUpperLeg) {
      rightUpperLeg.rotation.set(-1.46, -0.05, -0.04);
    }

    // Lower legs hanging vertically down off the mattress edge with very gentle idle sway
    const legMicroSway = Math.sin(elapsed * 0.95) * 0.025;
    if (leftLowerLeg) {
      leftLowerLeg.rotation.set(1.42 + legMicroSway, 0, 0);
    }
    if (rightLowerLeg) {
      rightLowerLeg.rotation.set(1.40 - legMicroSway * 0.8, 0, 0);
    }
    if (leftFoot) {
      leftFoot.rotation.set(0.16, 0, 0);
    }
    if (rightFoot) {
      rightFoot.rotation.set(0.16, 0, 0);
    }

    // Relaxed arms resting softly down beside thighs / lightly touching the bed edge
    if (leftUpperArm) {
      leftUpperArm.rotation.set(0.18, 0.10, -1.16 + breath * 0.014);
    }
    if (rightUpperArm) {
      rightUpperArm.rotation.set(0.18, -0.10, 1.16 - breath * 0.014);
    }
    if (leftLowerArm) {
      leftLowerArm.rotation.set(-0.36, -0.24, -0.12);
    }
    if (rightLowerArm) {
      rightLowerArm.rotation.set(-0.36, 0.24, 0.12);
    }
    if (leftHand) {
      leftHand.rotation.set(0.08, 0, 0.18);
    }
    if (rightHand) {
      rightHand.rotation.set(0.08, 0, -0.18);
    }
  }

  /**
   * Subtle additive breathing layered when a custom sit.fbx clip is playing.
   */
  private applyAdditiveBreathing(vrm: VRM, elapsed: number): void {
    const chest =
      vrm.humanoid.getNormalizedBoneNode('upperChest') ??
      vrm.humanoid.getNormalizedBoneNode('chest');
    if (chest) {
      const breath = Math.sin(elapsed * 1.65) * 0.022;
      _tmpEuler.set(breath, 0, Math.sin(elapsed * 0.65) * 0.01, 'YXZ');
      _addChestQuat.setFromEuler(_tmpEuler);
      chest.quaternion.multiply(_addChestQuat);
    }
  }

  /**
   * Smoothly drives both VRM LookAt (eyes) AND normalized neck/head bones toward the player
   * when they enter the bedroom and approach the bed.
   */
  private updateGazeAndHeadTracking(
    vrm: VRM,
    dt: number,
    playerEyeWorldPos: THREE.Vector3,
    playerRoom: RoomId
  ): void {
    const headNode = vrm.humanoid.getNormalizedBoneNode('head');
    const neckNode = vrm.humanoid.getNormalizedBoneNode('neck');
    if (!headNode) return;

    this.root.updateMatrixWorld(true);
    headNode.getWorldPosition(_headWorldPos);

    const distToPlayer = _headWorldPos.distanceTo(playerEyeWorldPos);
    const shouldTrackPlayer =
      (playerRoom === 'bedroom' && distToPlayer < 7.8) || distToPlayer < 4.5;

    if (shouldTrackPlayer) {
      _desiredLookWorld.copy(playerEyeWorldPos);
    } else {
      _desiredLookWorld.copy(BEDROOM_BED_SEAT_ANCHOR.defaultDoorLookPoint);
    }

    // Smoothly damp world-space VRM LookAt eye target (eyes lead slightly faster than head!)
    if (!this.lookAtInitialized) {
      this.lookAtTarget.position.copy(_desiredLookWorld);
      this.lookAtInitialized = true;
    } else {
      const eyeLambda = 9.5;
      this.lookAtTarget.position.x = THREE.MathUtils.damp(
        this.lookAtTarget.position.x,
        _desiredLookWorld.x,
        eyeLambda,
        dt
      );
      this.lookAtTarget.position.y = THREE.MathUtils.damp(
        this.lookAtTarget.position.y,
        _desiredLookWorld.y,
        eyeLambda,
        dt
      );
      this.lookAtTarget.position.z = THREE.MathUtils.damp(
        this.lookAtTarget.position.z,
        _desiredLookWorld.z,
        eyeLambda,
        dt
      );
    }
    this.lookAtTarget.updateMatrixWorld(true);

    // Compute desired yaw & pitch in heroine root local coordinates (+Z forward, +Y up)
    _toTargetWorld.subVectors(this.lookAtTarget.position, _headWorldPos);
    _invRootQuat.copy(this.root.quaternion).invert();
    _toTargetLocal.copy(_toTargetWorld).applyQuaternion(_invRootQuat);

    let targetYaw = 0;
    let targetPitch = 0;
    const horizDist = Math.hypot(_toTargetLocal.x, _toTargetLocal.z);
    if (horizDist > 0.05 && _toTargetLocal.z > -0.65) {
      const rawYaw = Math.atan2(_toTargetLocal.x, Math.max(_toTargetLocal.z, 0.12));
      const rawPitch = -Math.atan2(_toTargetLocal.y, Math.max(horizDist, 0.18));
      targetYaw = THREE.MathUtils.clamp(rawYaw, -0.96, 0.96); // ±55 deg comfortable head turn
      targetPitch = THREE.MathUtils.clamp(rawPitch, -0.44, 0.36); // comfortable up/down nod
    }

    const headLambda = 5.2;
    this.currentHeadYaw = THREE.MathUtils.damp(
      this.currentHeadYaw,
      targetYaw,
      headLambda,
      dt
    );
    this.currentHeadPitch = THREE.MathUtils.damp(
      this.currentHeadPitch,
      targetPitch,
      headLambda,
      dt
    );

    // Distribute smooth gaze turn across neck (35%) and head (65%)
    if (this.actions.sit) {
      // Layer additively over sit.fbx animation
      if (neckNode) {
        _tmpEuler.set(this.currentHeadPitch * 0.35, this.currentHeadYaw * 0.35, 0, 'YXZ');
        _addNeckQuat.setFromEuler(_tmpEuler);
        neckNode.quaternion.multiply(_addNeckQuat);
      }
      _tmpEuler.set(this.currentHeadPitch * 0.65, this.currentHeadYaw * 0.65, 0, 'YXZ');
      _addHeadQuat.setFromEuler(_tmpEuler);
      headNode.quaternion.multiply(_addHeadQuat);
    } else {
      if (neckNode) {
        neckNode.rotation.set(
          this.currentHeadPitch * 0.35,
          this.currentHeadYaw * 0.35,
          0,
          'YXZ'
        );
      }
      headNode.rotation.set(
        this.currentHeadPitch * 0.65,
        this.currentHeadYaw * 0.65,
        0,
        'YXZ'
      );
    }
  }

  private updateRandomBlinking(vrm: VRM, dt: number): void {
    const expr = vrm.expressionManager;
    if (!expr) return;

    if (this.blinkElapsed >= 0) {
      this.blinkElapsed += dt;
      if (this.blinkElapsed >= this.blinkDuration) {
        this.blinkElapsed = -1;
        expr.setValue('blink', 0);
        if (this.pendingDoubleBlink) {
          this.pendingDoubleBlink = false;
          this.blinkTimer = 0.14 + Math.random() * 0.08;
        } else {
          this.blinkTimer = 2.2 + Math.random() * 3.6;
          this.pendingDoubleBlink = Math.random() < 0.18;
        }
      } else {
        const p = this.blinkElapsed / this.blinkDuration;
        // Fast natural lid close (38%), soft open (62%)
        const v = p < 0.38 ? p / 0.38 : 1 - (p - 0.38) / 0.62;
        expr.setValue('blink', THREE.MathUtils.clamp(v, 0, 1));
      }
    } else {
      this.blinkTimer -= dt;
      if (this.blinkTimer <= 0) {
        this.blinkElapsed = 0;
        this.blinkDuration = 0.14 + Math.random() * 0.05;
      }
    }
  }

  public update(
    dt: number,
    elapsed: number,
    playerEyeWorldPos: THREE.Vector3,
    playerRoom: RoomId
  ): void {
    if (!this.vrm || !this.spawned) {
      this.root.visible = false;
      return;
    }

    this.root.visible = true;
    const safeDt = Math.min(dt, 0.05);

    // 1. Advance sit.fbx keyframe animation if uploaded, else apply natural procedural seated posture
    if (this.mixer && this.actions.sit) {
      this.actions.sit.setEffectiveWeight(1.0);
      if (this.actions.idle) this.actions.idle.setEffectiveWeight(0.0);
      if (this.actions.walk) this.actions.walk.setEffectiveWeight(0.0);
      this.mixer.update(safeDt);
      this.applyAdditiveBreathing(this.vrm, elapsed);
    } else {
      this.applyProceduralSeatedPose(this.vrm, elapsed);
    }

    // 2. Smoothly turn head/neck & update VRM LookAt target toward player
    this.updateGazeAndHeadTracking(this.vrm, safeDt, playerEyeWorldPos, playerRoom);

    // 3. Natural randomized blinking
    this.updateRandomBlinking(this.vrm, safeDt);

    // 4. Commit normalized bones, VRM LookAt eyes, ExpressionManager, and SpringBones
    this.vrm.update(safeDt);
  }

  private disposeCurrentVrm(): void {
    if (this.mixer) {
      this.mixer.stopAllAction();
      this.mixer = null;
    }
    this.actions = {};
    this.sitClipHipsY = null;
    if (this.vrm) {
      if (this.vrm.lookAt) {
        this.vrm.lookAt.target = null;
      }
      this.root.remove(this.vrm.scene);
      VRMUtils.deepDispose(this.vrm.scene);
      this.vrm = null;
    }
    this.root.visible = false;
  }

  public dispose(): void {
    this.disposed = true;
    this.disposeCurrentVrm();
    this.sharedFbx = {};
    this.sitFbx = null;
  }
}
