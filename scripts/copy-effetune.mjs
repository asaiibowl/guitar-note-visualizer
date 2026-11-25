// Copies the @effetune/dsp dist folder into public/vendor so the AudioWorklet
// processor, WASM and metadata are served from the same origin.
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'node_modules', '@effetune', 'dsp', 'dist');
const dest = join(root, 'public', 'vendor', 'effetune-dsp');

if (!existsSync(src)) {
  console.warn('[copy-effetune] @effetune/dsp is not installed; skipped.');
  process.exit(0);
}
rmSync(dest, { recursive: true, force: true });
mkdirSync(dest, { recursive: true });
cpSync(src, dest, { recursive: true });
// Keep the package's licence and third-party notices next to the redistributed files.
for (const f of ['LICENSE', 'THIRD_PARTY_NOTICES.txt']) cpSync(join(src, '..', f), join(dest, f));
console.log('[copy-effetune] copied to public/vendor/effetune-dsp');
