import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import Gallery from './pages/Gallery.jsx';
import RecoveryScreen from './pages/Recovery.jsx';
import { UndoToastProvider } from './ui/index.js';
import { applyTokens } from './theme/tokens.js';
import './index.css';

// Design tokens become CSS custom properties before the first paint, so the
// gradient and every var(--…) in index.css resolve on the very first frame.
applyTokens();

// Dev-only component gallery at ?gallery=1. Never reachable from a tab and
// never in a production bundle — it is a workbench for the design system, not a
// screen of the app.
const params = new URLSearchParams(location.search);
const showGallery = import.meta.env.DEV && params.has('gallery');
// Dev-only, same reasoning as the gallery: the recovery screen is by definition
// the screen you cannot reach on purpose, and a screen nobody can look at is a
// screen that rots. `?recovery=1` renders it against the real database without
// having to break one first.
const showRecovery = import.meta.env.DEV && params.has('recovery');

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {showRecovery
      ? <RecoveryScreen error="Simulated failure (?recovery=1). Nothing is actually wrong." blocked={params.get('recovery') === 'blocked'} />
      : showGallery
        ? <UndoToastProvider><Gallery /></UndoToastProvider>
        : <App />}
  </React.StrictMode>
);

// Register service worker (production only — dev SW registration causes cache oddness with Vite HMR).
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  // ONE BUILD PER PAGE, ALWAYS.
  //
  // The worker calls skipWaiting(), so a new build takes over the moment it
  // installs — including while this page, loaded from the PREVIOUS build, is
  // still open. From that point the old document is asking a new cache for
  // chunk hashes that no longer exist, and a lazy import (the Supabase client)
  // fails with nothing on screen to explain it.
  //
  // Reloading on controllerchange makes the switch atomic: the document and
  // every asset it goes on to request come from the same build. The
  // `hadController` guard is what stops this firing on a FIRST install, where
  // the controller arriving is not a version change and a reload would be a
  // gratuitous flash on somebody's first visit.
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return;
    reloading = true;
    // Nothing in flight is lost: every set is written to IndexedDB as it is
    // ticked, so the worst case is losing scroll position.
    window.location.reload();
  });

  window.addEventListener('load', () => {
    // sw.js is served from the site root (Vite copies /public → root).
    // Using a relative URL so this works under sub-path deployments (e.g. GitHub Pages).
    const base = document.querySelector('base')?.getAttribute('href') || './';
    navigator.serviceWorker.register(base + 'sw.js', { scope: base }).catch(() => {});
  });
}
