import { exec, execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { EnvironmentCheckResult } from '../../../types';

const execPromise = promisify(exec);
const execFilePromise = promisify(execFile);

const MIN_NODE_VERSION = 22;

const DISABLE_WINDOWS_WORKAROUND = ['1', 'true'].includes(
  process.env.DISABLE_COPILOT_WINDOWS_WORKAROUND || '',
);

export async function checkEnvironment(): Promise<EnvironmentCheckResult> {
  // Respect user-specified NODE_PATH first
  if (!DISABLE_WINDOWS_WORKAROUND && process.env.NODE_PATH) {
    const nodePath = process.env.NODE_PATH;
    if (fs.existsSync(nodePath)) {
      try {
        const { stdout } = await execFilePromise(nodePath, ['--version']);
        const versionStr = stdout.trim();
        const match = versionStr.match(/^v?(\d+)\./);
        if (match) {
          const majorVersion = parseInt(match[1], 10);
          if (majorVersion >= MIN_NODE_VERSION) {
            return {
              success: true,
              nodePath,
              nodeVersion: versionStr,
              minRequiredVersion: MIN_NODE_VERSION,
              errorType: null,
              message: null,
            };
          } else {
            return {
              success: false,
              nodePath,
              nodeVersion: versionStr,
              minRequiredVersion: MIN_NODE_VERSION,
              errorType: 'NODE_VERSION_TOO_LOW',
              message: `The resolved Node.js version is ${versionStr}. Version ${MIN_NODE_VERSION} or above is required to run the Copilot CLI.`,
            };
          }
        }
      } catch (error: unknown) {
        console.warn(`Failed to verify NODE_PATH version:`, error);
      }
    }
  }

  const cmd = process.platform === 'win32' ? 'where node' : 'which -a node';
  let stdout = '';
  try {
    const res = await execPromise(cmd);
    stdout = res.stdout;
  } catch {
    // which/where failed (command not found or exit code non-zero because no matches)
  }

  const candidates = stdout
    .trim()
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (candidates.length === 0) {
    return {
      success: false,
      nodePath: null,
      nodeVersion: null,
      minRequiredVersion: MIN_NODE_VERSION,
      errorType: 'NODE_NOT_FOUND',
      message: `Node.js was not found on your system PATH. Node.js version ${MIN_NODE_VERSION} or above is required.`,
    };
  }

  let highestVersionFound: {
    path: string;
    version: string;
    major: number;
  } | null = null;

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      try {
        const { stdout: verStdout } = await execFilePromise(candidate, [
          '--version',
        ]);
        const versionStr = verStdout.trim();
        const match = versionStr.match(/^v?(\d+)\./);
        if (match) {
          const majorVersion = parseInt(match[1], 10);
          if (majorVersion >= MIN_NODE_VERSION) {
            // Found a valid one! Return immediately
            return {
              success: true,
              nodePath: candidate,
              nodeVersion: versionStr,
              minRequiredVersion: MIN_NODE_VERSION,
              errorType: null,
              message: null,
            };
          }

          if (
            !highestVersionFound ||
            majorVersion > highestVersionFound.major
          ) {
            highestVersionFound = {
              path: candidate,
              version: versionStr,
              major: majorVersion,
            };
          }
        }
      } catch {
        // ignore invalid files / execution errors
      }
    }
  }

  if (highestVersionFound) {
    return {
      success: false,
      nodePath: highestVersionFound.path,
      nodeVersion: highestVersionFound.version,
      minRequiredVersion: MIN_NODE_VERSION,
      errorType: 'NODE_VERSION_TOO_LOW',
      message: `The resolved Node.js version is ${highestVersionFound.version}. Version ${MIN_NODE_VERSION} or above is required to run the Copilot CLI.`,
    };
  }

  return {
    success: false,
    nodePath: null,
    nodeVersion: null,
    minRequiredVersion: MIN_NODE_VERSION,
    errorType: 'NODE_NOT_FOUND',
    message: `Node.js was not found on your system PATH. Node.js version ${MIN_NODE_VERSION} or above is required.`,
  };
}

export async function getNodePath(): Promise<string | null> {
  const result = await checkEnvironment();
  return result.success ? result.nodePath : null;
}

export function getCopilotScriptPath(): string | null {
  // Respect user-specified COPILOT_SCRIPT_PATH first (unless the workaround test bypass is active)
  if (!DISABLE_WINDOWS_WORKAROUND && process.env.COPILOT_SCRIPT_PATH) {
    return process.env.COPILOT_SCRIPT_PATH;
  }

  try {
    // Locate the peer `@github/copilot` package directory relative to `@github/copilot-sdk`
    // Webpack wraps require.resolve, but eval('require.resolve') runs standard Node resolution at runtime.
    const sdkEntryPoint = eval("require.resolve('@github/copilot-sdk')");

    // Traverse up to find the peer `@github/copilot/index.js`
    let dir = path.dirname(sdkEntryPoint);
    for (let i = 0; i < 5; i++) {
      const candidate = path.join(dir, '@github', 'copilot', 'index.js');
      if (fs.existsSync(candidate)) {
        return candidate;
      }
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  } catch (e) {
    console.warn(
      'Could not locate bundled copilot script path dynamically:',
      e,
    );
  }
  return null;
}
