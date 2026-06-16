/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  checkEnvironment,
  getNodePath,
  getCopilotScriptPath,
} from '../copilotDetector';
import fs from 'fs';

let mockExec: any = null;
let mockExecFile: any = null;

vi.mock('child_process', () => {
  return {
    exec: (cmd: string, cb: any) => {
      if (mockExec) {
        mockExec(cmd, cb);
      } else {
        cb(null, { stdout: '' });
      }
    },
    execFile: (file: string, args: string[], cb: any) => {
      if (mockExecFile) {
        mockExecFile(file, args, cb);
      } else {
        cb(null, { stdout: '' });
      }
    },
  };
});

const originalExistsSync = fs.existsSync;
const originalEval = global.eval;

describe('copilotDetector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExec = null;
    mockExecFile = null;

    // Default NODE_PATH and COPILOT_SCRIPT_PATH to undefined for standard test cases
    delete process.env.NODE_PATH;
    delete process.env.COPILOT_SCRIPT_PATH;
    delete process.env.DISABLE_COPILOT_WINDOWS_WORKAROUND;
  });

  afterEach(() => {
    fs.existsSync = originalExistsSync;
    global.eval = originalEval;
  });

  describe('checkEnvironment', () => {
    it('should detect when node is not found on path', async () => {
      mockExec = (cmd: string, cb: any) => cb(new Error('Command failed'));
      const result = await checkEnvironment();
      expect(result.success).toBe(false);
      expect(result.errorType).toBe('NODE_NOT_FOUND');
      expect(result.nodePath).toBeNull();
    });

    it('should return version too low if candidate node version is lower than 22', async () => {
      mockExec = (cmd: string, cb: any) =>
        cb(null, { stdout: '/usr/bin/node\n' });
      mockExecFile = (file: string, args: string[], cb: any) =>
        cb(null, { stdout: 'v18.5.0\n' });

      vi.spyOn(fs, 'existsSync').mockReturnValue(true);

      const result = await checkEnvironment();
      expect(result.success).toBe(false);
      expect(result.errorType).toBe('NODE_VERSION_TOO_LOW');
      expect(result.nodeVersion).toBe('v18.5.0');
      expect(result.nodePath).toBe('/usr/bin/node');
    });

    it('should return success if candidate node version is 22 or above', async () => {
      mockExec = (cmd: string, cb: any) =>
        cb(null, { stdout: '/usr/bin/node\n' });
      mockExecFile = (file: string, args: string[], cb: any) =>
        cb(null, { stdout: 'v22.2.0\n' });

      vi.spyOn(fs, 'existsSync').mockReturnValue(true);

      const result = await checkEnvironment();
      expect(result.success).toBe(true);
      expect(result.nodeVersion).toBe('v22.2.0');
      expect(result.nodePath).toBe('/usr/bin/node');
    });

    it('should prioritize the first valid node candidate even if others are invalid/older', async () => {
      mockExec = (cmd: string, cb: any) =>
        cb(null, {
          stdout: '/invalid/node\n/usr/bin/node22\n/usr/bin/node18\n',
        });
      mockExecFile = (file: string, args: string[], cb: any) => {
        if (file === '/usr/bin/node22') {
          cb(null, { stdout: 'v22.1.0\n' });
        } else if (file === '/usr/bin/node18') {
          cb(null, { stdout: 'v18.0.0\n' });
        } else {
          cb(new Error('not executable'));
        }
      };

      vi.spyOn(fs, 'existsSync').mockImplementation((p) => {
        return p === '/usr/bin/node22' || p === '/usr/bin/node18';
      });

      const result = await checkEnvironment();
      expect(result.success).toBe(true);
      expect(result.nodePath).toBe('/usr/bin/node22');
      expect(result.nodeVersion).toBe('v22.1.0');
    });

    it('should respect NODE_PATH if specified and valid', async () => {
      process.env.NODE_PATH = '/custom/node';
      mockExecFile = (file: string, args: string[], cb: any) =>
        cb(null, { stdout: 'v23.0.0\n' });

      vi.spyOn(fs, 'existsSync').mockImplementation(
        (p) => p === '/custom/node',
      );

      const result = await checkEnvironment();
      expect(result.success).toBe(true);
      expect(result.nodePath).toBe('/custom/node');
      expect(result.nodeVersion).toBe('v23.0.0');
    });

    it('should return NODE_VERSION_TOO_LOW if NODE_PATH is specified but version is too low', async () => {
      process.env.NODE_PATH = '/custom/node';
      mockExecFile = (file: string, args: string[], cb: any) =>
        cb(null, { stdout: 'v16.0.0\n' });

      vi.spyOn(fs, 'existsSync').mockImplementation(
        (p) => p === '/custom/node',
      );

      const result = await checkEnvironment();
      expect(result.success).toBe(false);
      expect(result.errorType).toBe('NODE_VERSION_TOO_LOW');
      expect(result.nodePath).toBe('/custom/node');
      expect(result.nodeVersion).toBe('v16.0.0');
    });
  });

  describe('getNodePath', () => {
    it('should return path on success', async () => {
      mockExec = (cmd: string, cb: any) =>
        cb(null, { stdout: '/usr/bin/node\n' });
      mockExecFile = (file: string, args: string[], cb: any) =>
        cb(null, { stdout: 'v22.0.0\n' });
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);

      const path = await getNodePath();
      expect(path).toBe('/usr/bin/node');
    });

    it('should return null on failure', async () => {
      mockExec = (cmd: string, cb: any) => cb(new Error('not found'));
      const path = await getNodePath();
      expect(path).toBeNull();
    });
  });

  describe('getCopilotScriptPath', () => {
    it('should respect COPILOT_SCRIPT_PATH if defined', () => {
      process.env.COPILOT_SCRIPT_PATH = '/custom/copilot/index.js';
      const scriptPath = getCopilotScriptPath();
      expect(scriptPath).toBe('/custom/copilot/index.js');
    });

    it('should resolve script path relative to @github/copilot-sdk peer package', () => {
      global.eval = vi.fn().mockImplementation((val) => {
        if (val === "require.resolve('@github/copilot-sdk')") {
          return '/mock/node_modules/@github/copilot-sdk/dist/index.js';
        }
        return originalEval(val);
      });

      vi.spyOn(fs, 'existsSync').mockImplementation((p) => {
        // Should traverse up to node_modules/ and check node_modules/@github/copilot/index.js
        return p === '/mock/node_modules/@github/copilot/index.js';
      });

      const scriptPath = getCopilotScriptPath();
      expect(scriptPath).toBe('/mock/node_modules/@github/copilot/index.js');
    });

    it('should return null if path cannot be resolved', () => {
      global.eval = vi.fn().mockImplementation(() => {
        throw new Error('module not found');
      });

      const scriptPath = getCopilotScriptPath();
      expect(scriptPath).toBeNull();
    });
  });
});
