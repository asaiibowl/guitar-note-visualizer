// User settings with best-effort localStorage persistence.
import type { Accidental } from '../theory/notes';
import type { LabelMode } from './fretboardView';
import type { ChannelChoice } from '../audio/inputDevice';

export interface Settings {
  deviceId: string | null;
  channel: ChannelChoice;
  inputGainDb: number;
  gateDb: number;
  onThreshold: number;
  accidental: Accidental;
  labelMode: LabelMode;
  showOctaves: boolean;
  showAllNames: boolean;
  monitorTest: boolean;

  // key / scale guide
  guideOn: boolean;
  guideTonic: number;
  guideScale: string;

  // Options: label legibility
  labelScale: number;
  labelWeight: number;
  /** Fixed label lightness 0-100 (%), or null for automatic (dark on solid markers, light on dim ones). */
  labelLightness: number | null;
  labelOutline: boolean;
  exactBrightness: number;
  pcOpacity: number;
  namesAlpha: number;
  guideOpacity: number;
  uiScale: number;

  // tuner
  tunerA4: number;
}

export const DEFAULT_SETTINGS: Settings = {
  deviceId: null,
  channel: 0,
  inputGainDb: 0,
  gateDb: -60,
  onThreshold: 0.5,
  accidental: 'sharp',
  labelMode: 'note',
  showOctaves: true,
  showAllNames: false,
  monitorTest: true,

  guideOn: false,
  guideTonic: 0,
  guideScale: 'major',

  labelScale: 1,
  labelWeight: 700,
  labelLightness: null,
  labelOutline: false,
  exactBrightness: 1,
  pcOpacity: 0.28,
  namesAlpha: 0.22,
  guideOpacity: 0.55,
  uiScale: 1,

  tunerA4: 440,
};

/** Options-screen keys that can be reset to defaults as a group. */
export const OPTION_KEYS = [
  'labelScale',
  'labelWeight',
  'labelLightness',
  'labelOutline',
  'exactBrightness',
  'pcOpacity',
  'namesAlpha',
  'guideOpacity',
  'uiScale',
] as const;

const KEY = 'guitar-note-visualizer.settings.v1';

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    /* storage unavailable */
  }
  return { ...DEFAULT_SETTINGS };
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable */
  }
}
