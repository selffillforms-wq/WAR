import * as THREE from 'three';
import { LobbyLightingPreset, SquadSize } from './types';

export interface LobbyStageResult {
  group: THREE.Group;
  turntableGroup: THREE.Group;
  setSquadSize: (size: SquadSize) => void;
  setLightingMood: (preset: LobbyLightingPreset) => void;
  update: (delta: number, elapsed: number) => void;
  dispose: () => void;
}

function createSteelDeckTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#141922';
    ctx.fillRect(0, 0, 512, 512);

    // Subtle brushed steel floor panels
    const step = 128;
    for (let y = 0; y < 512; y += step) {
      for (let x = 0; x < 512; x += step) {
        const alt = ((x / step + y / step) % 2) === 0;
        ctx.fillStyle = alt ? '#181e28' : '#121720';
        ctx.fillRect(x + 2, y + 2, step - 4, step - 4);

        // Tactical diamond tread micro-marks
        ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
        for (let ty = y + 14; ty < y + step - 10; ty += 16) {
          for (let tx = x + 14; tx < x + step - 10; tx += 16) {
            ctx.fillRect(tx, ty, 5, 2);
          }
        }
      }
    }

    ctx.strokeStyle = 'rgba(245, 158, 11, 0.14)';
    ctx.lineWidth = 2;
    for (let i = 0; i <= 512; i += step) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, 512);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(512, i);
      ctx.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(14, 14);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(8, Math.max(1, maxAnisotropy));
  return tex;
}

function createHazardStripeTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#1b1f26';
    ctx.fillRect(0, 0, 256, 256);

    ctx.save();
    ctx.fillStyle = '#f59e0b';
    for (let i = -256; i < 512; i += 48) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i + 24, 0);
      ctx.lineTo(i - 104, 256);
      ctx.lineTo(i - 128, 256);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    // Dark center band
    ctx.fillStyle = '#1f252e';
    ctx.fillRect(0, 48, 256, 160);
    ctx.fillStyle = '#d97706';
    ctx.fillRect(0, 44, 256, 5);
    ctx.fillRect(0, 207, 256, 5);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(8, Math.max(1, maxAnisotropy));
  return tex;
}

function createEmberTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
    grad.addColorStop(0, 'rgba(255, 240, 195, 1)');
    grad.addColorStop(0.32, 'rgba(251, 146, 60, 0.85)');
    grad.addColorStop(1, 'rgba(251, 146, 60, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function buildFreeFireLobbyStage(maxAnisotropy: number): LobbyStageResult {
  const group = new THREE.Group();
  group.name = 'FreeFireLobbyStage';

  const disposables: { dispose: () => void }[] = [];
  const track = <T extends { dispose: () => void }>(item: T): T => {
    disposables.push(item);
    return item;
  };

  const steelTex = track(createSteelDeckTexture(maxAnisotropy));
  const hazardTex = track(createHazardStripeTexture(maxAnisotropy));
  const emberTex = track(createEmberTexture());

  // --- Shared PBR Material Palette ---
  const deckFloorMat = track(
    new THREE.MeshStandardMaterial({
      map: steelTex,
      roughness: 0.42,
      metalness: 0.68,
      envMapIntensity: 0.9,
    }),
  );
  const armorSteelMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x222936,
      roughness: 0.34,
      metalness: 0.82,
      envMapIntensity: 1.0,
    }),
  );
  const darkCarbonMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x11151d,
      roughness: 0.64,
      metalness: 0.25,
    }),
  );
  const crateBodyMat = track(
    new THREE.MeshStandardMaterial({
      map: hazardTex,
      roughness: 0.48,
      metalness: 0.45,
    }),
  );
  const crateRedMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x991b1b,
      roughness: 0.45,
      metalness: 0.38,
    }),
  );
  const accentGlowMat = track(
    new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      emissive: 0xf97316,
      emissiveIntensity: 1.85,
      roughness: 0.25,
      metalness: 0.2,
    }),
  );
  const cyanHoloMat = track(
    new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0ea5e9,
      emissiveIntensity: 1.35,
      roughness: 0.2,
      transparent: true,
      opacity: 0.72,
    }),
  );

  // --- 1. Extended Hangar Floor Deck (top flush at y = -0.14 so main pedestal rises cleanly to y = 0.00) ---
  const floorGeo = track(new THREE.CylinderGeometry(48, 48, 0.2, 48));
  const floorMesh = new THREE.Mesh(floorGeo, deckFloorMat);
  floorMesh.position.y = -0.24;
  floorMesh.receiveShadow = true;
  group.add(floorMesh);

  // --- 2. Central Hero Turntable Pedestal (top surface EXACT y = 0.000) ---
  const turntableGroup = new THREE.Group();
  turntableGroup.name = 'HeroTurntable';
  group.add(turntableGroup);

  // Outer chamfered armored octagon base
  const outerBaseGeo = track(new THREE.CylinderGeometry(1.62, 1.86, 0.14, 8));
  const outerBase = new THREE.Mesh(outerBaseGeo, armorSteelMat);
  outerBase.position.y = -0.07;
  outerBase.receiveShadow = true;
  outerBase.castShadow = true;
  turntableGroup.add(outerBase);

  // Inner carbon foot-deck (top surface at y = 0.000)
  const topDeckGeo = track(new THREE.CylinderGeometry(1.36, 1.44, 0.03, 24));
  const topDeck = new THREE.Mesh(topDeckGeo, darkCarbonMat);
  topDeck.position.y = -0.015;
  topDeck.receiveShadow = true;
  turntableGroup.add(topDeck);

  // Glowing perimeter tactical ring (polygonOffset prevents any z-fighting)
  const ringMat = track(
    new THREE.MeshStandardMaterial({
      color: 0xfbbf24,
      emissive: 0xf59e0b,
      emissiveIntensity: 2.1,
      roughness: 0.2,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    }),
  );
  const heroRingGeo = track(new THREE.RingGeometry(1.34, 1.41, 48));
  heroRingGeo.rotateX(-Math.PI / 2);
  const heroRing = new THREE.Mesh(heroRingGeo, ringMat);
  heroRing.position.y = 0.004;
  turntableGroup.add(heroRing);

  // Rotating segmented outer holographic scan ring
  const scanRingGroup = new THREE.Group();
  scanRingGroup.position.y = 0.006;
  const arcGeo = track(new THREE.RingGeometry(1.47, 1.54, 16, 1, 0, Math.PI * 0.34));
  arcGeo.rotateX(-Math.PI / 2);
  for (let i = 0; i < 4; i++) {
    const seg = new THREE.Mesh(arcGeo, i % 2 === 0 ? accentGlowMat : cyanHoloMat);
    seg.rotation.y = (i * Math.PI) / 2;
    scanRingGroup.add(seg);
  }
  turntableGroup.add(scanRingGroup);

  // 8 pedestal corner anchor lugs
  const lugGeo = track(new THREE.BoxGeometry(0.18, 0.09, 0.34));
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const lug = new THREE.Mesh(lugGeo, armorSteelMat);
    lug.position.set(Math.sin(angle) * 1.62, -0.05, Math.cos(angle) * 1.62);
    lug.rotation.y = angle;
    lug.castShadow = true;
    lug.receiveShadow = true;
    turntableGroup.add(lug);
  }

  // --- 3. Flanking Duo / Squad Holographic Pads ---
  const squadPads: { group: THREE.Group; ringMat: THREE.MeshStandardMaterial; beam: THREE.Mesh }[] = [];
  const squadPositions: [number, number][] = [
    [-1.95, -0.78],
    [1.95, -0.78],
    [-3.1, -1.45],
  ];
  const sqBaseGeo = track(new THREE.CylinderGeometry(0.68, 0.82, 0.08, 8));
  const sqRingGeo = track(new THREE.RingGeometry(0.56, 0.64, 32));
  sqRingGeo.rotateX(-Math.PI / 2);
  const sqBeamGeo = track(new THREE.CylinderGeometry(0.54, 0.62, 1.75, 24, 1, true));

  for (let i = 0; i < squadPositions.length; i++) {
    const [sx, sz] = squadPositions[i];
    const sqGroup = new THREE.Group();
    sqGroup.position.set(sx, -0.1, sz);

    const sqBase = new THREE.Mesh(sqBaseGeo, armorSteelMat);
    sqBase.castShadow = true;
    sqBase.receiveShadow = true;
    sqGroup.add(sqBase);

    const sqRingMat = track(
      new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        emissive: 0x0ea5e9,
        emissiveIntensity: 0.8,
        transparent: true,
        opacity: 0.25,
      }),
    );
    const sqRing = new THREE.Mesh(sqRingGeo, sqRingMat);
    sqRing.position.y = 0.044;
    sqGroup.add(sqRing);

    const sqBeamMat = track(
      new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.0,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    disposables.push(sqBeamMat);
    const beam = new THREE.Mesh(sqBeamGeo, sqBeamMat);
    beam.position.y = 0.92;
    sqGroup.add(beam);

    group.add(sqGroup);
    squadPads.push({ group: sqGroup, ringMat: sqRingMat, beam });
  }

  // --- 4. Composite Supply Airdrop Crate (Stage Left-Back, 6 parts) ---
  const crateGroup = new THREE.Group();
  crateGroup.position.set(-2.75, -0.14, -2.85);
  crateGroup.rotation.y = 0.48;

  const crateHullGeo = track(new THREE.BoxGeometry(1.18, 1.12, 1.18));
  const crateHull = new THREE.Mesh(crateHullGeo, crateRedMat);
  crateHull.position.y = 0.56;
  crateHull.castShadow = true;
  crateHull.receiveShadow = true;
  crateGroup.add(crateHull);

  const crateLidGeo = track(new THREE.BoxGeometry(1.26, 0.16, 1.26));
  const crateLid = new THREE.Mesh(crateLidGeo, armorSteelMat);
  crateLid.position.y = 1.15;
  crateLid.castShadow = true;
  crateGroup.add(crateLid);

  const crateBandGeo = track(new THREE.BoxGeometry(1.22, 0.24, 1.22));
  const crateBand = new THREE.Mesh(crateBandGeo, crateBodyMat);
  crateBand.position.y = 0.56;
  crateGroup.add(crateBand);

  const crateCornerGeo = track(new THREE.BoxGeometry(0.12, 1.14, 0.12));
  for (const cx of [-0.56, 0.56]) {
    for (const cz of [-0.56, 0.56]) {
      const post = new THREE.Mesh(crateCornerGeo, armorSteelMat);
      post.position.set(cx, 0.57, cz);
      crateGroup.add(post);
    }
  }
  const crateBeaconGeo = track(new THREE.CylinderGeometry(0.14, 0.18, 0.08, 12));
  const crateBeacon = new THREE.Mesh(crateBeaconGeo, accentGlowMat);
  crateBeacon.position.y = 1.26;
  crateGroup.add(crateBeacon);
  group.add(crateGroup);

  // --- 5. Tactical Gear & Ammo Cases (Stage Right-Back, 5 parts) ---
  const gearGroup = new THREE.Group();
  gearGroup.position.set(2.9, -0.14, -2.7);
  gearGroup.rotation.y = -0.45;

  const caseAGeo = track(new THREE.BoxGeometry(1.2, 0.52, 0.72));
  const caseA = new THREE.Mesh(caseAGeo, armorSteelMat);
  caseA.position.y = 0.26;
  caseA.castShadow = true;
  caseA.receiveShadow = true;
  gearGroup.add(caseA);

  const caseBGeo = track(new THREE.BoxGeometry(0.76, 0.36, 0.54));
  const caseB = new THREE.Mesh(caseBGeo, darkCarbonMat);
  caseB.position.set(-0.15, 0.7, 0);
  caseB.rotation.y = 0.15;
  caseB.castShadow = true;
  gearGroup.add(caseB);

  const stripGeo = track(new THREE.BoxGeometry(1.22, 0.05, 0.74));
  const strip = new THREE.Mesh(stripGeo, crateBodyMat);
  strip.position.y = 0.38;
  gearGroup.add(strip);

  const barrelGeo = track(new THREE.CylinderGeometry(0.28, 0.28, 0.88, 16));
  const barrel = new THREE.Mesh(barrelGeo, crateRedMat);
  barrel.position.set(0.95, 0.44, 0.15);
  barrel.castShadow = true;
  barrel.receiveShadow = true;
  gearGroup.add(barrel);

  const barrelRimGeo = track(new THREE.TorusGeometry(0.285, 0.022, 8, 20));
  barrelRimGeo.rotateX(Math.PI / 2);
  for (const by of [0.16, 0.56, 0.86]) {
    const rim = new THREE.Mesh(barrelRimGeo, armorSteelMat);
    rim.position.set(0.95, by, 0.15);
    gearGroup.add(rim);
  }
  group.add(gearGroup);

  // --- 6. Background Armored Hangar Framing Arches & Floodlight Towers ---
  const hangarArchGroup = new THREE.Group();
  const pylonGeo = track(new THREE.BoxGeometry(0.55, 6.2, 0.72));
  const strutGeo = track(new THREE.BoxGeometry(0.32, 3.6, 0.42));
  const lightBarGeo = track(new THREE.BoxGeometry(0.1, 4.6, 0.08));
  const trussGeo = track(new THREE.BoxGeometry(11.6, 0.45, 0.65));

  for (const [px, pz, yaw] of [
    [-4.8, -5.8, 0.24],
    [4.8, -5.8, -0.24],
    [-8.2, -9.2, 0.35],
    [8.2, -9.2, -0.35],
  ] as [number, number, number][]) {
    const tower = new THREE.Group();
    tower.position.set(px, -0.14, pz);
    tower.rotation.y = yaw;

    const pylon = new THREE.Mesh(pylonGeo, armorSteelMat);
    pylon.position.y = 3.1;
    pylon.castShadow = true;
    tower.add(pylon);

    const strut = new THREE.Mesh(strutGeo, darkCarbonMat);
    strut.position.set(px < 0 ? 0.42 : -0.42, 1.5, 0.3);
    strut.rotation.z = px < 0 ? -0.24 : 0.24;
    tower.add(strut);

    const lightBar = new THREE.Mesh(lightBarGeo, accentGlowMat);
    lightBar.position.set(px < 0 ? 0.3 : -0.3, 2.8, 0.32);
    tower.add(lightBar);

    hangarArchGroup.add(tower);
  }

  // Overhead hangar truss & backlit banner frame
  const trussA = new THREE.Mesh(trussGeo, armorSteelMat);
  trussA.position.set(0, 5.95, -5.8);
  hangarArchGroup.add(trussA);

  const overheadStripGeo = track(new THREE.BoxGeometry(7.2, 0.09, 0.18));
  const overheadStrip = new THREE.Mesh(overheadStripGeo, cyanHoloMat);
  overheadStrip.position.set(0, 5.68, -5.6);
  hangarArchGroup.add(overheadStrip);
  group.add(hangarArchGroup);

  // --- 7. Atmospheric Rising Fire Embers (Zero-GC typed array particles) ---
  const emberCount = 110;
  const emberPositions = new Float32Array(emberCount * 3);
  const emberSpeeds = new Float32Array(emberCount);
  const emberOffsets = new Float32Array(emberCount);

  let seed = 7391;
  const nextRand = () => {
    seed = (seed * 1664525 + 1013904223) | 0;
    return ((seed >>> 0) % 100000) / 100000;
  };

  for (let i = 0; i < emberCount; i++) {
    emberPositions[i * 3] = (nextRand() - 0.5) * 14;
    emberPositions[i * 3 + 1] = nextRand() * 5.2;
    emberPositions[i * 3 + 2] = -7.5 + nextRand() * 10.5;
    emberSpeeds[i] = 0.25 + nextRand() * 0.55;
    emberOffsets[i] = nextRand() * Math.PI * 2;
  }

  const emberGeo = track(new THREE.BufferGeometry());
  const emberPosAttr = new THREE.BufferAttribute(emberPositions, 3);
  emberGeo.setAttribute('position', emberPosAttr);

  const emberMat = track(
    new THREE.PointsMaterial({
      size: 0.11,
      map: emberTex,
      transparent: true,
      opacity: 0.78,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  const embers = new THREE.Points(emberGeo, emberMat);
  embers.frustumCulled = false;
  group.add(embers);

  return {
    group,
    turntableGroup,
    setSquadSize(size: SquadSize) {
      const activeCount = size === 'solo' ? 0 : size === 'duo' ? 1 : 3;
      for (let i = 0; i < squadPads.length; i++) {
        const active = i < activeCount;
        squadPads[i].ringMat.opacity = active ? 0.92 : 0.22;
        squadPads[i].ringMat.emissiveIntensity = active ? 2.0 : 0.35;
        const beamMat = squadPads[i].beam.material as THREE.MeshBasicMaterial;
        beamMat.opacity = active ? 0.14 : 0.0;
      }
    },
    setLightingMood(preset: LobbyLightingPreset) {
      if (preset === 'night_ops') {
        accentGlowMat.color.setHex(0x38bdf8);
        accentGlowMat.emissive.setHex(0x0284c7);
        ringMat.color.setHex(0x38bdf8);
        ringMat.emissive.setHex(0x0ea5e9);
        emberMat.color.setHex(0x7dd3fc);
      } else if (preset === 'arena_gold') {
        accentGlowMat.color.setHex(0xfacc15);
        accentGlowMat.emissive.setHex(0xeab308);
        ringMat.color.setHex(0xfde047);
        ringMat.emissive.setHex(0xf59e0b);
        emberMat.color.setHex(0xfef08a);
      } else {
        accentGlowMat.color.setHex(0xf59e0b);
        accentGlowMat.emissive.setHex(0xf97316);
        ringMat.color.setHex(0xfbbf24);
        ringMat.emissive.setHex(0xf59e0b);
        emberMat.color.setHex(0xfdba74);
      }
    },
    update(delta: number, elapsed: number) {
      const dt = Math.min(delta, 0.05);
      scanRingGroup.rotation.y += dt * 0.42;

      for (let i = 0; i < emberCount; i++) {
        const idx = i * 3;
        emberPositions[idx + 1] += emberSpeeds[i] * dt;
        emberPositions[idx] += Math.sin(elapsed * 1.1 + emberOffsets[i]) * 0.14 * dt;
        if (emberPositions[idx + 1] > 5.4) {
          emberPositions[idx + 1] = 0.05;
        }
      }
      emberPosAttr.needsUpdate = true;
    },
    dispose() {
      for (const d of disposables) d.dispose();
    },
  };
}
