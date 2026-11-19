/** Dev-only: installs the simulated native side, then starts the real app over it. */

import { installFakeNative } from './fakeNative';

await installFakeNative();
await import('@/index');
