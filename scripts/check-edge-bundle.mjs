// Asserts every relative import specifier emitted into the edge function
// bundles resolves to a file that actually exists in the bundle.
//
// This is the property Vercel's deploy-time edge bundler enforces — and the one
// `vercel build` does NOT: a `.ts` specifier left in emitted JS builds clean
// locally, then fails the deploy with "referencing unsupported modules".
// Run after `vercel build`:
//
//   npx vercel build && node scripts/check-edge-bundle.mjs
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';

const root = process.argv[2] ?? '.vercel/output/functions';
let checked = 0;
let failures = 0;

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (p.endsWith('.js')) checkFile(p);
  }
}

function checkFile(file) {
  const src = readFileSync(file, 'utf8');
  const re = /(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]/g;
  for (const m of src.matchAll(re)) {
    const spec = m[1] ?? m[2];
    if (!spec || !spec.startsWith('.')) continue;
    checked++;
    const base = resolve(dirname(file), spec);
    if (![base, `${base}.js`, join(base, 'index.js')].some(existsSync)) {
      failures++;
      console.error(`UNRESOLVED: ${file} -> ${spec}`);
    }
  }
}

if (!existsSync(root)) {
  console.error(`${root} not found — run \`npx vercel build\` first.`);
  process.exit(1);
}
walk(root);
console.log(`${checked} relative specifiers checked, ${failures} unresolved`);
process.exit(failures ? 1 : 0);
