// Generates THIRD_PARTY_NOTICES.txt: full licence texts of everything shipped in the web app
// and in the VST3 / Standalone plugin. Run after `npm install` and after fetching plugin/third_party.
//   node scripts/build-notices.mjs
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const nm = (p) => join(root, 'node_modules', p);
const juce = (p) => join(root, 'plugin', 'third_party', 'JUCE', 'modules', p);
const effetune = (p) => join(root, 'plugin', 'third_party', 'effetune', 'dsp', p);
const wv2 = (p) => join(root, 'plugin', 'third_party', 'webview2', 'Microsoft.Web.WebView2.1.0.3485.44', p);

/** Section of the IJG README that holds the licence terms. */
function ijgLegal(path) {
  const text = readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
  const start = text.indexOf('LEGAL ISSUES\n============');
  const end = text.indexOf('\nREFERENCES\n==========');
  return start >= 0 && end > start ? text.slice(start, end).trim() : text;
}

const web = [
  {
    name: '@effetune/dsp 0.19.0 (EffeTune DSP Library)',
    url: 'https://github.com/Frieve-A/effetune',
    licence: 'MIT',
    files: [nm('@effetune/dsp/LICENSE'), nm('@effetune/dsp/THIRD_PARTY_NOTICES.txt')],
  },
  {
    name: 'PFFFT v1.1.0 and fdlibm 5.3 (bundled in EffeTune DSP)',
    url: 'https://github.com/marton78/pffft',
    licence: 'BSD-style (PFFFT), fdlibm permissive notice',
    files: [nm('@effetune/dsp/dist/assets/NOTICE.txt')],
  },
  {
    name: 'mediabunny 1.65.2 and @mediabunny/flac-encoder 1.65.2 (bundled in EffeTune DSP, web build only)',
    url: 'https://github.com/Vanilagy/mediabunny',
    licence: 'MPL-2.0 — shipped unmodified as vendor/effetune-dsp/internal/js/vendor/offline-audio-encoders.mjs; source: https://github.com/Vanilagy/mediabunny and the npm packages of the same versions',
    files: [nm('@effetune/dsp/dist/internal/js/vendor/offline-audio-encoders.NOTICE.txt')],
  },
  {
    name: 'tonal 6 (@tonaljs/*)',
    url: 'https://github.com/tonaljs/tonal',
    licence: 'MIT',
    files: [nm('tonal/LICENSE')],
  },
];

const plugin = [
  {
    name: 'JUCE 9.0.5',
    url: 'https://github.com/juce-framework/JUCE',
    licence: 'AGPL-3.0-only (used under AGPLv3; see plugin/LICENSE.md). Copyright (c) Raw Material Software Limited',
    files: [],
  },
  { name: 'Steinberg VST3 SDK 3.8.0 (in JUCE)', licence: 'MIT', files: [juce('juce_audio_processors_headless/format_types/VST3_SDK/LICENSE.txt')] },
  { name: 'zlib 1.3.2 (in JUCE)', licence: 'Zlib', files: [juce('juce_core/zip/zlib/LICENSE')] },
  { name: 'HarfBuzz 15.0.0 (in JUCE)', licence: 'MIT-Modern-Variant', files: [juce('juce_graphics/fonts/harfbuzz/COPYING')] },
  { name: 'SheenBidi 2.9.0 (in JUCE)', licence: 'Apache-2.0', files: [juce('juce_graphics/unicode/sheenbidi/LICENSE')] },
  { name: 'LunaSVG 3.5.0 (in JUCE)', licence: 'MIT', files: [juce('juce_graphics/drawables/lunasvg/LICENSE')] },
  { name: 'PlutoVG 1.3.2 (in JUCE)', licence: 'MIT', files: [juce('juce_graphics/drawables/lunasvg/plutovg/LICENSE')] },
  { name: 'libpng 1.6.58 (in JUCE)', licence: 'libpng-2.0', files: [juce('juce_graphics/image_formats/pnglib/LICENSE')] },
  { name: 'IJG libjpeg 10.0 (in JUCE)', licence: 'IJG', text: () => ijgLegal(juce('juce_graphics/image_formats/jpglib/README')) },
  { name: 'libwebp 1.6.0 (in JUCE)', licence: 'BSD-3-Clause', files: [juce('juce_graphics/image_formats/libwebp/COPYING')] },
  { name: 'FLAC 1.5.0 (in JUCE)', licence: 'BSD-3-Clause', files: [juce('juce_audio_formats/codecs/flac/Flac Licence.txt')] },
  { name: 'libogg 1.3.6 (in JUCE)', licence: 'BSD-3-Clause', files: [juce('juce_audio_formats/codecs/ogg/COPYING')] },
  { name: 'libvorbis 1.3.7 (in JUCE)', licence: 'BSD-3-Clause', files: [juce('juce_audio_formats/codecs/vorbis/COPYING')] },
  { name: 'Opus 1.6.1 (in JUCE)', licence: 'BSD-3-Clause', files: [juce('juce_audio_formats/codecs/opus/opus/COPYING')] },
  { name: 'opusfile (in JUCE)', licence: 'BSD-3-Clause', files: [juce('juce_audio_formats/codecs/opus/opusfile/COPYING')] },
  { name: 'libopusenc 0.3 (in JUCE)', licence: 'BSD-3-Clause', files: [juce('juce_audio_formats/codecs/opus/libopusenc/COPYING')] },
  {
    name: 'EffeTune DSP core (native build of the same sources as @effetune/dsp)',
    url: 'https://github.com/Frieve-A/effetune/tree/main/dsp',
    licence: 'MIT, with PFFFT (BSD-style) and fdlibm — texts as in the web section above',
    files: [effetune('vendor/pffft/LICENSE.txt')],
  },
  {
    name: 'Microsoft WebView2 SDK 1.0.3485.44 (WebView2LoaderStatic)',
    url: 'https://www.nuget.org/packages/Microsoft.Web.WebView2',
    licence: 'BSD-3-Clause',
    files: [wv2('LICENSE.txt'), wv2('NOTICE.txt')],
  },
];

function render(entries) {
  const out = [];
  for (const e of entries) {
    out.push('='.repeat(78), e.name, e.url ? `Source: ${e.url}` : null, `Licence: ${e.licence}`, '-'.repeat(78));
    if (e.text) out.push(e.text());
    for (const f of e.files ?? []) {
      if (!existsSync(f)) throw new Error(`Licence file missing: ${f}`);
      out.push(readFileSync(f, 'utf8').replace(/\r\n/g, '\n').trim(), '');
    }
    out.push('');
  }
  return out.filter((l) => l !== null).join('\n');
}

const header = `THIRD-PARTY NOTICES — Guitar Note Visualizer

This project includes or links the third-party software listed below. Their licence
terms apply to those components; the project's own licence is in LICENSE (web app,
MIT) and plugin/LICENSE.md (VST3 / Standalone plugin, AGPL-3.0).

VST is a registered trademark of Steinberg Media Technologies GmbH.

PART 1 — Web app (GitHub Pages) and the UI embedded in the plugin
`;
const pluginHeader = `

PART 2 — Additionally in the VST3 / Standalone plugin
`;

const hasPlugin = existsSync(juce('')) && existsSync(effetune('')) && existsSync(wv2(''));
let text = header + '\n' + render(web);
if (hasPlugin) text += pluginHeader + '\n' + render(plugin);
else console.warn('[build-notices] plugin/third_party not found: plugin section skipped');
writeFileSync(join(root, 'THIRD_PARTY_NOTICES.txt'), text.trimEnd() + '\n');
console.log(`[build-notices] wrote THIRD_PARTY_NOTICES.txt (${hasPlugin ? 'web + plugin' : 'web only'})`);
