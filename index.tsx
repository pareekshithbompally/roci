import React from 'react';
import ReactDOM from 'react-dom/client';
// Phase 6: Import App from new location with provider architecture
import App from './src/app/App';
import { platform } from './src/platform/index';
import { followTextSize } from './src/platform/dynamicType';
import { raiseSplash } from './src/app/splash';
import { followNetwork, forwardConsoleToLog, loadSystemFormat } from './src/services/tauri';
import { useSystemLocale } from './src/shared/stores/systemFormatStore';
import './index.css';
import './src/styles/markdown.css';
import './src/styles/glass.css';
import 'sonner/dist/styles.css';

// `platform-<kind>` on <html> selects platform CSS (glass.css on macOS).
document.documentElement.classList.add(`platform-${platform.kind}`);
// iPhone and iPad: type sizes from the phone's Text Size setting (Dynamic Type).
followTextSize();

forwardConsoleToLog();
raiseSplash();
// The device's network, kept current from here on (shown when it's down; never a gate).
void followNetwork();

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

console.log('[index.tsx] Root element found, creating React root');

/** Remounts the app when the user changes language, region or clock, so every date redraws in the new format (stores keep their state). */
const Root: React.FC = () => <App key={useSystemLocale()} />;

const root = ReactDOM.createRoot(rootElement);
// The device's formats first, so the first frame already shows its dates.
void loadSystemFormat().finally(() =>
  root.render(
    <React.StrictMode>
      <Root />
    </React.StrictMode>
  )
);

console.log('[index.tsx] React root.render called');
