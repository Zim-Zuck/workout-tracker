// Service worker: cache the app shell for offline use.
//
// CACHE VERSIONING, AND WHY IT CANNOT BE HAND-MAINTAINED
//
// `VERSION` and `BUILD_ASSETS` below are placeholders. `npm run build` runs
// scripts/inject-sw-assets.mjs, which rewrites them in dist/sw.js with the real
// hashed asset filenames and a version string derived from a hash OF THOSE
// FILENAMES. So the cache name changes exactly when the build output changes,
// and never otherwise. There is no step a person can forget.
//
// That matters because the previous version was a hand-bumped string, and a
// forgotten bump is the precise mechanism that leaves somebody on a mix of old
// and new code: a stale index.html naming a chunk hash that activate() has
// already deleted from the cache and the deploy has already removed from the
// server. The page loads, the lazy import fails, and signing in throws.
//
// Three things together close that window:
//   1. Every JS/CSS file of THIS build is precached on install, so a version is
//      only ever in the cache complete. No lazy chunk can be missing.
//   2. Old caches are deleted on activate, so nothing can serve half of one
//      build and half of another.
//   3. The page reloads on controllerchange (see main.jsx), so a document and
//      the assets it asks for always come from one single build.
const VERSION = '__SW_VERSION__';
const BUILD_ASSETS = ['__SW_BUILD_ASSETS__'];

const APP_SHELL = [
  './', './index.html', './manifest.webmanifest',
  './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png',
  // Precached rather than cached-on-first-use: a typeface fetched lazily is a
  // typeface the first offline launch does not have.
  './fonts/inter-tight-latin.woff2', './fonts/inter-tight-latin-ext.woff2'
];

// The placeholder survives in dev (public/sw.js is never registered in dev), and
// would survive a build run without the inject step. Filter it out rather than
// trying to cache a literal '__SW_BUILD_ASSETS__'.
const PRECACHE = [...APP_SHELL, ...BUILD_ASSETS.filter((a) => !a.startsWith('__'))];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    // addAll() is all-or-nothing, which is what we want for the app shell and
    // the build's own JS: a cache missing one chunk is the problem this file
    // exists to prevent. Installation failing means the old worker stays in
    // charge and the user keeps a version that works.
    await cache.addAll(PRECACHE);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (e) => {
  if (e.data === 'skip-waiting') self.skipWaiting();
});

// ALWAYS `ignoreVary`. THIS IS NOT AN OPTIMISATION.
//
// A cache entry written by addAll() was fetched without an `Origin` header. The
// browser's own request for a `<script type="module" crossorigin>` is a CORS
// request and DOES send one. If the server labelled the response `Vary: Origin`
// — vite preview does, and so do a number of static hosts — those two requests
// are considered different by the default matching rules, caches.match() returns
// undefined for a file that is definitely in the cache, and the app is a white
// screen offline with its own JavaScript sitting right there unused.
//
// This cost a real offline failure to find. Every lookup in this file goes
// through here.
function fromCache(request) {
  return caches.match(request, { ignoreVary: true });
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  const isHTML = req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html');
  if (isHTML) {
    e.respondWith(
      fetch(req).then((r) => {
        const copy = r.clone();
        caches.open(VERSION).then((c) => c.put(req, copy));
        return r;
      }).catch(async () => (await fromCache(req)) || (await fromCache('./index.html')) || Response.error())
    );
    return;
  }

  e.respondWith((async () => {
    const cached = await fromCache(req);
    if (cached) return cached;
    try {
      const r = await fetch(req);
      if (r.ok) {
        const copy = r.clone();
        caches.open(VERSION).then((c) => c.put(req, copy));
      }
      return r;
    } catch (err) {
      // Nothing cached and no network. Returning undefined from respondWith is
      // a network error with no explanation attached; an explicit error at least
      // shows up as one in the console and in the Network panel.
      return Response.error();
    }
  })());
});
