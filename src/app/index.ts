/**
 * App Module
 * 
 * Application root with provider composition.
 * 
 * Phase 6 Architecture:
 * - App.tsx: Root component with AppProviders wrapper
 * - AppProviders.tsx: Composes all context providers
 * 
 * Provider hierarchy (outer → inner):
 * 1. ThemeProvider - Theme management
 * 2. ToastProvider - Toast notifications
 * 3. AppProvider - App-wide state
 * 4. RecordingProvider - Recording functionality
 * 
 * Usage:
 * ```tsx
 * // index.tsx
 * import App from './src/app';
 * 
 * root.render(<App />);
 * ```
 */

export { default as App } from './App';
export { AppProviders } from './AppProviders';
