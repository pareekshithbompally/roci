import React from 'react';
import ReactDOM from 'react-dom/client';
// Phase 6: Import App from new location with provider architecture
import App from './src/app/App';
import { platform } from './src/platform/index';
import { raiseSplash } from './src/app/splash';
import { forwardConsoleToLog } from './src/services/tauri';
import './index.css';
import './src/styles/markdown.css';
import './src/styles/glass.css';
import 'sonner/dist/styles.css';

// `platform-<kind>` on <html> selects platform CSS (glass.css on macOS).
document.documentElement.classList.add(`platform-${platform.kind}`);

forwardConsoleToLog();
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
