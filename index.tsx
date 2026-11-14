import React from 'react';
import ReactDOM from 'react-dom/client';
// Phase 6: Import App from new location with provider architecture
import App from './src/app/App';
import { IS_MACOS } from './src/platform/index';
import { raiseSplash } from './src/app/splash';
import './index.css';
import './src/styles/markdown.css';
import './src/styles/glass.css';
import 'sonner/dist/styles.css';

// Apply platform class to <html> for CSS targeting (enables glass.css rules)
if (IS_MACOS) {
  document.documentElement.classList.add('platform-macos');
}

// Also detect Tauri macOS at runtime as a fallback
if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window && /mac/i.test(navigator.userAgent)) {
  document.documentElement.classList.add('platform-macos');
}

console.log('[index.tsx] Starting app initialization, IS_MACOS:', IS_MACOS);

raiseSplash();

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

console.log('[index.tsx] Root element found, creating React root');

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

console.log('[index.tsx] React root.render called');
