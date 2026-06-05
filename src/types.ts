export interface HitObject {
  id: string;
  x: number; // 0 to 512 (osu! playfield coords)
  y: number; // 0 to 384 (osu! playfield coords)
  time: number; // in milliseconds
  type: 'circle' | 'slider' | 'spinner';
  endTime?: number; // for sliders and spinners
  sliderPoints?: { x: number; y: number }[]; // slider curve points
  slides?: number; // slider repeat count (number of passes)
  duration?: number;
  comboIndex: number;
  comboSet: number; // index of the combo color set
  isHit?: boolean;
  hitResult?: 300 | 100 | 50 | 0 | null; // 0 = miss
  activeTicksClicked?: number[]; // for slider ticks
}

export interface Beatmap {
  id: string;
  title: string;
  titleUnicode?: string;
  artist: string;
  artistUnicode?: string;
  creator: string;
  version: string; // Difficulty name
  audioFilename: string;
  bgFilename?: string;
  
  // Game parameters
  hpDrain: number; // HP Drain rate (0-10)
  circleSize: number; // CS (0-10)
  overallDifficulty: number; // OD (0-10)
  approachRate: number; // AR (0-10)
  sliderMultiplier: number;
  sliderTickRate: number;

  // Blobs extracted from .osz ZIP or custom uploaded
  audioUrl?: string; // object URL
  bgUrl?: string; // object URL
  videoUrl?: string; // object URL
  audioBlob?: Blob;
  bgBlob?: Blob;
  videoBlob?: Blob;
  videoFilename?: string;

  hitObjects: HitObject[];
  duration: number; // in milliseconds
}

export interface PlayStats {
  score: number;
  combo: number;
  maxCombo: number;
  hp: number; // 0 to 100
  hits300: number;
  hits100: number;
  hits50: number;
  misses: number;
}

export interface GameSettings {
  autoPlay: boolean;
  touchControls: boolean; // Show visual touch tap regions
  hitsounds: boolean;
  volume: number; // 0 to 1
  dimLevel: number; // Background dim (0 to 100)
  useKeyboard: boolean; // Z/X keys
  showFps: boolean;
  uiScale: number; // UI/Playfield scale factor (e.g. 0.8, 1.0, 1.2)
  autoScaleField: boolean; // Auto adaptive playfield container
  audioOffset: number; // Audio latency offset in milliseconds
  enableReplays: boolean; // Enable/disable replay system
  skinPreset: 'lazer' | 'argon' | 'whitecat' | 'classic' | 'custom';
  customSkinColors?: {
    hitcircleFill: string;
    hitcircleBorder: string;
    approachCircleColor: string;
    textColor: string;
    sliderTrackColor: string;
  };
  customSkinImages?: {
    cursorUrl?: string;
    hitcircleUrl?: string;
  };
}

export interface Replay {
  id: string;
  beatmapId: string;
  playerName: string;
  score: number;
  maxCombo: number;
  accuracy: number;
  date: string;
  isWatching?: boolean; // temporary flag for playing back
}

export interface MapGroup {
  title: string;
  artist: string;
  creator: string;
  bgUrl?: string;
  versions: Beatmap[];
  fileName?: string; // Optional track file name inside indexedDB for deleting
}
