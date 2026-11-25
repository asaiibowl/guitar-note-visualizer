// Options dialog: legibility of the fretboard labels and the read-out panel.
import { DEFAULT_SETTINGS, OPTION_KEYS, saveSettings, type Settings } from './settings';

function $<T extends HTMLElement = HTMLElement>(id: string): T {
  const e = document.getElementById(id);
  if (!e) throw new Error(`#${id} missing`);
  return e as T;
}

type NumericOption = 'labelScale' | 'labelWeight' | 'exactBrightness' | 'pcOpacity' | 'namesAlpha' | 'guideOpacity' | 'uiScale';

const pct = (v: number): string => `${Math.round(v * 100)}%`;
const CONTROLS: { id: string; key: NumericOption; fmt: (v: number) => string }[] = [
  { id: 'opt-label-scale', key: 'labelScale', fmt: pct },
  { id: 'opt-label-weight', key: 'labelWeight', fmt: (v) => String(v) },
  { id: 'opt-exact-bright', key: 'exactBrightness', fmt: pct },
  { id: 'opt-pc-opacity', key: 'pcOpacity', fmt: pct },
  { id: 'opt-guide-opacity', key: 'guideOpacity', fmt: pct },
  { id: 'opt-names-alpha', key: 'namesAlpha', fmt: pct },
  { id: 'opt-ui-scale', key: 'uiScale', fmt: pct },
];

/** Push the legibility settings into CSS variables / classes. */
export function applyOptions(settings: Settings, fretboardWrap: HTMLElement): void {
  const root = document.documentElement.style;
  root.setProperty('--label-scale', String(settings.labelScale));
  root.setProperty('--label-weight', String(settings.labelWeight));
  root.setProperty('--exact-bright', String(settings.exactBrightness));
  root.setProperty('--pc-opacity', String(settings.pcOpacity));
  root.setProperty('--names-alpha', String(settings.namesAlpha));
  root.setProperty('--guide-opacity', String(settings.guideOpacity));
  root.setProperty('--ui-scale', String(settings.uiScale));
  const fixed = settings.labelLightness != null;
  fretboardWrap.classList.toggle('fixed-label', fixed);
  fretboardWrap.classList.toggle('outline', settings.labelOutline);
  if (settings.labelLightness != null) {
    root.setProperty('--label-l', `${settings.labelLightness}%`);
    root.setProperty('--label-outline', settings.labelLightness >= 50 ? '#000000c0' : '#ffffffc0');
  }
}

/** Wire the dialog's controls. `onChange` runs after every change (to redraw). */
export function bindOptionsDialog(settings: Settings, fretboardWrap: HTMLElement, onChange: () => void): HTMLDialogElement {
  const dialog = $<HTMLDialogElement>('options-dialog');
  const auto = $<HTMLInputElement>('opt-label-auto');
  const lightness = $<HTMLInputElement>('opt-label-lightness');
  const lightnessOut = $<HTMLOutputElement>('opt-label-lightness-out');
  const outline = $<HTMLInputElement>('opt-label-outline');

  const commit = (): void => {
    saveSettings(settings);
    applyOptions(settings, fretboardWrap);
    lightness.disabled = settings.labelLightness == null;
    onChange();
  };

  const sync = (): void => {
    for (const c of CONTROLS) {
      $<HTMLInputElement>(c.id).value = String(settings[c.key]);
      $<HTMLOutputElement>(`${c.id}-out`).textContent = c.fmt(settings[c.key]);
    }
    auto.checked = settings.labelLightness == null;
    lightness.value = String(settings.labelLightness ?? 95);
    lightness.disabled = settings.labelLightness == null;
    lightnessOut.textContent = settings.labelLightness == null ? '自動' : `${settings.labelLightness}%`;
    outline.checked = settings.labelOutline;
  };

  for (const c of CONTROLS) {
    const input = $<HTMLInputElement>(c.id);
    input.addEventListener('input', () => {
      settings[c.key] = Number(input.value);
      $<HTMLOutputElement>(`${c.id}-out`).textContent = c.fmt(settings[c.key]);
      commit();
    });
  }
  auto.addEventListener('change', () => {
    settings.labelLightness = auto.checked ? null : Number(lightness.value);
    sync();
    commit();
  });
  lightness.addEventListener('input', () => {
    settings.labelLightness = Number(lightness.value);
    lightnessOut.textContent = `${settings.labelLightness}%`;
    commit();
  });
  outline.addEventListener('change', () => {
    settings.labelOutline = outline.checked;
    commit();
  });
  $('opt-reset').addEventListener('click', () => {
    const target = settings as unknown as Record<string, unknown>;
    for (const k of OPTION_KEYS) target[k] = DEFAULT_SETTINGS[k];
    sync();
    commit();
  });
  $('options-btn').addEventListener('click', () => {
    sync();
    dialog.showModal();
    onChange();
  });
  dialog.addEventListener('close', onChange);
  // A click on the backdrop (outside the form) closes the dialog.
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close();
  });

  sync();
  applyOptions(settings, fretboardWrap);
  return dialog;
}
