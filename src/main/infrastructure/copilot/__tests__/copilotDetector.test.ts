/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  checkEnvironment,
  getNodePath,
  getCopilotScriptPath,
  checkCopilotCli,
  installCopilotCli,
  getManagedCopilotDir,
  getRequiredCopilotVersion,
} from '../copilotDetector';
import fs from 'fs';
import path from 'path';

// Mock electron
vi.mock('electron', () => {
  return {
    app: {
      getPath: (name: string) => {
        if (name === 'userData') {
          return '/mock/userData';
        }
        return '/mock/path';
      },
    },
  };
});

let mockExec: any = null;
let mockExecFile: any = null;

vi.mock('child_process', () => {
  return {
    exec: (cmd: string, options: any, cb?: any) => {
      let callback = cb;
      if (typeof options === 'function') {
        callback = options;
      }
      if (mockExec) {
        mockExec(cmd, callback);
      } else {
        callback(null, { stdout: '' });
      }
    },
    execFile: (file: string, args: any, options: any, cb?: any) => {
      let callback = cb;
      if (typeof options === 'function') {
        callback = options;
      }
      if (mockExecFile) {
        mockExecFile(file, args, callback);
      } else {
        callback(null, { stdout: '' });
      }
    },
  };
});

const originalExistsSync = fs.existsSync;
const originalReadFileSync = fs.readFileSync;
const originalWriteFileSync = fs.writeFileSync;
const originalMkdirSync = fs.mkdirSync;
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

    // Mock write operations to avoid making directories or files
    vi.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined as any);
    vi.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined as any);
  });

  afterEach(() => {
    fs.existsSync = originalExistsSync;
    fs.readFileSync = originalReadFileSync;
    fs.writeFileSync = originalWriteFileSync;
    fs.mkdirSync = originalMkdirSync;
    global.eval = originalEval;
  });

  describe('getManagedCopilotDir', () => {
    it('should return the path inside userData directory', () => {
      const dir = getManagedCopilotDir();
      expect(dir).toBe(path.join('/mock/userData', 'copilot-cli'));
    });
  });

  describe('getRequiredCopilotVersion', () => {
    it('should resolve version from @github/copilot-sdk package.json', () => {
      global.eval = vi.fn().mockImplementation((val) => {
        if (val === "require.resolve('@github/copilot-sdk')") {
          return '/mock/node_modules/@github/copilot-sdk/dist/cjs/index.js';
        }
        return undefined;
      });

      vi.spyOn(fs, 'existsSync').mockImplementation((p) => {
        return (
          p ===
          path.normalize('/mock/node_modules/@github/copilot-sdk/package.json')
        );
      });

      vi.spyOn(fs, 'readFileSync').mockImplementation((p: any) => {
        if (
          p ===
          path.normalize('/mock/node_modules/@github/copilot-sdk/package.json')
        ) {
          return JSON.stringify({
            dependencies: {
              '@github/copilot': '^1.0.65',
            },
          });
        }
        return '';
      });

      const version = getRequiredCopilotVersion();
      expect(version).toBe('1.0.65');
    });

    it('should fallback if file cannot be read or resolved', () => {
      global.eval = vi.fn().mockImplementation(() => {
        throw new Error('module not found');
      });
      const version = getRequiredCopilotVersion();
      expect(version).toBe('1.0.61');
    });
  });

  describe('checkCopilotCli', () => {
    it('should return COPILOT_CLI_MISSING if package.json does not exist', async () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(false);
      const res = await checkCopilotCli();
      expect(res.success).toBe(false);
      expect(res.errorType).toBe('COPILOT_CLI_MISSING');
    });

    it('should return COPILOT_CLI_OUTDATED if installed version is older than required', async () => {
      global.eval = vi.fn().mockImplementation((val) => {
        if (val === "require.resolve('@github/copilot-sdk')") {
          return '/mock/node_modules/@github/copilot-sdk/dist/cjs/index.js';
        }
        return undefined;
      });

      vi.spyOn(fs, 'existsSync').mockImplementation((p: any) => {
        // SDK package.json exists, copilot package.json exists
        return (
          p.includes('copilot-sdk/package.json') ||
          p.includes('copilot/package.json')
        );
      });

      vi.spyOn(fs, 'readFileSync').mockImplementation((p: any) => {
        if (p.includes('copilot-sdk/package.json')) {
          return JSON.stringify({
            dependencies: { '@github/copilot': '^1.0.61' },
          });
        }
        if (p.includes('copilot/package.json')) {
          return JSON.stringify({ version: '1.0.60' });
        }
        return '';
      });

      const res = await checkCopilotCli();
      expect(res.success).toBe(false);
      expect(res.errorType).toBe('COPILOT_CLI_OUTDATED');
      expect(res.installedVersion).toBe('1.0.60');
      expect(res.requiredVersion).toBe('1.0.61');
    });

    it('should return success true if installed version matches required and index.js exists', async () => {
      global.eval = vi.fn().mockImplementation((val) => {
        if (val === "require.resolve('@github/copilot-sdk')") {
          return '/mock/node_modules/@github/copilot-sdk/dist/cjs/index.js';
        }
        return undefined;
      });

      vi.spyOn(fs, 'existsSync').mockReturnValue(true);

      vi.spyOn(fs, 'readFileSync').mockImplementation((p: any) => {
        if (p.includes('copilot-sdk/package.json')) {
          return JSON.stringify({
            dependencies: { '@github/copilot': '^1.0.61' },
          });
        }
        if (p.includes('copilot/package.json')) {
          return JSON.stringify({ version: '1.0.61' });
        }
        return '';
      });

      const res = await checkCopilotCli();
      expect(res.success).toBe(true);
      expect(res.errorType).toBeNull();
      expect(res.installedVersion).toBe('1.0.61');
    });
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

      vi.spyOn(fs, 'existsSync').mockImplementation((p) => {
        return p === '/usr/bin/node';
      });

      const result = await checkEnvironment();
      expect(result.success).toBe(false);
      expect(result.errorType).toBe('NODE_VERSION_TOO_LOW');
      expect(result.nodeVersion).toBe('v18.5.0');
      expect(result.nodePath).toBe('/usr/bin/node');
    });

    it('should fail with COPILOT_CLI_MISSING if Node succeeds but Copilot CLI is missing', async () => {
      mockExec = (cmd: string, cb: any) =>
        cb(null, { stdout: '/usr/bin/node\n' });
      mockExecFile = (file: string, args: string[], cb: any) =>
        cb(null, { stdout: 'v22.2.0\n' });

      vi.spyOn(fs, 'existsSync').mockImplementation((p) => {
        // Return true only for node binary, false for copilot files
        return p === '/usr/bin/node';
      });

      const result = await checkEnvironment();
      expect(result.success).toBe(false);
      expect(result.errorType).toBe('COPILOT_CLI_MISSING');
      expect(result.nodeVersion).toBe('v22.2.0');
    });

    it('should return success if both Node and Copilot CLI are valid', async () => {
      mockExec = (cmd: string, cb: any) =>
        cb(null, { stdout: '/usr/bin/node\n' });
      mockExecFile = (file: string, args: string[], cb: any) =>
        cb(null, { stdout: 'v22.2.0\n' });

      global.eval = vi.fn().mockImplementation((val) => {
        if (val === "require.resolve('@github/copilot-sdk')") {
          return '/mock/node_modules/@github/copilot-sdk/dist/cjs/index.js';
        }
        return undefined;
      });

      vi.spyOn(fs, 'existsSync').mockReturnValue(true);

      vi.spyOn(fs, 'readFileSync').mockImplementation((p: any) => {
        if (p.includes('copilot-sdk/package.json')) {
          return JSON.stringify({
            dependencies: { '@github/copilot': '^1.0.61' },
          });
        }
        if (p.includes('copilot/package.json')) {
          return JSON.stringify({ version: '1.0.61' });
        }
        return '';
      });

      const result = await checkEnvironment();
      expect(result.success).toBe(true);
      expect(result.nodeVersion).toBe('v22.2.0');
      expect(result.nodePath).toBe('/usr/bin/node');
    });
  });

  describe('getNodePath', () => {
    it('should return path on success even if Copilot CLI is missing', async () => {
      mockExec = (cmd: string, cb: any) =>
        cb(null, { stdout: '/usr/bin/node\n' });
      mockExecFile = (file: string, args: string[], cb: any) =>
        cb(null, { stdout: 'v22.0.0\n' });

      vi.spyOn(fs, 'existsSync').mockImplementation((p) => {
        return p === '/usr/bin/node'; // Node exists, Copilot CLI does not
      });

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

    it('should return the path in the managed directory if it exists', () => {
      const expectedPath = path.join(
        '/mock/userData',
        'copilot-cli',
        'node_modules',
        '@github',
        'copilot',
        'index.js',
      );

      vi.spyOn(fs, 'existsSync').mockImplementation((p) => {
        return p === expectedPath;
      });

      const scriptPath = getCopilotScriptPath();
      expect(scriptPath).toBe(expectedPath);
    });
  });

  describe('installCopilotCli', () => {
    it('should run npm install and return success', async () => {
      // Mock Node detection succeeding
      mockExec = (cmd: string, cb: any) =>
        cb(null, { stdout: '/usr/bin/node\n' });
      mockExecFile = (file: string, args: string[], cb: any) => {
        if (file === '/usr/bin/node') {
          cb(null, { stdout: 'v22.0.0\n' });
        } else {
          // npm install command
          cb(null, { stdout: 'installed' });
        }
      };

      global.eval = vi.fn().mockImplementation((val) => {
        if (val === "require.resolve('@github/copilot-sdk')") {
          return '/mock/node_modules/@github/copilot-sdk/dist/cjs/index.js';
        }
        return undefined;
      });

      vi.spyOn(fs, 'existsSync').mockImplementation((p: any) => {
        const normalized = path.normalize(p);
        return (
          normalized ===
            path.normalize(
              '/mock/node_modules/@github/copilot-sdk/package.json',
            ) ||
          normalized === path.normalize('/usr/bin/node') ||
          normalized.includes('copilot/package.json') ||
          normalized.includes('copilot/index.js') ||
          normalized.includes('copilot-cli')
        );
      });

      vi.spyOn(fs, 'readFileSync').mockImplementation((p: any) => {
        if (p.includes('copilot-sdk/package.json')) {
          return JSON.stringify({
            dependencies: { '@github/copilot': '^1.0.61' },
          });
        }
        if (p.includes('copilot/package.json')) {
          return JSON.stringify({ version: '1.0.61' });
        }
        return '';
      });

      const res = await installCopilotCli();
      expect(res.success).toBe(true);
    });
  });
});
