// The service worker, executed.
//
// The mixed-code failure this file guards against is invisible in review and
// only shows up on somebody's phone after a deploy, so it is checked by running
// the built worker rather than by reading it. The worker is loaded from `dist/`,
// which means this also verifies that the build step actually injected a version
// and an asset list — a worker still carrying its placeholders would precache
// nothing and cache under the literal string '__SW_VERSION__'.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import vm from 'node:vm';

const SW = 'dist/sw.js';
const built = existsSync(SW);

function loadWorker() {
  const listeners = new Map();
  const stores = new Map();          // cache name -> Set of urls
  const addAllCalls = [];

  const cacheFor = (name) => {
    if (!stores.has(name)) stores.set(name, new Set());
    const set = stores.get(name);
    return {
      addAll: async (urls) => { addAllCalls.push([name, urls]); for (const u of urls) set.add(u); },
      put: async (req, _res) => { set.add(typeof req === 'string' ? req : req.url); },
      keys: async () => [...set]
    };
  };

  const caches = {
    open: async (name) => cacheFor(name),
    keys: async () => [...stores.keys()],
    delete: async (name) => stores.delete(name),
    match: async () => undefined
  };

  const waits = [];
  const self = {
    addEventListener: (type, fn) => listeners.set(type, fn),
    skipWaiting: async () => { self._skipWaiting = true; },
    clients: { claim: async () => { self._claimed = true; } },
    location: { origin: 'https://example.test' }
  };

  const ctx = vm.createContext({ self, caches, URL, console, fetch: async () => ({ ok: true, clone: () => ({}) }) });
  vm.runInContext(readFileSync(SW, 'utf8'), ctx);

  const fire = async (type) => {
    const e = { waitUntil: (p) => waits.push(p) };
    listeners.get(type)?.(e);
    await Promise.all(waits.splice(0));
  };

  return { self, stores, addAllCalls, fire, listeners };
}

test('the build injected a real version and a real asset list', { skip: built ? false : 'run `npm run build` first' }, () => {
  const src = readFileSync(SW, 'utf8');
  // The declarations, not the whole file — the placeholder names are mentioned
  // in the comment above them, which is where they belong.
  assert.match(src, /const VERSION = 'kun-[0-9a-f]{12}';/, 'the cache name must be a generated content hash');
  const assetsLine = src.match(/const BUILD_ASSETS = \[(.*)\];/)?.[1] ?? '';
  assert.ok(!assetsLine.includes('__SW_BUILD_ASSETS__'), 'the asset-list placeholder was never replaced');
  assert.match(assetsLine, /"\.\/assets\/[^"]+\.js"/, 'the built JS must be listed for precaching');
});

test('install precaches the whole shell AND every built asset', { skip: built ? false : 'run `npm run build` first' }, async () => {
  const w = loadWorker();
  await w.fire('install');

  assert.equal(w.addAllCalls.length, 1, 'one all-or-nothing addAll, so a cache is never half a build');
  const [cacheName, urls] = w.addAllCalls[0];
  assert.match(cacheName, /^kun-[0-9a-f]{12}$/);

  for (const shell of ['./', './index.html', './manifest.webmanifest',
                       './fonts/inter-tight-latin.woff2', './fonts/inter-tight-latin-ext.woff2']) {
    assert.ok(urls.includes(shell), `app shell missing ${shell}`);
  }
  // Every JS and CSS file vite emitted must be in there — including the lazy
  // Supabase chunk, which is the one a returning user could otherwise fail to
  // load after a deploy removed it from the server.
  const assets = urls.filter((u) => u.startsWith('./assets/'));
  assert.ok(assets.length >= 2, `expected the built assets to be precached, got ${assets.length}`);
  assert.ok(assets.some((a) => a.endsWith('.css')), 'the stylesheet must be precached');
  assert.ok(assets.filter((a) => a.endsWith('.js')).length >= 2, 'every JS chunk must be precached, lazy ones included');
  assert.ok(!urls.some((u) => u.startsWith('__')), 'a placeholder must never reach the cache');
  assert.equal(w.self._skipWaiting, true);
});

test('activate deletes every cache that is not this build', { skip: built ? false : 'run `npm run build` first' }, async () => {
  const w = loadWorker();
  // Two previous deploys' caches, plus the hand-bumped names the old worker used.
  for (const stale of ['lift-v1', 'lift-v2', 'kun-000000000000']) w.stores.set(stale, new Set(['./old.js']));
  await w.fire('install');
  await w.fire('activate');

  const remaining = [...w.stores.keys()];
  assert.equal(remaining.length, 1, `stale caches survived activate: ${remaining.join(', ')}`);
  assert.match(remaining[0], /^kun-[0-9a-f]{12}$/);
  assert.equal(w.self._claimed, true, 'the new worker must take control of open pages');
});

test('the worker registers the handlers the app depends on', { skip: built ? false : 'run `npm run build` first' }, async () => {
  const w = loadWorker();
  for (const type of ['install', 'activate', 'fetch']) {
    assert.equal(typeof w.listeners.get(type), 'function', `no ${type} handler`);
  }
});
