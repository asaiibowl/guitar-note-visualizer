// Copies LICENSE and THIRD_PARTY_NOTICES.txt into a build output folder so they ship with it.
//   node scripts/copy-notices.mjs <outDir>
import { copyFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const out = join(root, process.argv[2] ?? 'dist');
for (const f of ['LICENSE', 'THIRD_PARTY_NOTICES.txt']) copyFileSync(join(root, f), join(out, f));
console.log(`[copy-notices] copied LICENSE and THIRD_PARTY_NOTICES.txt to ${process.argv[2] ?? 'dist'}`);
