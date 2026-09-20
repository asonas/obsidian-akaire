import {
  clearTimeout as nodeClearTimeout,
  setTimeout as nodeSetTimeout,
} from 'node:timers';
import { vi } from 'vitest';

vi.stubGlobal('window', {
  clearTimeout: nodeClearTimeout,
  setTimeout: nodeSetTimeout,
});
