/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { LobbyHUD } from './components/LobbyHUD';
import {
  playLobbyClickSound,
  playMatchFoundSound,
  playStartQueueSound,
} from './world/LobbyAudio';
import {
  DEFAULT_GLB_ADJUSTMENTS,
  LobbyCharacterMeta,
  LobbyEngine,
} from './world/LobbyEngine';
import {
  GameMapId,
  GameModeId,
  GlbAdjustments,
  LobbyCameraPreset,
  LobbyEmoteId,
  LobbyLightingPreset,
  SquadSize,
} from './world/types';

const MAP_STORAGE_KEY = 'strike_zone_india_state_map_v1';

const VALID_INDIA_MAPS = new Set<GameMapId>([
  'uttar_pradesh',
  'maharashtra',
  'bihar',
  'west_bengal',
  'madhya_pradesh',
  'tamil_nadu',
  'rajasthan',
  'karnataka',
  'gujarat',
  'andhra_pradesh',
]);

function loadSavedMap(): GameMapId {
  try {
    const raw = localStorage.getItem(MAP_STORAGE_KEY) as GameMapId | null;
    if (raw && VALID_INDIA_MAPS.has(raw)) {
      return raw;
    }
  } catch {
    // Ignore storage errors
  }
  return 'uttar_pradesh';
}

export default function App() {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<LobbyEngine | null>(null);

  const [playerName, setPlayerName] = useState('STRIKER_01');
  const [characterMeta, setCharacterMeta] = useState<LobbyCharacterMeta | null>(null);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isLoadingCharacter, setIsLoadingCharacter] = useState(false);
  const [characterError, setCharacterError] = useState<string | null>(null);
  const [isDraggingGlb, setIsDraggingGlb] = useState(false);
  const [contextLost, setContextLost] = useState(false);

  const [glbAdjustments, setGlbAdjustments] = useState<GlbAdjustments>(DEFAULT_GLB_ADJUSTMENTS);
  const [activeEmote, setActiveEmote] = useState<LobbyEmoteId>('lobby_ready');
  const [lightingPreset, setLightingPreset] = useState<LobbyLightingPreset>('fire_dusk');
  const [cameraPreset, setCameraPreset] = useState<LobbyCameraPreset>('full');
  const [autoRotate, setAutoRotate] = useState(false);

  const [squadSize, setSquadSize] = useState<SquadSize>('solo');
  const [gameMode, setGameMode] = useState<GameModeId>('br_ranked');
  const [gameMap, setGameMap] = useState<GameMapId>(() => loadSavedMap());
  const [soundEnabled, setSoundEnabled] = useState(true);

  const [queueState, setQueueState] = useState<'idle' | 'searching' | 'found'>('idle');
  const [queueSeconds, setQueueSeconds] = useState(0);

  useEffect(() => {
    const mountEl = canvasMountRef.current;
    if (!mountEl) return;

    const engine = new LobbyEngine(mountEl, {
      onCharacterModelChange: (meta) => {
        setCharacterMeta(meta);
        setGlbAdjustments(engine.getGlbAdjustments());
      },
      onInitialLoadFinish: () => {
        setIsInitialLoading(false);
      },
      onContextLost: () => setContextLost(true),
      onContextRestored: () => setContextLost(false),
    });

    engineRef.current = engine;
    setGlbAdjustments(engine.getGlbAdjustments());

    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (queueState !== 'searching') return;
    const timer = window.setInterval(() => {
      setQueueSeconds((prev) => {
        const next = prev + 1;
        if (next >= 3) {
          setQueueState('found');
          if (soundEnabled) playMatchFoundSound();
          return 3;
        }
        return next;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [queueState, soundEnabled]);

  const playClick = useCallback(() => {
    if (soundEnabled) playLobbyClickSound();
  }, [soundEnabled]);

  const handleLoadCharacterFile = useCallback(
    async (file: File) => {
      const header = new Uint8Array(await file.slice(0, 4).arrayBuffer());
      const isGlbMagic =
        header.length === 4 &&
        header[0] === 0x67 &&
        header[1] === 0x6c &&
        header[2] === 0x54 &&
        header[3] === 0x46;
      if (!isGlbMagic && !/\.(glb|gltf)$/i.test(file.name)) {
        setCharacterError('Choose a valid .glb or .gltf 3D character file.');
        return;
      }
      setCharacterError(null);
      setIsLoadingCharacter(true);
      try {
        await engineRef.current?.loadCustomCharacterFile(file);
        if (soundEnabled) playLobbyClickSound();
      } catch (err) {
        const msg = err instanceof Error && err.message ? err.message : 'Could not load that .glb file.';
        setCharacterError(`${msg} Make sure it is a single self-contained .glb file.`);
      } finally {
        setIsLoadingCharacter(false);
      }
    },
    [soundEnabled],
  );

  const handleClearCharacterModel = useCallback(async () => {
    setCharacterError(null);
    await engineRef.current?.clearCustomCharacterModel();
    playClick();
  }, [playClick]);

  const handleChangeGlbAdjustments = useCallback((next: Partial<GlbAdjustments>) => {
    engineRef.current?.setGlbAdjustments(next);
    setGlbAdjustments((prev) => ({ ...prev, ...next }));
  }, []);

  const handleResetGlbAdjustments = useCallback(() => {
    engineRef.current?.resetGlbAdjustments();
    setGlbAdjustments({ ...DEFAULT_GLB_ADJUSTMENTS });
    playClick();
  }, [playClick]);

  const handleTriggerEmote = useCallback(
    (emote: LobbyEmoteId) => {
      setActiveEmote(emote);
      engineRef.current?.triggerEmote(emote);
      playClick();
    },
    [playClick],
  );

  const handleChangeLighting = useCallback(
    (preset: LobbyLightingPreset) => {
      setLightingPreset(preset);
      engineRef.current?.setLightingPreset(preset);
      playClick();
    },
    [playClick],
  );

  const handleChangeCameraPreset = useCallback(
    (preset: LobbyCameraPreset) => {
      setCameraPreset(preset);
      engineRef.current?.setCameraPreset(preset);
      playClick();
    },
    [playClick],
  );

  const handleToggleAutoRotate = useCallback(() => {
    setAutoRotate((prev) => {
      const next = !prev;
      engineRef.current?.setAutoRotate(next);
      return next;
    });
    playClick();
  }, [playClick]);

  const handleResetCamera = useCallback(() => {
    setCameraPreset('full');
    engineRef.current?.resetCharacterRotation();
    playClick();
  }, [playClick]);

  const handleChangeSquadSize = useCallback(
    (size: SquadSize) => {
      setSquadSize(size);
      engineRef.current?.setSquadSize(size);
      if (size === 'squad' || size === 'duo') {
        setCameraPreset('squad');
        engineRef.current?.setCameraPreset('squad');
      } else {
        setCameraPreset('full');
        engineRef.current?.setCameraPreset('full');
      }
      playClick();
    },
    [playClick],
  );

  const handleChangeGameMode = useCallback(
    (mode: GameModeId) => {
      setGameMode(mode);
      playClick();
    },
    [playClick],
  );

  const handleChangeGameMap = useCallback(
    (mapId: GameMapId) => {
      setGameMap(mapId);
      try {
        localStorage.setItem(MAP_STORAGE_KEY, mapId);
      } catch {
        // Ignore storage errors
      }
      playClick();
    },
    [playClick],
  );

  const handleStartQueue = useCallback(() => {
    setQueueSeconds(0);
    setQueueState('searching');
    if (soundEnabled) playStartQueueSound();
  }, [soundEnabled]);

  const handleCancelQueue = useCallback(() => {
    setQueueState('idle');
    setQueueSeconds(0);
    playClick();
  }, [playClick]);

  const handleDismissMatchFound = useCallback(() => {
    setQueueState('idle');
    setQueueSeconds(0);
    playClick();
  }, [playClick]);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLElement>) => {
    if (e.dataTransfer?.types?.includes('Files')) {
      e.preventDefault();
      setIsDraggingGlb(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLElement>) => {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    setIsDraggingGlb(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLElement>) => {
      e.preventDefault();
      setIsDraggingGlb(false);
      const file = e.dataTransfer?.files?.[0];
      if (file) {
        void handleLoadCharacterFile(file);
      }
    },
    [handleLoadCharacterFile],
  );

  return (
    <main
      className="relative w-screen h-screen bg-[#0c0d12] overflow-hidden"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div
        ref={canvasMountRef}
        className="w-full h-full touch-none"
        aria-label="Free Fire Style 3D Lobby Viewport"
      />

      {isDraggingGlb && (
        <div className="fixed inset-0 z-50 pointer-events-none flex items-center justify-center bg-slate-950/82 border-4 border-dashed border-amber-400">
          <div className="lobby-chamfer bg-[#0d1017] border border-amber-400/70 px-7 py-5 text-center shadow-2xl">
            <div className="text-lg font-display font-bold text-white uppercase">
              Drop .glb Character File
            </div>
            <div className="mt-1 text-xs text-amber-300">
              Release to place Police_Male_02.glb on the lobby pedestal
            </div>
          </div>
        </div>
      )}

      {contextLost && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/90 text-slate-100 p-6 text-center">
          <div className="max-w-sm rounded-2xl border border-white/15 bg-slate-900 p-6">
            <h2 className="text-lg font-display font-semibold">3D Graphics Context Paused</h2>
            <p className="mt-2 text-sm text-slate-300">
              WebGL context was temporarily suspended by the browser. Reload the page to resume the lobby.
            </p>
          </div>
        </div>
      )}

      <LobbyHUD
        playerName={playerName}
        onChangePlayerName={setPlayerName}
        characterMeta={characterMeta}
        isInitialLoading={isInitialLoading}
        isLoadingCharacter={isLoadingCharacter}
        characterError={characterError}
        onClearCharacterError={() => setCharacterError(null)}
        onLoadCharacterFile={handleLoadCharacterFile}
        onClearCharacterModel={handleClearCharacterModel}
        glbAdjustments={glbAdjustments}
        onChangeGlbAdjustments={handleChangeGlbAdjustments}
        onResetGlbAdjustments={handleResetGlbAdjustments}
        activeEmote={activeEmote}
        onTriggerEmote={handleTriggerEmote}
        lightingPreset={lightingPreset}
        onChangeLighting={handleChangeLighting}
        cameraPreset={cameraPreset}
        onChangeCameraPreset={handleChangeCameraPreset}
        autoRotate={autoRotate}
        onToggleAutoRotate={handleToggleAutoRotate}
        onResetCamera={handleResetCamera}
        squadSize={squadSize}
        onChangeSquadSize={handleChangeSquadSize}
        gameMode={gameMode}
        onChangeGameMode={handleChangeGameMode}
        gameMap={gameMap}
        onChangeGameMap={handleChangeGameMap}
        soundEnabled={soundEnabled}
        onToggleSound={() => setSoundEnabled((s) => !s)}
        queueState={queueState}
        queueSeconds={queueSeconds}
        onStartQueue={handleStartQueue}
        onCancelQueue={handleCancelQueue}
        onDismissMatchFound={handleDismissMatchFound}
      />
    </main>
  );
}
