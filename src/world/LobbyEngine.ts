import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import {
  clearCustomGlbFromStorage,
  LoadedGlbCharacter,
  loadCustomGlbFromStorage,
  parseGlbCharacterBuffer,
  saveCustomGlbToStorage,
} from './character/GlbCharacterAdapter';
import { buildFreeFireLobbyStage, LobbyStageResult } from './LobbyStageBuilder';
import {
  GlbAdjustments,
  LobbyCameraPreset,
  LobbyEmoteId,
  LobbyLightingPreset,
  SquadSize,
} from './types';

export interface LobbyCharacterMeta {
  name: string;
  hasSkeleton: boolean;
  clipNames: string[];
}

export interface LobbyCallbacks {
  onCharacterModelChange?: (meta: LobbyCharacterMeta | null) => void;
  onInitialLoadFinish?: () => void;
  onContextLost?: () => void;
  onContextRestored?: () => void;
}

const CAMERA_PRESETS: Record<
  LobbyCameraPreset,
  { dist: number; pitch: number; targetY: number; targetX: number; fov: number }
> = {
  full: { dist: 3.55, pitch: 0.12, targetY: 0.96, targetX: -0.14, fov: 38 },
  closeup: { dist: 1.6, pitch: 0.08, targetY: 1.44, targetX: -0.05, fov: 34 },
  squad: { dist: 5.1, pitch: 0.22, targetY: 0.92, targetX: 0.0, fov: 42 },
};

const ADJ_STORAGE_KEY = 'strike_zone_glb_adjustments_v1';

export const DEFAULT_GLB_ADJUSTMENTS: GlbAdjustments = {
  flipFacing: false,
  scaleMultiplier: 1,
  groundOffsetY: 0,
  fixArmsPose: true,
};

function loadSavedAdjustments(): GlbAdjustments {
  try {
    const raw = localStorage.getItem(ADJ_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_GLB_ADJUSTMENTS };
    const parsed = JSON.parse(raw) as Partial<GlbAdjustments>;
    return {
      flipFacing: Boolean(parsed.flipFacing),
      scaleMultiplier:
        typeof parsed.scaleMultiplier === 'number' && parsed.scaleMultiplier >= 0.7 && parsed.scaleMultiplier <= 1.35
          ? parsed.scaleMultiplier
          : 1,
      groundOffsetY:
        typeof parsed.groundOffsetY === 'number' && parsed.groundOffsetY >= -0.3 && parsed.groundOffsetY <= 0.3
          ? parsed.groundOffsetY
          : 0,
      fixArmsPose: parsed.fixArmsPose === undefined ? true : Boolean(parsed.fixArmsPose),
    };
  } catch {
    return { ...DEFAULT_GLB_ADJUSTMENTS };
  }
}

function saveAdjustments(adj: GlbAdjustments): void {
  try {
    localStorage.setItem(ADJ_STORAGE_KEY, JSON.stringify(adj));
  } catch {
    // Ignore storage quota errors
  }
}

function detectSoftwareWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) || '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

function createContactShadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createRadialGradient(64, 64, 6, 64, 64, 60);
    grad.addColorStop(0, 'rgba(5, 8, 14, 0.76)');
    grad.addColorStop(0.55, 'rgba(5, 8, 14, 0.36)');
    grad.addColorStop(1, 'rgba(5, 8, 14, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 128);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createEmptyStandbyBeacon(): {
  group: THREE.Group;
  update: (elapsed: number) => void;
  dispose: () => void;
} {
  const group = new THREE.Group();
  const ringGeo = new THREE.RingGeometry(0.32, 0.36, 36);
  ringGeo.rotateX(-Math.PI / 2);
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.65,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.position.y = 0.014;
  group.add(ring);

  const beamGeo = new THREE.CylinderGeometry(0.34, 0.38, 1.55, 28, 1, true);
  const beamMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.075,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const beam = new THREE.Mesh(beamGeo, beamMat);
  beam.position.y = 0.78;
  group.add(beam);

  return {
    group,
    update(elapsed: number) {
      ring.rotation.z = elapsed * 0.45;
      beamMat.opacity = 0.06 + Math.sin(elapsed * 2.2) * 0.025;
    },
    dispose() {
      ringGeo.dispose();
      ringMat.dispose();
      beamGeo.dispose();
      beamMat.dispose();
    },
  };
}

const _camLookTarget = new THREE.Vector3();

export class LobbyEngine {
  private container: HTMLElement;
  private callbacks: LobbyCallbacks;
  private isSoftwareGl: boolean;
  private maxAnisotropy: number;

  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;

  private keyLight: THREE.DirectionalLight;
  private hemiLight: THREE.HemisphereLight;
  private rimLight: THREE.DirectionalLight;
  private rectSoftbox: THREE.RectAreaLight | null = null;

  private stage: LobbyStageResult;
  private characterHolder: THREE.Group;
  private customGlb: LoadedGlbCharacter | null = null;
  private standbyBeacon: ReturnType<typeof createEmptyStandbyBeacon>;
  private glbAdjustments: GlbAdjustments = loadSavedAdjustments();

  private shadowTex: THREE.CanvasTexture;
  private shadowMesh: THREE.Mesh;
  private shadowGeo: THREE.PlaneGeometry;
  private shadowMat: THREE.MeshBasicMaterial;

  private clock = new THREE.Clock();
  private frameId = 0;
  private disposed = false;

  private activeEmote: LobbyEmoteId = 'lobby_ready';
  private emoteTimer = 0;
  private autoRotate = false;

  private characterYaw = 0.12;
  private targetCharacterYaw = 0.12;
  private camYaw = 0.04;
  private targetCamYaw = 0.04;
  private camPitch = CAMERA_PRESETS.full.pitch;
  private targetCamPitch = CAMERA_PRESETS.full.pitch;
  private camDist = CAMERA_PRESETS.full.dist;
  private targetCamDist = CAMERA_PRESETS.full.dist;
  private camTargetY = CAMERA_PRESETS.full.targetY;
  private targetCamTargetY = CAMERA_PRESETS.full.targetY;
  private camTargetX = CAMERA_PRESETS.full.targetX;
  private targetCamTargetX = CAMERA_PRESETS.full.targetX;
  private camFov = CAMERA_PRESETS.full.fov;
  private targetCamFov = CAMERA_PRESETS.full.fov;

  private activePointers = new Map<number, { x: number; y: number }>();
  private lastPinchDist = 0;

  constructor(container: HTMLElement, callbacks: LobbyCallbacks) {
    this.container = container;
    this.callbacks = callbacks;
    this.isSoftwareGl = detectSoftwareWebGL();

    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.04;
    this.renderer.setPixelRatio(
      this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2),
    );
    this.renderer.setSize(width, height);
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    container.appendChild(this.renderer.domElement);

    this.maxAnisotropy = this.renderer.capabilities.getMaxAnisotropy();

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x121016);
    this.scene.fog = new THREE.FogExp2(0x121016, 0.036);

    this.camera = new THREE.PerspectiveCamera(CAMERA_PRESETS.full.fov, width / height, 0.15, 120);

    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    const roomEnv = new RoomEnvironment();
    this.scene.environment = pmremGenerator.fromScene(roomEnv, 0.04).texture;
    this.scene.environmentIntensity = 0.62;
    roomEnv.dispose();
    pmremGenerator.dispose();

    this.hemiLight = new THREE.HemisphereLight(0x93c5fd, 0x261710, 0.56);
    this.scene.add(this.hemiLight);

    this.keyLight = new THREE.DirectionalLight(0xffcf99, 2.75);
    this.keyLight.position.set(3.8, 5.6, 4.4);
    this.keyLight.castShadow = !this.isSoftwareGl;
    this.keyLight.shadow.mapSize.set(1024, 1024);
    this.keyLight.shadow.camera.near = 0.5;
    this.keyLight.shadow.camera.far = 20;
    const d = 4.2;
    this.keyLight.shadow.camera.left = -d;
    this.keyLight.shadow.camera.right = d;
    this.keyLight.shadow.camera.top = d;
    this.keyLight.shadow.camera.bottom = -d;
    this.keyLight.shadow.bias = -0.0005;
    this.keyLight.shadow.normalBias = 0.02;
    this.scene.add(this.keyLight);
    this.scene.add(this.keyLight.target);

    this.rimLight = new THREE.DirectionalLight(0x38bdf8, 1.9);
    this.rimLight.position.set(-4.0, 3.6, -4.5);
    this.scene.add(this.rimLight);

    if (!this.isSoftwareGl) {
      RectAreaLightUniformsLib.init();
      this.rectSoftbox = new THREE.RectAreaLight(0xfff1db, 2.9, 3.2, 1.4);
      this.rectSoftbox.position.set(0, 4.4, 2.2);
      this.rectSoftbox.lookAt(0, 1.0, 0);
      this.scene.add(this.rectSoftbox);
    }

    this.stage = buildFreeFireLobbyStage(this.maxAnisotropy);
    this.scene.add(this.stage.group);

    this.characterHolder = new THREE.Group();
    this.characterHolder.name = 'LobbyHeroCharacter';
    this.characterHolder.position.set(0, 0, 0);
    this.characterHolder.rotation.y = this.characterYaw;
    this.scene.add(this.characterHolder);

    this.standbyBeacon = createEmptyStandbyBeacon();
    this.characterHolder.add(this.standbyBeacon.group);

    this.shadowTex = createContactShadowTexture();
    this.shadowGeo = new THREE.PlaneGeometry(1.15, 1.15);
    this.shadowGeo.rotateX(-Math.PI / 2);
    this.shadowMat = new THREE.MeshBasicMaterial({
      map: this.shadowTex,
      transparent: true,
      opacity: 0.65,
      depthWrite: false,
    });
    this.shadowMesh = new THREE.Mesh(this.shadowGeo, this.shadowMat);
    this.shadowMesh.position.y = 0.006;
    this.shadowMesh.visible = false;
    this.scene.add(this.shadowMesh);

    this.setLightingPreset('fire_dusk');
    this.updateCameraTransform();

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    this.bindEvents();
    void this.restoreSavedGlbCharacter();
    this.tick();
  }

  public getGlbAdjustments(): GlbAdjustments {
    return { ...this.glbAdjustments };
  }

  public setGlbAdjustments(next: Partial<GlbAdjustments>): void {
    this.glbAdjustments = { ...this.glbAdjustments, ...next };
    saveAdjustments(this.glbAdjustments);
    this.customGlb?.setAdjustments(this.glbAdjustments);
  }

  public resetGlbAdjustments(): void {
    this.glbAdjustments = { ...DEFAULT_GLB_ADJUSTMENTS };
    saveAdjustments(this.glbAdjustments);
    this.customGlb?.setAdjustments(this.glbAdjustments);
  }

  public setLightingPreset(preset: LobbyLightingPreset): void {
    this.stage.setLightingMood(preset);
    if (preset === 'night_ops') {
      (this.scene.background as THREE.Color).setHex(0x0b101b);
      (this.scene.fog as THREE.FogExp2).color.setHex(0x0b101b);
      this.keyLight.color.setHex(0xbae6fd);
      this.keyLight.intensity = 2.4;
      this.hemiLight.color.setHex(0x60a5fa);
      this.hemiLight.groundColor.setHex(0x0f172a);
      this.rimLight.color.setHex(0x38bdf8);
      this.rimLight.intensity = 2.25;
      if (this.rectSoftbox) this.rectSoftbox.color.setHex(0xdbeafe);
    } else if (preset === 'arena_gold') {
      (this.scene.background as THREE.Color).setHex(0x1b140d);
      (this.scene.fog as THREE.FogExp2).color.setHex(0x1b140d);
      this.keyLight.color.setHex(0xffe099);
      this.keyLight.intensity = 2.85;
      this.hemiLight.color.setHex(0xfde68a);
      this.hemiLight.groundColor.setHex(0x2a1f14);
      this.rimLight.color.setHex(0xf59e0b);
      this.rimLight.intensity = 1.95;
      if (this.rectSoftbox) this.rectSoftbox.color.setHex(0xfef3c7);
    } else {
      (this.scene.background as THREE.Color).setHex(0x161116);
      (this.scene.fog as THREE.FogExp2).color.setHex(0x161116);
      this.keyLight.color.setHex(0xffcb94);
      this.keyLight.intensity = 2.75;
      this.hemiLight.color.setHex(0x93c5fd);
      this.hemiLight.groundColor.setHex(0x261710);
      this.rimLight.color.setHex(0x38bdf8);
      this.rimLight.intensity = 1.9;
      if (this.rectSoftbox) this.rectSoftbox.color.setHex(0xffedd5);
    }
  }

  public setSquadSize(size: SquadSize): void {
    this.stage.setSquadSize(size);
  }

  public setCameraPreset(preset: LobbyCameraPreset): void {
    const p = CAMERA_PRESETS[preset];
    this.targetCamDist = p.dist;
    this.targetCamPitch = p.pitch;
    this.targetCamTargetY = p.targetY;
    this.targetCamTargetX = p.targetX;
    this.targetCamFov = p.fov;
    if (preset === 'squad') {
      this.targetCamYaw = 0.04;
      this.targetCharacterYaw = 0.06;
    } else if (preset === 'closeup') {
      this.targetCamYaw = 0.04;
      this.targetCharacterYaw = 0.1;
    } else {
      this.targetCamYaw = 0.04;
    }
  }

  public setAutoRotate(enabled: boolean): void {
    this.autoRotate = enabled;
  }

  public triggerEmote(emote: LobbyEmoteId): void {
    this.activeEmote = emote;
    this.emoteTimer =
      emote === 'lobby_ready' || emote === 'crouch_idle' || emote === 'rest' ? 0 : 4.2;
  }

  public resetCharacterRotation(): void {
    this.targetCharacterYaw = 0.12;
    this.setCameraPreset('full');
  }

  private async restoreSavedGlbCharacter(): Promise<void> {
    try {
      const saved = await loadCustomGlbFromStorage();
      if (!saved || this.disposed) return;
      const loaded = await parseGlbCharacterBuffer(saved.buffer, saved.name, this.maxAnisotropy);
      if (this.disposed) {
        loaded.dispose();
        return;
      }
      this.applyLoadedGlb(loaded);
      this.callbacks.onCharacterModelChange?.({
        name: saved.name,
        hasSkeleton: loaded.hasSkeleton,
        clipNames: loaded.clipNames,
      });
    } catch {
      // Ignore invalid cached data
    } finally {
      if (!this.disposed) {
        this.callbacks.onInitialLoadFinish?.();
      }
    }
  }

  private applyLoadedGlb(glb: LoadedGlbCharacter | null): void {
    if (this.customGlb) {
      this.characterHolder.remove(this.customGlb.root);
      this.customGlb.dispose();
      this.customGlb = null;
    }
    if (glb) {
      this.customGlb = glb;
      this.standbyBeacon.group.visible = false;
      this.shadowMesh.visible = true;
      glb.setAdjustments(this.glbAdjustments);
      this.characterHolder.add(glb.root);
      glb.update(this.activeEmote, 0, 0, 0.016, 0);
    } else {
      this.standbyBeacon.group.visible = true;
      this.shadowMesh.visible = false;
    }
  }

  public async loadCustomCharacterFile(file: File): Promise<void> {
    const buffer = await file.arrayBuffer();
    if (this.disposed) return;
    const loaded = await parseGlbCharacterBuffer(buffer.slice(0), file.name, this.maxAnisotropy);
    if (this.disposed) {
      loaded.dispose();
      return;
    }
    this.glbAdjustments = { ...DEFAULT_GLB_ADJUSTMENTS };
    saveAdjustments(this.glbAdjustments);
    this.applyLoadedGlb(loaded);
    await saveCustomGlbToStorage(file.name, buffer);
    this.callbacks.onCharacterModelChange?.({
      name: file.name,
      hasSkeleton: loaded.hasSkeleton,
      clipNames: loaded.clipNames,
    });
  }

  public async clearCustomCharacterModel(): Promise<void> {
    await clearCustomGlbFromStorage();
    if (this.disposed) return;
    this.applyLoadedGlb(null);
    this.callbacks.onCharacterModelChange?.(null);
  }

  private updateCameraTransform(): void {
    const cosP = Math.cos(this.camPitch);
    const sinP = Math.sin(this.camPitch);
    const cx = this.camTargetX + Math.sin(this.camYaw) * cosP * this.camDist;
    const cy = Math.max(0.28, this.camTargetY + sinP * this.camDist);
    const cz = Math.cos(this.camYaw) * cosP * this.camDist;

    this.camera.position.set(cx, cy, cz);
    _camLookTarget.set(this.camTargetX, this.camTargetY, 0);
    this.camera.lookAt(_camLookTarget);

    if (Math.abs(this.camera.fov - this.camFov) > 0.05) {
      this.camera.fov = this.camFov;
      this.camera.updateProjectionMatrix();
    }
  }

  private afterDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.disposed) return;
      const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  private tick = (): void => {
    if (this.disposed) return;

    const delta = this.clock.getDelta();
    const dt = Math.min(delta, 0.05);
    const elapsed = this.clock.getElapsedTime();

    if (this.emoteTimer > 0) {
      this.emoteTimer = Math.max(0, this.emoteTimer - dt);
      if (
        this.emoteTimer === 0 &&
        this.activeEmote !== 'crouch_idle' &&
        this.activeEmote !== 'rest'
      ) {
        this.activeEmote = 'lobby_ready';
      }
    }

    if (this.autoRotate && this.activePointers.size === 0) {
      this.targetCharacterYaw += dt * 0.45;
    }

    this.characterYaw = THREE.MathUtils.damp(this.characterYaw, this.targetCharacterYaw, 10, dt);
    this.characterHolder.rotation.y = this.characterYaw;
    this.characterHolder.updateMatrixWorld(true);

    this.camYaw = THREE.MathUtils.damp(this.camYaw, this.targetCamYaw, 9, dt);
    this.camPitch = THREE.MathUtils.damp(this.camPitch, this.targetCamPitch, 9, dt);
    this.camDist = THREE.MathUtils.damp(this.camDist, this.targetCamDist, 9, dt);
    this.camTargetY = THREE.MathUtils.damp(this.camTargetY, this.targetCamTargetY, 9, dt);
    this.camTargetX = THREE.MathUtils.damp(this.camTargetX, this.targetCamTargetX, 9, dt);
    this.camFov = THREE.MathUtils.damp(this.camFov, this.targetCamFov, 9, dt);
    this.updateCameraTransform();

    if (this.customGlb) {
      this.customGlb.update(this.activeEmote, 0, 0, dt, elapsed);
    } else {
      this.standbyBeacon.update(elapsed);
    }

    this.stage.update(dt, elapsed);
    this.renderer.render(this.scene, this.camera);

    if (this.isSoftwareGl) {
      this.afterDraw(this.tick);
    } else {
      this.frameId = requestAnimationFrame(this.tick);
    }
  };

  private onPointerDown = (e: PointerEvent): void => {
    this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.activePointers.size === 2) {
      const pts = Array.from(this.activePointers.values());
      this.lastPinchDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    }
  };

  private onPointerMove = (e: PointerEvent): void => {
    const prev = this.activePointers.get(e.pointerId);
    if (!prev) return;

    if (this.activePointers.size === 1) {
      const dx = e.clientX - prev.x;
      const dy = e.clientY - prev.y;
      this.targetCharacterYaw += dx * 0.0085;
      this.targetCamPitch = THREE.MathUtils.clamp(
        this.targetCamPitch + dy * 0.0038,
        -0.06,
        0.58,
      );
      this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    } else if (this.activePointers.size === 2) {
      this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const pts = Array.from(this.activePointers.values());
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      if (this.lastPinchDist > 0) {
        const delta = (this.lastPinchDist - dist) * 0.01;
        this.targetCamDist = THREE.MathUtils.clamp(this.targetCamDist + delta, 1.4, 6.2);
      }
      this.lastPinchDist = dist;
    }
  };

  private onPointerUp = (e: PointerEvent): void => {
    this.activePointers.delete(e.pointerId);
    if (this.activePointers.size < 2) {
      this.lastPinchDist = 0;
    }
  };

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    this.targetCamDist = THREE.MathUtils.clamp(this.targetCamDist + e.deltaY * 0.0028, 1.4, 6.2);
  };

  private onResize = (): void => {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  };

  private onContextLost = (e: Event): void => {
    e.preventDefault();
    this.callbacks.onContextLost?.();
  };

  private onContextRestored = (): void => {
    this.callbacks.onContextRestored?.();
  };

  private bindEvents(): void {
    const dom = this.renderer.domElement;
    window.addEventListener('resize', this.onResize);
    dom.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointercancel', this.onPointerUp);
    dom.addEventListener('wheel', this.onWheel, { passive: false });
    dom.addEventListener('webglcontextlost', this.onContextLost);
    dom.addEventListener('webglcontextrestored', this.onContextRestored);
  }

  public dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);

    const dom = this.renderer.domElement;
    window.removeEventListener('resize', this.onResize);
    dom.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('pointercancel', this.onPointerUp);
    dom.removeEventListener('wheel', this.onWheel);
    dom.removeEventListener('webglcontextlost', this.onContextLost);
    dom.removeEventListener('webglcontextrestored', this.onContextRestored);

    this.customGlb?.dispose();
    this.standbyBeacon.dispose();
    this.shadowGeo.dispose();
    this.shadowMat.dispose();
    this.shadowTex.dispose();
    this.stage.dispose();
    this.renderer.dispose();

    if (dom.parentNode === this.container) {
      this.container.removeChild(dom);
    }
  }
}
