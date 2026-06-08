/**
 * llama.cpp Extension Entry
 *
 * Public API for the llama.cpp extension. Re-exports the key modules
 * and provides convenience functions for integration with the core app.
 */

// Re-export modules
export * from './types';
export * as backend from './backend';
export * as models from './models';
export * as server from './server';

// Re-export components
export { ServerStatus } from './components/ServerStatus';

// Re-export React Query hooks for HF model discovery
export { useHfModelSearch, useHfRepoFiles } from './hooks';
