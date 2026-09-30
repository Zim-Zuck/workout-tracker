import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import Gallery from './pages/Gallery.jsx';
import { UndoToastProvider } from './ui/index.js';
import { applyTokens } from './theme/tokens.js';
import './index.css';

// Design tokens become CSS custom properties before the first paint, so the
// gradient and every var(--…) in index.css resolve on the very first frame.
applyTokens();

// Dev-only component gallery at ?gallery=1. Never reachable from a tab and
// never in a production bundle — it is a workbench for the design system, not a
// screen of the app.
const showGallery = import.meta.env.DEV && new URLSearchParams(location.search).has('gallery');

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {showGallery
      ? <UndoToastProvider><Gallery /></UndoToastProvider>
      : <App />}
  </React.StrictMode>
);

// Register service worker (production only — dev SW registration causes cache oddness with Vite HMR).
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    // sw.js is served from the site root (Vite copies /public → root).
    // Using a relative URL so this works under sub-path deployments (e.g. GitHub Pages).
    const base = document.querySelector('base')?.getAttribute('href') || './';
    navigator.serviceWorker.register(base + 'sw.js', { scope: base }).catch(() => {});
  });
}
