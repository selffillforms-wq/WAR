export type CharacterAnimState =
  | 'idle'
  | 'lobby_ready'
  | 'emote_salute'
  | 'emote_booyah'
  | 'emote_warmup'
  | 'crouch_idle'
  | 'rest';

export type LobbyEmoteId =
  | 'lobby_ready'
  | 'emote_salute'
  | 'emote_booyah'
  | 'emote_warmup'
  | 'crouch_idle'
  | 'rest';

export type LobbyLightingPreset = 'fire_dusk' | 'night_ops' | 'arena_gold';

export type LobbyCameraPreset = 'full' | 'closeup' | 'squad';

export type SquadSize = 'solo' | 'duo' | 'squad';

export type GameModeId = 'br_ranked' | 'clash_squad' | 'lone_wolf' | 'training';

export type GameMapId =
  | 'uttar_pradesh'
  | 'maharashtra'
  | 'bihar'
  | 'west_bengal'
  | 'madhya_pradesh'
  | 'tamil_nadu'
  | 'rajasthan'
  | 'karnataka'
  | 'gujarat'
  | 'andhra_pradesh';

export interface GlbAdjustments {
  flipFacing: boolean;
  scaleMultiplier: number;
  groundOffsetY: number;
  fixArmsPose: boolean;
}

export interface CharacterCustomization {
  skinTone: number;
  hairColor: number;
  eyeColor: number;
  topColor: number;
  bottomColor: number;
  shoeColor: number;
  beltColor: number;
}
