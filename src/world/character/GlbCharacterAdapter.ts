import * as THREE from 'three';
import { GLTF, GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { CharacterAnimState, GlbAdjustments } from '../types';

export interface LoadedGlbCharacter {
  root: THREE.Group;
  name: string;
  hasSkeleton: boolean;
  clipNames: string[];
  setAdjustments: (adj: GlbAdjustments) => void;
  update: (
    state: CharacterAnimState,
    moveSpeed: number,
    aimPitch: number,
    dt: number,
    elapsed: number,
  ) => void;
  dispose: () => void;
}

interface StoredGlbRecord {
  name: string;
  buffer: ArrayBuffer;
}

const CANONICAL_DB_NAME = 'strike_zone_glb_v1';
const CANONICAL_STORE_NAME = 'models';
const CANONICAL_KEY = 'active_character';

const KNOWN_LEGACY_DB_NAMES = [
  'strike_zone_glb_v1',
  'strike_zone_custom_glb_v1',
  'strike_zone_character_v1',
  'strike_zone_lobby_v1',
  'strike_zone_glb_storage',
  'custom_glb_storage',
  'character_glb_db',
];

function isGlbOrGltfBuffer(buf: ArrayBuffer): boolean {
  if (buf.byteLength < 12) return false;
  const view = new Uint8Array(buf, 0, 4);
  // Binary glTF magic: 'glTF'
  if (view[0] === 0x67 && view[1] === 0x6c && view[2] === 0x54 && view[3] === 0x46) {
    return true;
  }
  // JSON glTF starts with '{' (with optional whitespace)
  const firstNonSpace = new TextDecoder().decode(new Uint8Array(buf, 0, Math.min(64, buf.byteLength))).trimStart();
  return firstNonSpace.startsWith('{') && firstNonSpace.includes('"asset"');
}

async function extractGlbFromValue(val: unknown): Promise<StoredGlbRecord | null> {
  if (!val) return null;
  if (val instanceof ArrayBuffer && isGlbOrGltfBuffer(val)) {
    return { name: 'Police_Male_02.glb', buffer: val };
  }
  if (val instanceof Uint8Array) {
    const ab = val.buffer.slice(val.byteOffset, val.byteOffset + val.byteLength) as ArrayBuffer;
    if (isGlbOrGltfBuffer(ab)) {
      return { name: 'Police_Male_02.glb', buffer: ab };
    }
  }
  if (typeof Blob !== 'undefined' && val instanceof Blob) {
    const ab = await val.arrayBuffer();
    if (isGlbOrGltfBuffer(ab)) {
      const maybeName = (val as File).name || 'Police_Male_02.glb';
      return { name: maybeName, buffer: ab };
    }
  }
  if (typeof val === 'object') {
    const rec = val as Record<string, unknown>;
    const candidateName =
      typeof rec.name === 'string' && rec.name.trim()
        ? rec.name.trim()
        : typeof rec.fileName === 'string' && rec.fileName.trim()
          ? rec.fileName.trim()
          : 'Police_Male_02.glb';

    for (const k of ['buffer', 'data', 'bytes', 'glb', 'file']) {
      const inner = rec[k];
      if (!inner) continue;
      const extracted = await extractGlbFromValue(inner);
      if (extracted) {
        return { name: candidateName, buffer: extracted.buffer };
      }
    }
  }
  return null;
}

function openExistingDb(dbName: string): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(dbName);
      req.onupgradeneeded = () => {
        // Do not create empty shell DBs while probing legacy names
        req.transaction?.abort();
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function readAllFromStore(db: IDBDatabase, storeName: string): Promise<unknown[]> {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const req = store.getAll();
      req.onsuccess = () => resolve(Array.isArray(req.result) ? req.result : []);
      req.onerror = () => resolve([]);
    } catch {
      resolve([]);
    }
  });
}

function openCanonicalDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(CANONICAL_DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(CANONICAL_STORE_NAME)) {
        db.createObjectStore(CANONICAL_STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveCustomGlbToStorage(name: string, buffer: ArrayBuffer): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  try {
    const db = await openCanonicalDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(CANONICAL_STORE_NAME, 'readwrite');
      tx.objectStore(CANONICAL_STORE_NAME).put({ name, buffer }, CANONICAL_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // Ignore quota/storage errors
  }
}

export async function loadCustomGlbFromStorage(): Promise<StoredGlbRecord | null> {
  if (typeof indexedDB === 'undefined') return null;

  // 1. Check canonical store first
  try {
    const db = await openCanonicalDb();
    const record = await new Promise<unknown>((resolve) => {
      try {
        const tx = db.transaction(CANONICAL_STORE_NAME, 'readonly');
        const req = tx.objectStore(CANONICAL_STORE_NAME).get(CANONICAL_KEY);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
    db.close();
    const parsed = await extractGlbFromValue(record);
    if (parsed) return parsed;
  } catch {
    // Fall through to discovery
  }

  // 2. Discover all IndexedDB databases on origin to recover previously uploaded Police_Male_02.glb
  const dbNames = new Set<string>(KNOWN_LEGACY_DB_NAMES);
  try {
    if (typeof indexedDB.databases === 'function') {
      const list = await indexedDB.databases();
      for (const info of list) {
        if (info.name) dbNames.add(info.name);
      }
    }
  } catch {
    // indexedDB.databases() unsupported in older environments
  }

  for (const name of dbNames) {
    const db = await openExistingDb(name);
    if (!db) continue;
    try {
      const storeNames = Array.from(db.objectStoreNames);
      for (const storeName of storeNames) {
        const values = await readAllFromStore(db, storeName);
        for (const val of values) {
          const extracted = await extractGlbFromValue(val);
          if (extracted) {
            db.close();
            // Mirror into canonical DB for fast subsequent loads
            await saveCustomGlbToStorage(extracted.name, extracted.buffer.slice(0));
            return extracted;
          }
        }
      }
    } finally {
      db.close();
    }
  }

  return null;
}

export async function clearCustomGlbFromStorage(): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  try {
    const db = await openCanonicalDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(CANONICAL_STORE_NAME, 'readwrite');
      tx.objectStore(CANONICAL_STORE_NAME).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
    db.close();
  } catch {
    // Ignore
  }

  try {
    if (typeof indexedDB.databases === 'function') {
      const list = await indexedDB.databases();
      for (const info of list) {
        if (!info.name || info.name === CANONICAL_DB_NAME) continue;
        const db = await openExistingDb(info.name);
        if (!db) continue;
        try {
          const storeNames = Array.from(db.objectStoreNames);
          for (const storeName of storeNames) {
            const values = await readAllFromStore(db, storeName);
            let hasGlb = false;
            for (const val of values) {
              if (await extractGlbFromValue(val)) {
                hasGlb = true;
                break;
              }
            }
            if (hasGlb) {
              await new Promise<void>((resolve) => {
                try {
                  const tx = db.transaction(storeName, 'readwrite');
                  tx.objectStore(storeName).clear();
                  tx.oncomplete = () => resolve();
                  tx.onerror = () => resolve();
                } catch {
                  resolve();
                }
              });
            }
          }
        } finally {
          db.close();
        }
      }
    }
  } catch {
    // Ignore
  }
}

type Side = 'L' | 'R' | null;

type BoneRole =
  | 'hips'
  | 'spine'
  | 'spine1'
  | 'spine2'
  | 'neck'
  | 'head'
  | 'clavicleL'
  | 'clavicleR'
  | 'armL'
  | 'armR'
  | 'forearmL'
  | 'forearmR'
  | 'handL'
  | 'handR'
  | 'thighL'
  | 'thighR'
  | 'shinL'
  | 'shinR'
  | 'footL'
  | 'footR'
  | 'toeL'
  | 'toeR';

function detectSideFromRaw(rawName: string): Side {
  const lower = rawName.toLowerCase();
  if (
    lower.includes('left') ||
    /(^|[^a-z0-9])l([^a-z0-9]|$)/.test(lower) ||
    /(^|[a-z0-9_])l_[a-z]/.test(lower) ||
    /_l\d*$/.test(lower) ||
    /\.l\d*$/.test(lower) ||
    /^l[A-Z]/.test(rawName)
  ) {
    return 'L';
  }
  if (
    lower.includes('right') ||
    /(^|[^a-z0-9])r([^a-z0-9]|$)/.test(lower) ||
    /(^|[a-z0-9_])r_[a-z]/.test(lower) ||
    /_r\d*$/.test(lower) ||
    /\.r\d*$/.test(lower) ||
    /^r[A-Z]/.test(rawName)
  ) {
    return 'R';
  }
  return null;
}

function stripPrefixesAndNormalize(rawName: string): string {
  return rawName
    .replace(/^mixamorig\d*:?/i, '')
    .replace(/^cc_base_/i, '')
    .replace(/^bip\d+[\s_-]*/i, '')
    .replace(/^j_bip_[clr]_/i, '')
    .replace(/^valvebiped_/i, '')
    .replace(/^def[-_]/i, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function classifyBone(rawName: string): BoneRole | null {
  const side = detectSideFromRaw(rawName);
  const norm = stripPrefixesAndNormalize(rawName)
    .replace(/left/g, '')
    .replace(/right/g, '');

  // Skip finger bones when matching arm/hand
  if (/thumb|index|middle|ring|pinky|little|metacarpal|phalang/.test(norm)) {
    return null;
  }

  if (/^(hips|pelvis|hip|rootpelvis|c_traj|bip01pelvis)$/.test(norm)) return 'hips';
  if (/^(spine2|upperchest|chest|spine02|spine_02)$/.test(norm)) return 'spine2';
  if (/^(spine1|spine01|spine_01)$/.test(norm)) return 'spine1';
  if (/^(spine|spine0|spine00|waist)$/.test(norm)) return 'spine';
  if (/^neck/.test(norm)) return 'neck';
  if (/^head$/.test(norm)) return 'head';

  if (side) {
    if (/clavicle|shoulder/.test(norm) && !/upperarm|arm/.test(norm)) {
      return side === 'L' ? 'clavicleL' : 'clavicleR';
    }
    if (/forearm|lowerarm|lowarm|elbow/.test(norm)) {
      return side === 'L' ? 'forearmL' : 'forearmR';
    }
    if (/upperarm|^arm$|shoulderarm|bicep/.test(norm)) {
      return side === 'L' ? 'armL' : 'armR';
    }
    if (/^hand$|^wrist$/.test(norm)) {
      return side === 'L' ? 'handL' : 'handR';
    }
    if (/upleg|thigh|upperleg/.test(norm)) {
      return side === 'L' ? 'thighL' : 'thighR';
    }
    if (/^(leg|shin|calf|lowerleg|lowleg|knee)$/.test(norm)) {
      return side === 'L' ? 'shinL' : 'shinR';
    }
    if (/toebase|^toe$|^toes$/.test(norm)) {
      return side === 'L' ? 'toeL' : 'toeR';
    }
    if (/^foot$|^ankle$/.test(norm)) {
      return side === 'L' ? 'footL' : 'footR';
    }
  }

  return null;
}

interface BoneRestInfo {
  bone: THREE.Bone;
  restLocalQuat: THREE.Quaternion;
  restLocalPos: THREE.Vector3;
  restRootQuat: THREE.Quaternion;
}

const _qWorld = new THREE.Quaternion();
const _qParentWorld = new THREE.Quaternion();
const _qRootWorld = new THREE.Quaternion();
const _qRootInv = new THREE.Quaternion();
const _qTargetRoot = new THREE.Quaternion();
const _qDeltaRoot = new THREE.Quaternion();
const _eulerTmp = new THREE.Euler();
const _vA = new THREE.Vector3();
const _vB = new THREE.Vector3();
const _boxProbe = new THREE.Box3();

export async function parseGlbCharacterBuffer(
  buffer: ArrayBuffer,
  fileName: string,
  maxAnisotropy = 4,
): Promise<LoadedGlbCharacter> {
  const dracoLoader = new DRACOLoader();
  dracoLoader.setDecoderPath('/draco/');

  const loader = new GLTFLoader();
  loader.setDRACOLoader(dracoLoader);
  loader.setMeshoptDecoder(MeshoptDecoder);

  let gltf: GLTF;
  try {
    gltf = await loader.parseAsync(buffer, '');
  } finally {
    dracoLoader.dispose();
  }

  const root = new THREE.Group();
  root.name = `GlbCharacterRoot_${fileName}`;

  const modelWrapper = new THREE.Group();
  modelWrapper.name = 'GlbModelWrapper';
  modelWrapper.add(gltf.scene);
  root.add(modelWrapper);

  const skeletons: THREE.Skeleton[] = [];
  const disposableGeos = new Set<THREE.BufferGeometry>();
  const disposableMats = new Set<THREE.Material>();
  const disposableTexs = new Set<THREE.Texture>();

  // Fix materials, shadows, anisotropy, and SkinnedMesh frustum culling
  gltf.scene.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.castShadow = true;
      obj.receiveShadow = true;
      if (obj instanceof THREE.SkinnedMesh) {
        obj.frustumCulled = false;
        if (obj.skeleton && !skeletons.includes(obj.skeleton)) {
          skeletons.push(obj.skeleton);
        }
      }
      if (obj.geometry) disposableGeos.add(obj.geometry);

      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const mat of mats) {
        if (!mat) continue;
        disposableMats.add(mat);
        if (mat instanceof THREE.MeshStandardMaterial || mat instanceof THREE.MeshPhysicalMaterial) {
          // Ensure proper texture anisotropy and sRGB color space on color maps
          for (const tex of [
            mat.map,
            mat.emissiveMap,
            mat.normalMap,
            mat.roughnessMap,
            mat.metalnessMap,
            mat.aoMap,
          ]) {
            if (tex) {
              tex.anisotropy = Math.min(8, Math.max(1, maxAnisotropy));
              disposableTexs.add(tex);
            }
          }
          if (mat.map) mat.map.colorSpace = THREE.SRGBColorSpace;
          if (mat.emissiveMap) mat.emissiveMap.colorSpace = THREE.SRGBColorSpace;

          // Fix common exported GLB plastic/over-shiny material artifacts
          if (!mat.roughnessMap && mat.metalness < 0.25 && mat.roughness < 0.25) {
            mat.roughness = 0.56;
          }
          mat.envMapIntensity = Math.min(0.65, mat.envMapIntensity || 0.55);
          mat.needsUpdate = true;
        }
      }
    }
  });

  for (const sk of skeletons) {
    sk.pose();
  }
  root.updateMatrixWorld(true);

  // Classify humanoid bones
  const boneMap = new Map<BoneRole, BoneRestInfo>();
  const allBones: THREE.Bone[] = [];
  gltf.scene.traverse((obj) => {
    if (obj instanceof THREE.Bone) {
      allBones.push(obj);
      const role = classifyBone(obj.name);
      if (role && !boneMap.has(role)) {
        boneMap.set(role, {
          bone: obj,
          restLocalQuat: obj.quaternion.clone(),
          restLocalPos: obj.position.clone(),
          restRootQuat: new THREE.Quaternion(),
        });
      }
    }
  });

  // Measure raw bounds & detect if character faces -Z (backwards) vs +Z
  const rawBox = new THREE.Box3().setFromObject(modelWrapper);
  const rawSize = new THREE.Vector3();
  const rawCenter = new THREE.Vector3();
  rawBox.getSize(rawSize);
  rawBox.getCenter(rawCenter);

  const safeHeight = rawSize.y > 0.05 ? rawSize.y : 1.8;
  const baseScale = 1.8 / safeHeight;

  let autoFlipFacing = false;
  const footL = boneMap.get('footL')?.bone;
  const toeL = boneMap.get('toeL')?.bone;
  const footR = boneMap.get('footR')?.bone;
  const toeR = boneMap.get('toeR')?.bone;
  if (footL && toeL) {
    footL.getWorldPosition(_vA);
    toeL.getWorldPosition(_vB);
    if (_vB.z - _vA.z < -0.02 * safeHeight) {
      autoFlipFacing = true;
    }
  } else if (footR && toeR) {
    footR.getWorldPosition(_vA);
    toeR.getWorldPosition(_vB);
    if (_vB.z - _vA.z < -0.02 * safeHeight) {
      autoFlipFacing = true;
    }
  }

  let currentAdjustments: GlbAdjustments = {
    flipFacing: false,
    scaleMultiplier: 1,
    groundOffsetY: 0,
    fixArmsPose: true,
  };

  const applyBaseTransform = (adj: GlbAdjustments) => {
    const finalScale = baseScale * adj.scaleMultiplier;
    const facingFlip = adj.flipFacing !== autoFlipFacing;
    const yaw = facingFlip ? Math.PI : 0;

    modelWrapper.scale.setScalar(finalScale);
    modelWrapper.rotation.set(0, yaw, 0);

    const cx = rawCenter.x * finalScale * (facingFlip ? -1 : 1);
    const cz = rawCenter.z * finalScale * (facingFlip ? -1 : 1);
    modelWrapper.position.set(-cx, -rawBox.min.y * finalScale + adj.groundOffsetY, -cz);
  };

  applyBaseTransform(currentAdjustments);
  root.updateMatrixWorld(true);

  // Record each bone's rest orientation in character-root space AFTER base alignment
  _qRootWorld.setFromRotationMatrix(root.matrixWorld);
  _qRootInv.copy(_qRootWorld).invert();
  for (const info of boneMap.values()) {
    info.bone.getWorldQuaternion(_qWorld);
    info.restRootQuat.copy(_qRootInv).multiply(_qWorld);
  }

  // Detect natural arm hang angle (T-pose = 0 rad from horizontal, A-pose ~ 0.65, Arms-down ~ 1.25)
  const measureArmDownAngle = (upperRole: BoneRole, foreRole: BoneRole): number => {
    const u = boneMap.get(upperRole)?.bone;
    const f = boneMap.get(foreRole)?.bone;
    if (!u || !f) return 1.15;
    u.getWorldPosition(_vA);
    f.getWorldPosition(_vB);
    _vB.sub(_vA);
    const len = _vB.length();
    if (len < 0.01) return 1.15;
    const horiz = Math.hypot(_vB.x, _vB.z);
    // Angle downward from horizontal (+Y is up, so -_vB.y is downward)
    return Math.atan2(-_vB.y, Math.max(0.0001, horiz));
  };

  const restArmDownL = measureArmDownAngle('armL', 'forearmL');
  const restArmDownR = measureArmDownAngle('armR', 'forearmR');
  // Target natural arm hang ~ 1.18 rad (~68 deg below horizontal, i.e. ~22 deg out from torso)
  const targetNaturalArmDown = 1.18;
  const armDropL = THREE.MathUtils.clamp(targetNaturalArmDown - restArmDownL, -0.35, 1.35);
  const armDropR = THREE.MathUtils.clamp(targetNaturalArmDown - restArmDownR, -0.35, 1.35);

  // Track rest foot clearance so dynamic ground lock keeps boots flush even during crouch/stances
  const getFootMinYInRoot = (): number | null => {
    const samples: THREE.Bone[] = [];
    for (const r of ['footL', 'toeL', 'footR', 'toeR'] as BoneRole[]) {
      const b = boneMap.get(r)?.bone;
      if (b) samples.push(b);
    }
    if (samples.length === 0) return null;
    let minY = Infinity;
    for (const b of samples) {
      b.getWorldPosition(_vA);
      root.worldToLocal(_vA);
      if (_vA.y < minY) minY = _vA.y;
    }
    return Number.isFinite(minY) ? minY : null;
  };
  const restFootY = getFootMinYInRoot();

  // Optional embedded AnimationMixer (only used if native idle clip exists and user selects it or fallback)
  let mixer: THREE.AnimationMixer | null = null;
  const clipNames = gltf.animations.map((a) => a.name || 'Clip');
  if (gltf.animations.length > 0) {
    mixer = new THREE.AnimationMixer(gltf.scene);
  }

  // Smooth damped pose state (in character-root space!)
  const curEuler = new Map<BoneRole, THREE.Vector3>();
  const getCur = (role: BoneRole): THREE.Vector3 => {
    let v = curEuler.get(role);
    if (!v) {
      v = new THREE.Vector3();
      curEuler.set(role, v);
    }
    return v;
  };

  const applyRootSpacePose = (
    role: BoneRole,
    tx: number,
    ty: number,
    tz: number,
    damp: number,
    dt: number,
  ) => {
    const info = boneMap.get(role);
    if (!info) return;
    const cur = getCur(role);
    cur.x = THREE.MathUtils.damp(cur.x, tx, damp, dt);
    cur.y = THREE.MathUtils.damp(cur.y, ty, damp, dt);
    cur.z = THREE.MathUtils.damp(cur.z, tz, damp, dt);

    const parent = info.bone.parent;
    if (!parent) return;

    root.getWorldQuaternion(_qRootWorld);
    parent.getWorldQuaternion(_qParentWorld);

    _eulerTmp.set(cur.x, cur.y, cur.z, 'YXZ');
    _qDeltaRoot.setFromEuler(_eulerTmp);

    // Target orientation in root space = deltaRoot * restRootQuat
    _qTargetRoot.copy(_qDeltaRoot).multiply(info.restRootQuat);
    // Convert root-space target -> world space -> parent's local space
    _qWorld.copy(_qRootWorld).multiply(_qTargetRoot);
    info.bone.quaternion.copy(_qParentWorld.invert()).multiply(_qWorld);
  };

  const resetAllBonesToRest = () => {
    for (const info of boneMap.values()) {
      info.bone.quaternion.copy(info.restLocalQuat);
      info.bone.position.copy(info.restLocalPos);
    }
    for (const v of curEuler.values()) {
      v.set(0, 0, 0);
    }
  };

  let lastState: CharacterAnimState = 'lobby_ready';
  let activeClipAction: THREE.AnimationAction | null = null;

  return {
    root,
    name: fileName,
    hasSkeleton: skeletons.length > 0 || boneMap.size >= 4,
    clipNames,
    setAdjustments(adj: GlbAdjustments) {
      const prevFlip = currentAdjustments.flipFacing;
      currentAdjustments = { ...adj };
      applyBaseTransform(currentAdjustments);
      root.updateMatrixWorld(true);

      // If facing flipped, re-capture restRootQuat in the new modelWrapper orientation
      if (prevFlip !== adj.flipFacing) {
        resetAllBonesToRest();
        root.updateMatrixWorld(true);
        _qRootWorld.setFromRotationMatrix(root.matrixWorld);
        _qRootInv.copy(_qRootWorld).invert();
        for (const info of boneMap.values()) {
          info.bone.getWorldQuaternion(_qWorld);
          info.restRootQuat.copy(_qRootInv).multiply(_qWorld);
        }
      }
    },
    update(
      state: CharacterAnimState,
      _moveSpeed: number,
      aimPitch: number,
      dt: number,
      elapsed: number,
    ) {
      const step = Math.min(Math.max(dt, 0.001), 0.05);

      if (state === 'rest') {
        if (lastState !== 'rest') {
          if (activeClipAction) {
            activeClipAction.stop();
            activeClipAction = null;
          }
          resetAllBonesToRest();
        }
        // If the GLB has an embedded Idle animation and user switches to Original Pose, play it cleanly
        if (mixer && gltf.animations.length > 0 && !activeClipAction) {
          const idleClip =
            gltf.animations.find((c) => /idle|stand|breath/i.test(c.name)) || gltf.animations[0];
          activeClipAction = mixer.clipAction(idleClip);
          activeClipAction.play();
        }
        if (mixer && activeClipAction) {
          mixer.update(step);
        }
        lastState = state;
        root.updateMatrixWorld(true);
        return;
      }

      if (lastState === 'rest' && activeClipAction) {
        activeClipAction.stop();
        activeClipAction = null;
        resetAllBonesToRest();
      }
      lastState = state;

      // Reset base transform each frame before computing foot-ground lock
      applyBaseTransform(currentAdjustments);
      root.updateMatrixWorld(true);

      if (boneMap.size < 4) {
        // Static unrigged mesh fallback: gentle turntable breathing
        return;
      }

      const breath = Math.sin(elapsed * 1.9);
      const sway = Math.sin(elapsed * 0.95);
      const dropL = currentAdjustments.fixArmsPose ? armDropL : 0;
      const dropR = currentAdjustments.fixArmsPose ? armDropR : 0;

      // Root-space target deltas (X: pitch forward/back, Y: yaw, Z: roll out/in)
      // Note: In character-root space (+Z toward camera, +X is character's LEFT, +Y is UP):
      // - Positive Z rotation lifts LEFT arm up / drops RIGHT arm down!
      // - Negative Z rotation drops LEFT arm down / lifts RIGHT arm up!
      let hipsYaw = -0.14 + sway * 0.02;
      let spineX = 0.02 + breath * 0.012;
      let spineY = 0.08;
      let chestX = 0.02 + breath * 0.015;
      let chestY = 0.06 - sway * 0.02;
      let chestZ = 0;
      let headX = -0.02 + aimPitch * 0.15 + breath * 0.01;
      let headY = -0.05 + Math.sin(elapsed * 0.55) * 0.04;

      let thighLX = -0.05;
      let thighLZ = 0.06;
      let thighLY = 0.08;
      let shinLX = 0.11;
      let footLX = -0.06;

      let thighRX = 0.07;
      let thighRZ = -0.07;
      let thighRY = -0.1;
      let shinRX = 0.07;
      let footRX = -0.14;

      // Arms in character-root space:
      // Left arm drop toward torso = negative Z rotation (-dropL)
      // Right arm drop toward torso = positive Z rotation (+dropR)
      let armLX = 0.08 + breath * 0.015;
      let armLY = 0.1;
      let armLZ = -dropL;
      let foreLX = -0.32;
      let foreLY = 0.08;
      let foreLZ = 0;

      let armRX = 0.06 + breath * 0.015;
      let armRY = -0.1;
      let armRZ = dropR;
      let foreRX = -0.28;
      let foreRY = -0.08;
      let foreRZ = 0;

      let handLX = 0;
      let handLZ = -0.06;
      let handRX = 0;
      let handRZ = 0.06;

      if (state === 'emote_salute') {
        hipsYaw = -0.04;
        spineX = -0.02;
        spineY = 0.02;
        chestX = -0.02;
        chestY = 0.02;
        headX = -0.03;
        headY = 0;

        thighLX = 0;
        thighLZ = 0.03;
        thighLY = 0.04;
        shinLX = 0.04;
        footLX = -0.04;

        thighRX = 0;
        thighRZ = -0.03;
        thighRY = -0.04;
        shinRX = 0.04;
        footRX = -0.04;

        // Left arm braced straight down
        armLX = 0.04;
        armLZ = -dropL - 0.08;
        foreLX = -0.16;

        // Right arm raised crisply into tactical brow salute
        armRX = -0.95;
        armRY = -0.45;
        armRZ = dropR - 0.62;
        foreRX = -1.78;
        foreRY = 0.48;
        handRX = 0.08;
        handRZ = -0.14;
      } else if (state === 'emote_booyah') {
        const pulse = Math.sin(elapsed * 5.0);
        const pump = Math.max(0, Math.sin(elapsed * 2.5));
        hipsYaw = -0.08 + Math.sin(elapsed * 1.8) * 0.08;
        chestX = -0.08 + pulse * 0.03;
        chestZ = Math.sin(elapsed * 2.5) * 0.04;
        headX = -0.12;
        headY = Math.sin(elapsed * 1.4) * 0.08;

        thighLX = -0.12;
        thighLZ = 0.1;
        shinLX = 0.2;
        footLX = -0.08;

        thighRX = 0.06;
        thighRZ = -0.1;
        shinRX = 0.16;
        footRX = -0.22;

        // Right arm fist raised high in victory
        armRX = -1.65 + pump * 0.18;
        armRY = -0.22;
        armRZ = dropR - 0.72 - pump * 0.1;
        foreRX = -0.72 - pump * 0.22;

        // Left arm counter-braced
        armLX = -0.42;
        armLZ = -dropL + 0.35;
        foreLX = -1.1;
      } else if (state === 'emote_warmup') {
        const bob = Math.sin(elapsed * 4.4);
        const jab = Math.max(0, Math.sin(elapsed * 3.1));
        hipsYaw = -0.38 + bob * 0.05;
        spineX = 0.08;
        chestX = 0.12 + bob * 0.03;
        chestY = 0.18;
        headX = -0.12;
        headY = 0.18;

        thighLX = -0.22;
        thighLZ = 0.1;
        shinLX = 0.32;
        footLX = -0.1;

        thighRX = 0.2;
        thighRZ = -0.1;
        shinRX = 0.2;
        footRX = -0.4;

        // Combat guard fists with left jab
        armLX = -0.88 - jab * 0.32;
        armLY = -0.18;
        armLZ = -dropL + 0.15;
        foreLX = -1.55 + jab * 0.85;

        armRX = -0.86;
        armRY = 0.22;
        armRZ = dropR - 0.15;
        foreRX = -1.68;
      } else if (state === 'crouch_idle') {
        hipsYaw = -0.22;
        spineX = 0.16;
        chestX = 0.16 + breath * 0.02;
        chestY = 0.12;
        headX = -0.2;
        headY = 0.08;

        thighLX = -0.95;
        thighLZ = 0.14;
        shinLX = 1.52;
        footLX = -0.57;

        thighRX = -0.52;
        thighRZ = -0.14;
        shinRX = 1.42;
        footRX = -0.7;

        armLX = -0.4;
        armLZ = -dropL + 0.16;
        foreLX = -1.05;

        armRX = -0.32;
        armRZ = dropR - 0.16;
        foreRX = -0.9;
      }

      const damp = 10;
      applyRootSpacePose('hips', 0, hipsYaw, 0, damp, step);
      applyRootSpacePose('spine', spineX, spineY, 0, damp, step);
      applyRootSpacePose('spine1', chestX * 0.5, chestY * 0.5, chestZ * 0.5, damp, step);
      applyRootSpacePose('spine2', chestX * 0.5, chestY * 0.5, chestZ * 0.5, damp, step);
      applyRootSpacePose('neck', headX * 0.35, headY * 0.35, 0, damp, step);
      applyRootSpacePose('head', headX * 0.65, headY * 0.65, 0, damp, step);

      applyRootSpacePose('thighL', thighLX, thighLY, thighLZ, damp, step);
      applyRootSpacePose('shinL', shinLX, 0, 0, damp, step);
      applyRootSpacePose('footL', footLX, 0, 0, damp, step);

      applyRootSpacePose('thighR', thighRX, thighRY, thighRZ, damp, step);
      applyRootSpacePose('shinR', shinRX, 0, 0, damp, step);
      applyRootSpacePose('footR', footRX, 0, 0, damp, step);

      applyRootSpacePose('armL', armLX, armLY, armLZ, damp, step);
      applyRootSpacePose('forearmL', foreLX, foreLY, foreLZ, damp, step);
      applyRootSpacePose('handL', handLX, 0, handLZ, damp, step);

      applyRootSpacePose('armR', armRX, armRY, armRZ, damp, step);
      applyRootSpacePose('forearmR', foreRX, foreRY, foreRZ, damp, step);
      applyRootSpacePose('handR', handRX, 0, handRZ, damp, step);

      root.updateMatrixWorld(true);

      // Keep feet planted flush at y = groundOffsetY (avoiding sink or float during crouch/emotes)
      if (restFootY !== null) {
        const curFootY = getFootMinYInRoot();
        if (curFootY !== null) {
          const deltaY = restFootY - curFootY;
          modelWrapper.position.y += deltaY;
          root.updateMatrixWorld(true);
        }
      } else {
        // Fallback Box3 floor clamp when foot bones aren't mapped
        _boxProbe.setFromObject(modelWrapper);
        if (Number.isFinite(_boxProbe.min.y)) {
          modelWrapper.position.y += currentAdjustments.groundOffsetY - _boxProbe.min.y;
          root.updateMatrixWorld(true);
        }
      }
    },
    dispose() {
      mixer?.stopAllAction();
      for (const g of disposableGeos) g.dispose();
      for (const m of disposableMats) m.dispose();
      for (const t of disposableTexs) t.dispose();
    },
  };
}
