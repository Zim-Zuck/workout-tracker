import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
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
