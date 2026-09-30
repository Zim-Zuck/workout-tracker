// Rewrites the service worker's version and precache list from the build output.
//
// Run by `npm run build` after vite. Two jobs:
//
//   1. List every hashed JS/CSS file vite emitted, so install() precaches a
//      COMPLETE build. The app has a dynamic import (@supabase/supabase-js), so
//      there is a lazy chunk, and a lazy chunk that is not precached is one a
//      returning user can fail to load after a deploy has removed it.
//   2. Derive the cache name from a hash of that list, so the cache version
//      changes if and only if the build output changed. A hand-bumped constant
//      is a step that gets forgotten, and a forgotten bump is exactly how users
//      end up running a mix of old and new code.
import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const DIST = 'dist';

async function walk(dir, base = '') {
  const out = [];
  for (const entry of await readdir(join(DIST, dir), { withFileTypes: true })) {
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...await walk(join(dir, entry.name), rel));
    else out.push(rel);
  }
  return out;
}

const assets = (await walk('assets', 'assets'))
  .filter((f) => /\.(js|css)$/.test(f))
  .sort()
  .map((f) => `./${f}`);

if (!assets.length) {
  console.error('inject-sw-assets: no built assets found under dist/assets — refusing to write a service worker that precaches nothing.');
  process.exit(1);
}

const swPath = join(DIST, 'sw.js');
let sw = await readFile(swPath, 'utf8');

// The version is the content hash of the asset list AND of the worker's own
// source. Same build output and same caching logic, same cache name; change
// either — a new chunk hash, or a fix to how this worker matches requests — and
// every client gets a fresh cache rather than keeping entries written under
// rules that no longer apply.
const version = 'kun-' + createHash('sha256').update(assets.join('\n')).update('\u0000').update(sw).digest('hex').slice(0, 12);

if (!sw.includes('__SW_VERSION__') || !sw.includes("'__SW_BUILD_ASSETS__'")) {
  console.error('inject-sw-assets: placeholders not found in dist/sw.js — the service worker template changed. Fix this script rather than shipping an un-versioned worker.');
  process.exit(1);
}

sw = sw
  .replace('__SW_VERSION__', version)
  .replace("'__SW_BUILD_ASSETS__'", assets.map((a) => JSON.stringify(a)).join(', '));

await writeFile(swPath, sw);
console.log(`inject-sw-assets: ${version} precaching ${assets.length} built asset(s):`);
for (const a of assets) console.log('  ' + a);
