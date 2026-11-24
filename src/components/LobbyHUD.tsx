import React, { useEffect, useRef, useState } from 'react';
import {
  Camera,
  Check,
  ChevronUp,
  Coins,
  Crosshair,
  Diamond,
  Eye,
  EyeOff,
  FlipHorizontal,
  MapPin,
  Play,
  RotateCcw,
  RotateCw,
  Shield,
  Smile,
  Sparkles,
  Upload,
  UserCheck,
  Users,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { INDIA_ALL_STATES_OUTLINE, INDIA_TOP_10_STATES } from '../data/indiaStatesMaps';
import { LobbyCharacterMeta } from '../world/LobbyEngine';
import {
  GameMapId,
  GameModeId,
  GlbAdjustments,
  LobbyCameraPreset,
  LobbyEmoteId,
  LobbyLightingPreset,
  SquadSize,
} from '../world/types';

export type LobbyDrawerTab = 'character' | 'emotes' | 'stage' | null;

interface LobbyHUDProps {
  playerName: string;
  onChangePlayerName: (name: string) => void;
  characterMeta: LobbyCharacterMeta | null;
  isInitialLoading: boolean;
  isLoadingCharacter: boolean;
  characterError: string | null;
  onClearCharacterError: () => void;
  onLoadCharacterFile: (file: File) => void;
  onClearCharacterModel: () => void;
  glbAdjustments: GlbAdjustments;
  onChangeGlbAdjustments: (next: Partial<GlbAdjustments>) => void;
  onResetGlbAdjustments: () => void;
  activeEmote: LobbyEmoteId;
  onTriggerEmote: (emote: LobbyEmoteId) => void;
  lightingPreset: LobbyLightingPreset;
  onChangeLighting: (preset: LobbyLightingPreset) => void;
  cameraPreset: LobbyCameraPreset;
  onChangeCameraPreset: (preset: LobbyCameraPreset) => void;
  autoRotate: boolean;
  onToggleAutoRotate: () => void;
  onResetCamera: () => void;
  squadSize: SquadSize;
  onChangeSquadSize: (size: SquadSize) => void;
  gameMode: GameModeId;
  onChangeGameMode: (mode: GameModeId) => void;
  gameMap: GameMapId;
  onChangeGameMap: (mapId: GameMapId) => void;
  soundEnabled: boolean;
  onToggleSound: () => void;
  queueState: 'idle' | 'searching' | 'found';
  queueSeconds: number;
  onStartQueue: () => void;
  onCancelQueue: () => void;
  onDismissMatchFound: () => void;
}

const GAME_MODES: { id: GameModeId; label: string; tag: string }[] = [
  { id: 'br_ranked', label: 'Battle Royale', tag: '50 Players' },
  { id: 'clash_squad', label: 'Clash Squad', tag: '4v4 Ranked' },
  { id: 'lone_wolf', label: 'Lone Wolf', tag: '1v1 Cage' },
  { id: 'training', label: 'Training', tag: 'Target Range' },
];

const EMOTES: { id: LobbyEmoteId; label: string }[] = [
  { id: 'lobby_ready', label: 'Ready Stance' },
  { id: 'emote_salute', label: 'Officer Salute' },
  { id: 'emote_booyah', label: 'Booyah Victory' },
  { id: 'emote_warmup', label: 'Combat Warmup' },
  { id: 'crouch_idle', label: 'Tactical Cover' },
  { id: 'rest', label: 'Original Pose' },
];

function formatQueueClock(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export const LobbyHUD: React.FC<LobbyHUDProps> = ({
  playerName,
  onChangePlayerName,
  characterMeta,
  isInitialLoading,
  isLoadingCharacter,
  characterError,
  onClearCharacterError,
  onLoadCharacterFile,
  onClearCharacterModel,
  glbAdjustments,
  onChangeGlbAdjustments,
  onResetGlbAdjustments,
  activeEmote,
  onTriggerEmote,
  lightingPreset,
  onChangeLighting,
  cameraPreset,
  onChangeCameraPreset,
  autoRotate,
  onToggleAutoRotate,
  onResetCamera,
  squadSize,
  onChangeSquadSize,
  gameMode,
  onChangeGameMode,
  gameMap,
  onChangeGameMap,
  soundEnabled,
  onToggleSound,
  queueState,
  queueSeconds,
  onStartQueue,
  onCancelQueue,
  onDismissMatchFound,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [activeDrawer, setActiveDrawer] = useState<LobbyDrawerTab>(null);
  const [zenMode, setZenMode] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState(playerName);
  const [modeMenuOpen, setModeMenuOpen] = useState(false);
  const [mapMenuOpen, setMapMenuOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT') return;
      if (e.code === 'KeyH') setZenMode((v) => !v);
      if (e.code === 'Escape') {
        setActiveDrawer(null);
        setModeMenuOpen(false);
        setMapMenuOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const handleOpenFilePicker = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onLoadCharacterFile(file);
    e.target.value = '';
  };

  const toggleDrawer = (tab: Exclude<LobbyDrawerTab, null>) => {
    setActiveDrawer((prev) => (prev === tab ? null : tab));
  };

  const saveName = () => {
    const trimmed = draftName.trim();
    if (trimmed.length >= 2) {
      onChangePlayerName(trimmed.slice(0, 16));
    } else {
      setDraftName(playerName);
    }
    setEditingName(false);
  };

  const currentModeObj = GAME_MODES.find((m) => m.id === gameMode) ?? GAME_MODES[0];
  const currentMapObj =
    INDIA_TOP_10_STATES.find((m) => m.id === gameMap) ?? INDIA_TOP_10_STATES[0];

  return (
    <div className="fixed inset-0 pointer-events-none z-10 overflow-hidden">
      <input
        ref={fileInputRef}
        type="file"
        accept=".glb,.gltf"
        onChange={handleFileChange}
        className="hidden"
        aria-label="Select .glb character file"
      />

      {zenMode && (
        <button
          type="button"
          onClick={() => setZenMode(false)}
          className="fixed top-4 right-4 z-30 pointer-events-auto px-3 py-2 rounded-lg bg-[#0d1017]/92 border border-white/15 text-xs font-semibold text-slate-200 hover:text-white flex items-center gap-1.5"
        >
          <Eye className="w-4 h-4 text-amber-400" />
          <span>Show Lobby</span>
        </button>
      )}

      {!zenMode && (
        <>
          {/* TOP LOBBY BAR */}
          <header className="fixed top-3 left-3 right-3 z-20 flex flex-wrap items-center justify-between gap-3 pointer-events-none">
            <div className="pointer-events-auto flex items-center gap-3 rounded-lg bg-[#0d1017]/92 border border-white/15 px-3 py-2 shadow-lg">
              <div className="w-10 h-10 rounded-md bg-gradient-to-br from-amber-500 to-orange-700 flex items-center justify-center text-slate-950 font-display font-bold text-base shrink-0">
                <Shield className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                {editingName ? (
                  <div className="flex items-center gap-1">
                    <input
                      type="text"
                      value={draftName}
                      onChange={(e) => setDraftName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') saveName();
                        if (e.key === 'Escape') {
                          setDraftName(playerName);
                          setEditingName(false);
                        }
                      }}
                      maxLength={16}
                      autoFocus
                      className="w-28 px-1.5 py-0.5 rounded bg-slate-900 border border-amber-400 text-xs font-semibold text-white focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={saveName}
                      className="p-1 rounded bg-amber-500 text-slate-950"
                      aria-label="Save callsign"
                    >
                      <Check className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setDraftName(playerName);
                      setEditingName(true);
                    }}
                    className="text-sm font-display font-bold tracking-wide text-white hover:text-amber-300 transition-colors text-left truncate max-w-[140px]"
                    title="Click to edit callsign"
                  >
                    {playerName}
                  </button>
                )}
                <div className="text-[11px] text-slate-300 flex items-center gap-1.5 whitespace-nowrap">
                  <span className="font-mono-num text-amber-300 font-semibold">LV 54</span>
                  <span aria-hidden="true" className="text-slate-600">·</span>
                  <span>Heroic IV</span>
                </div>
              </div>
            </div>

            <div className="pointer-events-auto flex flex-wrap items-center gap-2">
              <div className="hidden sm:flex items-center gap-4 rounded-lg bg-[#0d1017]/92 border border-white/15 px-3.5 py-2 text-xs font-mono-num">
                <div className="flex items-center gap-1.5 text-amber-300 font-semibold">
                  <Coins className="w-3.5 h-3.5 text-amber-400" />
                  <span>24,850</span>
                </div>
                <span aria-hidden="true" className="text-slate-700">|</span>
                <div className="flex items-center gap-1.5 text-sky-300 font-semibold">
                  <Diamond className="w-3.5 h-3.5 text-sky-400" />
                  <span>1,420</span>
                </div>
              </div>

              <button
                type="button"
                onClick={onToggleSound}
                className="p-2 rounded-lg bg-[#0d1017]/92 border border-white/15 text-slate-200 hover:text-white hover:border-white/30"
                title={soundEnabled ? 'Mute Lobby Audio' : 'Enable Lobby Audio'}
                aria-label="Toggle lobby sound"
              >
                {soundEnabled ? <Volume2 className="w-4 h-4 text-amber-400" /> : <VolumeX className="w-4 h-4 text-slate-400" />}
              </button>

              <button
                type="button"
                onClick={() => setZenMode(true)}
                className="p-2 rounded-lg bg-[#0d1017]/92 border border-white/15 text-slate-200 hover:text-white hover:border-white/30"
                title="Hide Lobby HUD (H)"
                aria-label="Hide Lobby HUD"
              >
                <EyeOff className="w-4 h-4" />
              </button>
            </div>
          </header>

          {characterError && (
            <div className="fixed top-16 right-4 z-30 pointer-events-auto max-w-xs rounded-lg bg-rose-950/95 border border-rose-400/50 px-3 py-2 text-xs text-rose-200 flex items-center justify-between gap-2 shadow-xl">
              <span>{characterError}</span>
              <button
                type="button"
                onClick={onClearCharacterError}
                className="text-rose-300 hover:text-white shrink-0"
                aria-label="Dismiss error"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* ONLY SHOWN IF BROWSER HAS NO SAVED .GLB FILE YET */}
          {!characterMeta && !isInitialLoading && !isLoadingCharacter && (
            <div className="fixed inset-x-0 top-1/2 -translate-y-1/2 z-10 flex justify-center pointer-events-none px-4">
              <div className="lobby-chamfer pointer-events-auto bg-[#0d1017]/92 border border-sky-400/45 px-5 py-4 text-center max-w-xs shadow-2xl">
                <div className="text-xs font-display font-bold tracking-wider uppercase text-sky-300">
                  Operative Slot Ready
                </div>
                <p className="mt-1 text-xs text-slate-300">
                  Browser storage me abhi <span className="text-white font-semibold">Police_Male_02.glb</span> save nahi mila. Apni file select karein.
                </p>
                <button
                  type="button"
                  onClick={handleOpenFilePicker}
                  className="mt-3 w-full py-2 px-4 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
                >
                  <Upload className="w-3.5 h-3.5 shrink-0" />
                  <span>Select Police_Male_02.glb</span>
                </button>
              </div>
            </div>
          )}

          {/* LEFT VERTICAL LOBBY RAIL + SINGLE SLIDE-OUT DRAWER */}
          <div className="fixed left-3 top-20 z-20 flex items-start gap-2 pointer-events-none">
            <nav className="pointer-events-auto flex flex-col gap-1.5 p-1.5 rounded-xl bg-[#0d1017]/92 border border-white/15 shadow-xl">
              {(
                [
                  { id: 'character', label: 'Fix Pose', icon: UserCheck },
                  { id: 'emotes', label: 'Emotes', icon: Smile },
                  { id: 'stage', label: 'Stage', icon: Camera },
                ] as const
              ).map(({ id, label, icon: Icon }) => {
                const active = activeDrawer === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => toggleDrawer(id)}
                    className={`w-16 py-2 px-1 rounded-lg flex flex-col items-center gap-1 text-[11px] font-semibold transition-colors whitespace-nowrap ${
                      active
                        ? 'bg-amber-500 text-slate-950'
                        : 'text-slate-200 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span>{label}</span>
                  </button>
                );
              })}
            </nav>

            {activeDrawer && (
              <aside className="pointer-events-auto w-[268px] max-w-[calc(100vw-6.5rem)] rounded-xl bg-[#0d1017]/95 border border-white/15 p-3.5 shadow-2xl flex flex-col gap-3">
                <div className="flex items-center justify-between border-b border-white/10 pb-2">
                  <h2 className="text-sm font-display font-bold tracking-wide text-white uppercase">
                    {activeDrawer === 'character' && 'Character Alignment'}
                    {activeDrawer === 'emotes' && 'Lobby Emotes'}
                    {activeDrawer === 'stage' && 'Stage & Camera'}
                  </h2>
                  <button
                    type="button"
                    onClick={() => setActiveDrawer(null)}
                    className="p-1 rounded text-slate-400 hover:text-white hover:bg-white/10"
                    aria-label="Close panel"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {activeDrawer === 'character' && (
                  <div className="flex flex-col gap-2.5">
                    {characterMeta ? (
                      <>
                        <div className="rounded-lg bg-slate-900/90 border border-white/10 px-2.5 py-2 flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-white truncate">
                            {characterMeta.name}
                          </span>
                          <button
                            type="button"
                            onClick={onResetGlbAdjustments}
                            className="text-[11px] text-sky-300 hover:text-sky-200 flex items-center gap-1 shrink-0"
                          >
                            <RotateCcw className="w-3 h-3" />
                            <span>Reset</span>
                          </button>
                        </div>

                        <div className="grid grid-cols-2 gap-1.5">
                          <button
                            type="button"
                            onClick={() =>
                              onChangeGlbAdjustments({ flipFacing: !glbAdjustments.flipFacing })
                            }
                            className={`py-1.5 px-2 rounded-lg border text-[11px] font-semibold flex items-center justify-center gap-1 transition-colors ${
                              glbAdjustments.flipFacing
                                ? 'bg-amber-500 text-slate-950 border-amber-400'
                                : 'bg-slate-900 border-white/15 text-slate-200 hover:border-white/30'
                            }`}
                          >
                            <FlipHorizontal className="w-3.5 h-3.5 shrink-0" />
                            <span>Flip 180°</span>
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              onTriggerEmote(activeEmote === 'rest' ? 'lobby_ready' : 'rest')
                            }
                            className={`py-1.5 px-2 rounded-lg border text-[11px] font-semibold transition-colors ${
                              activeEmote === 'rest'
                                ? 'bg-amber-500 text-slate-950 border-amber-400'
                                : 'bg-slate-900 border-white/15 text-slate-200 hover:border-white/30'
                            }`}
                          >
                            {activeEmote === 'rest' ? 'Original Pose' : 'Hero Pose'}
                          </button>
                        </div>

                        <button
                          type="button"
                          onClick={() =>
                            onChangeGlbAdjustments({ fixArmsPose: !glbAdjustments.fixArmsPose })
                          }
                          className={`w-full py-1.5 px-2.5 rounded-lg border text-[11px] font-semibold flex items-center justify-between transition-colors ${
                            glbAdjustments.fixArmsPose
                              ? 'bg-sky-500/20 border-sky-400/60 text-sky-200'
                              : 'bg-slate-900 border-white/15 text-slate-300'
                          }`}
                        >
                          <span>Fix T/A-Pose Arms</span>
                          {glbAdjustments.fixArmsPose && <Check className="w-3.5 h-3.5 shrink-0" />}
                        </button>

                        <div>
                          <div className="flex items-center justify-between text-[11px] text-slate-300 mb-1">
                            <span>Height Scale</span>
                            <span className="font-mono-num text-amber-300">
                              {(glbAdjustments.scaleMultiplier * 1.8).toFixed(2)}m
                            </span>
                          </div>
                          <input
                            type="range"
                            min={0.75}
                            max={1.25}
                            step={0.02}
                            value={glbAdjustments.scaleMultiplier}
                            onChange={(e) =>
                              onChangeGlbAdjustments({ scaleMultiplier: Number(e.target.value) })
                            }
                            className="w-full accent-amber-400"
                          />
                        </div>

                        <div>
                          <div className="flex items-center justify-between text-[11px] text-slate-300 mb-1">
                            <span>Foot Ground Height</span>
                            <span className="font-mono-num text-amber-300">
                              {glbAdjustments.groundOffsetY >= 0 ? '+' : ''}
                              {glbAdjustments.groundOffsetY.toFixed(2)}m
                            </span>
                          </div>
                          <input
                            type="range"
                            min={-0.2}
                            max={0.2}
                            step={0.01}
                            value={glbAdjustments.groundOffsetY}
                            onChange={(e) =>
                              onChangeGlbAdjustments({ groundOffsetY: Number(e.target.value) })
                            }
                            className="w-full accent-amber-400"
                          />
                        </div>

                        <div className="pt-2 border-t border-white/10 flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={handleOpenFilePicker}
                            disabled={isLoadingCharacter}
                            className="flex-1 py-1.5 px-2.5 rounded-lg bg-slate-900 border border-white/15 hover:border-sky-400/50 text-[11px] text-slate-200 hover:text-white"
                          >
                            Switch .glb File
                          </button>
                          <button
                            type="button"
                            onClick={onClearCharacterModel}
                            className="py-1.5 px-2.5 rounded-lg bg-slate-900 border border-white/10 hover:border-rose-400/50 text-[11px] text-slate-400 hover:text-rose-200"
                          >
                            Clear
                          </button>
                        </div>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={handleOpenFilePicker}
                        disabled={isLoadingCharacter}
                        className="w-full py-2 px-3 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <Upload className="w-3.5 h-3.5 shrink-0" />
                        <span>Select Police_Male_02.glb</span>
                      </button>
                    )}
                  </div>
                )}

                {activeDrawer === 'emotes' && (
                  <div className="flex flex-col gap-1.5">
                    {EMOTES.map((em) => (
                      <button
                        key={em.id}
                        type="button"
                        onClick={() => onTriggerEmote(em.id)}
                        className={`w-full px-3 py-2 rounded-lg border text-xs font-semibold text-left flex items-center justify-between transition-colors ${
                          activeEmote === em.id
                            ? 'bg-amber-500 text-slate-950 border-amber-400'
                            : 'bg-slate-900/90 border-white/10 text-slate-200 hover:border-white/25'
                        }`}
                      >
                        <span>{em.label}</span>
                        <Sparkles className="w-3.5 h-3.5 shrink-0" />
                      </button>
                    ))}
                  </div>
                )}

                {activeDrawer === 'stage' && (
                  <div className="flex flex-col gap-3">
                    <div>
                      <div className="text-[11px] text-slate-400 mb-1.5">Camera Framing</div>
                      <div className="grid grid-cols-3 gap-1.5">
                        {(
                          [
                            ['full', 'Full'],
                            ['closeup', 'Close'],
                            ['squad', 'Squad'],
                          ] as [LobbyCameraPreset, string][]
                        ).map(([id, label]) => (
                          <button
                            key={id}
                            type="button"
                            onClick={() => onChangeCameraPreset(id)}
                            className={`py-1.5 rounded-md text-xs font-semibold transition-colors ${
                              cameraPreset === id
                                ? 'bg-amber-500 text-slate-950'
                                : 'bg-slate-900 border border-white/10 text-slate-200 hover:border-white/25'
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <div className="text-[11px] text-slate-400 mb-1.5">Hangar Atmosphere</div>
                      <div className="grid grid-cols-3 gap-1.5">
                        {(
                          [
                            ['fire_dusk', 'Dusk'],
                            ['night_ops', 'Night'],
                            ['arena_gold', 'Gold'],
                          ] as [LobbyLightingPreset, string][]
                        ).map(([id, label]) => (
                          <button
                            key={id}
                            type="button"
                            onClick={() => onChangeLighting(id)}
                            className={`py-1.5 rounded-md text-xs font-semibold transition-colors ${
                              lightingPreset === id
                                ? 'bg-sky-400 text-slate-950'
                                : 'bg-slate-900 border border-white/10 text-slate-200 hover:border-white/25'
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={onToggleAutoRotate}
                        className={`flex-1 py-2 px-2.5 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1.5 ${
                          autoRotate
                            ? 'bg-emerald-500 text-slate-950 border-emerald-400'
                            : 'bg-slate-900 border-white/10 text-slate-200'
                        }`}
                      >
                        <RotateCw className="w-3.5 h-3.5" />
                        <span>Auto-Spin</span>
                      </button>
                      <button
                        type="button"
                        onClick={onResetCamera}
                        className="py-2 px-3 rounded-lg bg-slate-900 border border-white/10 text-xs font-semibold text-slate-200 hover:border-white/25"
                      >
                        Reset
                      </button>
                    </div>
                  </div>
                )}
              </aside>
            )}
          </div>

          {/* BOTTOM-LEFT QUICK EMOTE BAR & DRAG HINT */}
          <div className="fixed bottom-4 left-3 z-20 hidden md:flex items-center gap-2 pointer-events-auto">
            <div className="flex items-center gap-1 p-1 rounded-lg bg-[#0d1017]/92 border border-white/15">
              {EMOTES.slice(0, 5).map((em) => (
                <button
                  key={em.id}
                  type="button"
                  onClick={() => onTriggerEmote(em.id)}
                  className={`px-2.5 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                    activeEmote === em.id
                      ? 'bg-amber-500 text-slate-950'
                      : 'text-slate-300 hover:text-white hover:bg-white/10'
                  }`}
                >
                  {em.label}
                </button>
              ))}
            </div>
            <span className="text-[11px] text-slate-400">
              Drag character to rotate 360° · Scroll to zoom
            </span>
          </div>

          {/* MATCH FOUND OVERLAY MODAL */}
          {queueState === 'found' && (
            <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-950/75 p-4 pointer-events-auto">
              <div className="lobby-chamfer max-w-sm w-full bg-[#111622] border border-amber-400/70 p-6 text-center shadow-2xl">
                <div className="text-xs font-semibold text-amber-300 tracking-wider uppercase">
                  {currentModeObj.label} · {currentMapObj.name} · {squadSize.toUpperCase()}
                </div>
                <div className="mx-auto mt-3 w-20 h-20 rounded-xl bg-slate-900/90 border border-sky-400/40 p-2 flex items-center justify-center">
                  <svg viewBox="0 0 100 100" className="w-full h-full">
                    <path
                      d={currentMapObj.statePath}
                      fill="rgba(56, 189, 248, 0.28)"
                      stroke="#38bdf8"
                      strokeWidth="2.5"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
                <h2 className="mt-2 text-2xl font-display font-bold text-white">
                  Match Found
                </h2>
                <p className="mt-1.5 text-xs text-slate-300">
                  All squad slots locked for {currentMapObj.name} ({currentMapObj.capital}). Operative {playerName} is ready for deployment.
                </p>
                <div className="mt-5 flex items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={onDismissMatchFound}
                    className="lobby-slant px-7 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-display font-bold text-sm tracking-wide transition-colors"
                  >
                    Return to Lobby
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* BOTTOM-RIGHT FREE FIRE ACTION CLUSTER (SQUAD + MODE on left, MAP directly ABOVE START on right) */}
          <div className="fixed bottom-4 right-3 z-20 flex flex-col items-end gap-2 pointer-events-auto">
            {modeMenuOpen && (
              <div className="w-60 rounded-xl bg-[#0d1017]/95 border border-white/15 p-1.5 shadow-2xl flex flex-col gap-1">
                <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Select Mode
                </div>
                {GAME_MODES.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      onChangeGameMode(m.id);
                      setModeMenuOpen(false);
                    }}
                    className={`w-full px-3 py-2 rounded-lg text-left transition-colors flex items-center justify-between ${
                      gameMode === m.id
                        ? 'bg-amber-500 text-slate-950 font-bold'
                        : 'text-slate-200 hover:bg-white/10'
                    }`}
                  >
                    <span className="text-xs font-display font-bold">{m.label}</span>
                    <span className={`text-[11px] ${gameMode === m.id ? 'text-slate-900' : 'text-slate-400'}`}>
                      {m.tag}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {mapMenuOpen && (
              <div className="w-[460px] max-w-[calc(100vw-1.5rem)] rounded-xl bg-[#0d1017]/97 border border-sky-400/45 p-3 shadow-2xl flex flex-col gap-2.5">
                <div className="flex items-center justify-between border-b border-white/10 pb-2">
                  <div>
                    <div className="text-xs font-display font-bold uppercase tracking-wide text-white flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                      <span>India Top 10 States Map</span>
                    </div>
                    <div className="text-[11px] text-slate-400">
                      Apna state chunein — naksha &amp; location live preview me dekhein
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setMapMenuOpen(false)}
                    className="p-1 rounded text-slate-400 hover:text-white hover:bg-white/10"
                    aria-label="Close map menu"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-[180px_1fr] gap-3 items-stretch">
                  {/* Left: Full India Map + Zoomed Selected State Naksha */}
                  <div className="rounded-lg bg-slate-950/90 border border-white/10 p-2.5 flex flex-col items-center justify-between gap-2">
                    <div className="w-full flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-sky-300">
                      <span>India Naksha</span>
                      <span className="text-amber-300">{currentMapObj.capital}</span>
                    </div>

                    <svg
                      viewBox="0 0 200 220"
                      className="w-full h-40 drop-shadow-[0_0_12px_rgba(56,189,248,0.18)]"
                      aria-label={`India map highlighting ${currentMapObj.name}`}
                    >
                      {INDIA_ALL_STATES_OUTLINE.map((st) => {
                        const isSelected = st.name === currentMapObj.name;
                        return (
                          <path
                            key={st.name}
                            d={st.path}
                            fill={isSelected ? 'rgba(245, 158, 11, 0.55)' : '#1a2333'}
                            stroke={isSelected ? '#fbbf24' : '#334155'}
                            strokeWidth={isSelected ? 1.4 : 0.65}
                            strokeLinejoin="round"
                          />
                        );
                      })}
                      <circle
                        cx={currentMapObj.centerInIndia[0]}
                        cy={currentMapObj.centerInIndia[1]}
                        r="3.2"
                        fill="#38bdf8"
                        stroke="#0f172a"
                        strokeWidth="1.2"
                      />
                    </svg>

                    <div className="w-full rounded-md bg-slate-900/90 border border-white/10 px-2 py-1.5 flex items-center gap-2">
                      <svg viewBox="0 0 100 100" className="w-9 h-9 shrink-0">
                        <path
                          d={currentMapObj.statePath}
                          fill="rgba(56, 189, 248, 0.28)"
                          stroke="#38bdf8"
                          strokeWidth="2.5"
                          strokeLinejoin="round"
                        />
                      </svg>
                      <div className="min-w-0">
                        <div className="text-xs font-display font-bold text-white truncate">
                          {currentMapObj.name}
                        </div>
                        <div className="text-[10px] text-slate-400 truncate">
                          {currentMapObj.region}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Right: India Top 10 States List with individual SVG Naksha per state */}
                  <div className="grid grid-cols-2 gap-1.5 max-h-[260px] overflow-y-auto pr-0.5">
                    {INDIA_TOP_10_STATES.map((st) => {
                      const active = gameMap === st.id;
                      return (
                        <button
                          key={st.id}
                          type="button"
                          onClick={() => {
                            onChangeGameMap(st.id);
                            setMapMenuOpen(false);
                          }}
                          className={`p-2 rounded-lg border text-left transition-colors flex items-center gap-2 ${
                            active
                              ? 'bg-sky-400 text-slate-950 border-sky-300'
                              : 'bg-slate-900/90 border-white/10 text-slate-200 hover:border-sky-400/50 hover:bg-slate-800/90'
                          }`}
                        >
                          <div
                            className={`w-9 h-9 rounded-md p-1 shrink-0 flex items-center justify-center ${
                              active ? 'bg-slate-950/20' : 'bg-slate-950/75 border border-white/10'
                            }`}
                          >
                            <svg viewBox="0 0 100 100" className="w-full h-full">
                              <path
                                d={st.statePath}
                                fill={active ? 'rgba(15, 23, 42, 0.35)' : 'rgba(56, 189, 248, 0.22)'}
                                stroke={active ? '#0f172a' : '#38bdf8'}
                                strokeWidth="3"
                                strokeLinejoin="round"
                              />
                            </svg>
                          </div>
                          <div className="min-w-0">
                            <div className="text-[11px] font-display font-bold leading-tight truncate">
                              {st.name}
                            </div>
                            <div
                              className={`text-[10px] leading-tight mt-0.5 truncate ${
                                active ? 'text-slate-900 font-semibold' : 'text-slate-400'
                              }`}
                            >
                              {st.capital}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            <div className="flex items-end gap-2">
              {/* Left side column: SQUAD + MODE */}
              <div className="flex flex-col items-end gap-2">
                <div className="flex items-center gap-1 p-1 rounded-lg bg-[#0d1017]/92 border border-white/15">
                  <Users className="w-3.5 h-3.5 text-amber-400 ml-1.5 mr-1 shrink-0" />
                  {(['solo', 'duo', 'squad'] as SquadSize[]).map((sz) => (
                    <button
                      key={sz}
                      type="button"
                      onClick={() => onChangeSquadSize(sz)}
                      className={`px-2.5 py-1 rounded-md text-xs font-display font-bold uppercase transition-colors whitespace-nowrap shrink-0 ${
                        squadSize === sz
                          ? 'bg-amber-500 text-slate-950'
                          : 'text-slate-300 hover:text-white'
                      }`}
                    >
                      {sz}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setModeMenuOpen((v) => !v);
                    setMapMenuOpen(false);
                  }}
                  className={`px-3.5 py-2.5 rounded-lg bg-[#0d1017]/94 border text-left transition-colors min-w-[144px] ${
                    modeMenuOpen ? 'border-amber-400' : 'border-white/20 hover:border-amber-400/70'
                  }`}
                >
                  <div className="text-[10px] text-amber-300 font-semibold flex items-center justify-between gap-1 whitespace-nowrap">
                    <span className="flex items-center gap-1">
                      <Crosshair className="w-3 h-3 shrink-0" />
                      <span>MODE</span>
                    </span>
                    <ChevronUp className={`w-3 h-3 transition-transform ${modeMenuOpen ? 'rotate-180' : ''}`} />
                  </div>
                  <div className="text-sm font-display font-bold text-white whitespace-nowrap mt-0.5">
                    {currentModeObj.label}
                  </div>
                </button>
              </div>

              {/* Right side column: MAP directly ABOVE START button */}
              <div className="flex flex-col items-stretch gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setMapMenuOpen((v) => !v);
                    setModeMenuOpen(false);
                  }}
                  className={`px-3 py-1.5 rounded-lg bg-[#0d1017]/94 border text-left transition-colors min-w-[172px] flex items-center gap-2.5 ${
                    mapMenuOpen ? 'border-sky-400' : 'border-sky-400/45 hover:border-sky-400'
                  }`}
                >
                  <div className="w-8 h-8 rounded-md bg-slate-900 border border-sky-400/30 p-1 shrink-0 flex items-center justify-center">
                    <svg viewBox="0 0 100 100" className="w-full h-full">
                      <path
                        d={currentMapObj.statePath}
                        fill="rgba(56, 189, 248, 0.25)"
                        stroke="#38bdf8"
                        strokeWidth="3"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[10px] text-sky-300 font-semibold flex items-center justify-between gap-1 whitespace-nowrap">
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3 h-3 shrink-0" />
                        <span>MAP</span>
                      </span>
                      <ChevronUp className={`w-3 h-3 transition-transform ${mapMenuOpen ? 'rotate-180' : ''}`} />
                    </div>
                    <div className="text-xs font-display font-bold text-white truncate">
                      {currentMapObj.name}
                    </div>
                  </div>
                </button>

                {queueState === 'searching' ? (
                  <button
                    type="button"
                    onClick={onCancelQueue}
                    className="lobby-slant px-7 py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-display font-bold text-base tracking-wide flex flex-col items-center justify-center min-w-[172px] transition-colors shadow-xl"
                  >
                    <span className="leading-none">CANCEL</span>
                    <span className="mt-1 text-[11px] font-mono-num text-rose-100 leading-none">
                      Searching {formatQueueClock(queueSeconds)}
                    </span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={onStartQueue}
                    className="lobby-slant px-8 py-3 bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-300 hover:to-orange-400 text-slate-950 font-display font-bold text-lg tracking-wider flex items-center justify-center gap-2 min-w-[172px] transition-colors shadow-xl"
                  >
                    <Play className="w-4 h-4 fill-current shrink-0" />
                    <span>START</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
