// The plugin analyses audio natively, so the WebAssembly engine files Vite emits are not needed
// in the embedded UI. Remove them to keep the plugin binary small.
import { readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const dir = join(process.cwd(), 'dist-plugin', 'assets');
for (const f of readdirSync(dir)) {
  if (f.endsWith('.wasm') || f.startsWith('effetune-dsp.meta')) {
    rmSync(join(dir, f));
    console.log(`[prune-plugin-ui] removed ${f}`);
  }
}
