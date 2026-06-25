import { exec, execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import { EnvironmentCheckResult } from '../../../types';

const execPromise = promisify(exec);
const execFilePromise = promisify(execFile);

const MIN_NODE_VERSION = 22;

export function getManagedCopilotDir(): string {
  try {
    return path.join(app.getPath('userData'), 'copilot-cli');
  } catch {
    // Fallback for tests or when app is not ready/mocked
    return path.join(process.cwd(), '.copilot-cli-test');
  }
}

export function getRequiredCopilotVersion(): string {
  try {
    const sdkEntryPoint = eval("require.resolve('@github/copilot-sdk')");
    let dir = path.dirname(sdkEntryPoint);
    for (let i = 0; i < 5; i++) {
      const candidate = path.join(dir, 'package.json');
      if (fs.existsSync(candidate)) {
        const pkg = JSON.parse(fs.readFileSync(candidate, 'utf8'));
        const version = pkg.dependencies?.['@github/copilot'];
        if (version) {
          return version.replace(/^[\^~]/, '');
        }
      }
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  } catch (e) {
    console.warn(
      'Failed to resolve required @github/copilot version dynamically:',
      e,
    );
  }
  return '1.0.61'; // Fallback
}

function getCopilotPackageInfo(copilotPkgDir: string): {
  version: string;
  binScript: string;
} | null {
  try {
    const pkgJsonPath = path.join(copilotPkgDir, 'package.json');
    if (fs.existsSync(pkgJsonPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
      let binScript = 'npm-loader.js';
      if (pkg.bin && typeof pkg.bin === 'object' && pkg.bin.copilot) {
        binScript = pkg.bin.copilot;
      } else if (typeof pkg.bin === 'string') {
        binScript = pkg.bin;
      }
      return {
        version: pkg.version,
        binScript,
      };
    }
  } catch (err) {
    console.warn('Failed to parse Copilot CLI package.json:', err);
  }
  return null;
}

function isVersionOlder(toCheck: string, baseline: string): boolean {
  const partsToCheck = toCheck.split('.').map(Number);
  const partsBaseline = baseline.split('.').map(Number);
  for (
    let i = 0;
    i < Math.max(partsToCheck.length, partsBaseline.length);
    i++
  ) {
    const pToCheck = partsToCheck[i] || 0;
    const pBaseline = partsBaseline[i] || 0;
    if (pToCheck < pBaseline) return true;
    if (pToCheck > pBaseline) return false;
  }
  return false;
}

export async function checkCopilotCli(): Promise<{
  success: boolean;
  errorType: 'COPILOT_CLI_MISSING' | 'COPILOT_CLI_OUTDATED' | null;
  installedVersion?: string;
  requiredVersion?: string;
  message?: string;
}> {
  const managedDir = getManagedCopilotDir();
  const copilotDir = path.join(
    managedDir,
    'node_modules',
    '@github',
    'copilot',
  );
  const pkgJsonPath = path.join(copilotDir, 'package.json');
  const requiredVersion = getRequiredCopilotVersion();

  if (!fs.existsSync(pkgJsonPath)) {
    return {
      success: false,
      errorType: 'COPILOT_CLI_MISSING',
      requiredVersion,
      message: 'GitHub Copilot CLI is not installed locally.',
    };
  }

  try {
    const pkgInfo = getCopilotPackageInfo(copilotDir);
    if (!pkgInfo) {
      return {
        success: false,
        errorType: 'COPILOT_CLI_MISSING',
        requiredVersion,
        message: 'Failed to read version from local Copilot CLI installation.',
      };
    }

    if (isVersionOlder(pkgInfo.version, requiredVersion)) {
      return {
        success: false,
        errorType: 'COPILOT_CLI_OUTDATED',
        installedVersion: pkgInfo.version,
        requiredVersion,
        message: `GitHub Copilot CLI is outdated. Installed: ${pkgInfo.version}, Required: ${requiredVersion}`,
      };
    }

    const scriptPath = path.join(copilotDir, pkgInfo.binScript);
    if (!fs.existsSync(scriptPath)) {
      return {
        success: false,
        errorType: 'COPILOT_CLI_MISSING',
        requiredVersion,
        message: 'GitHub Copilot CLI entry point is missing.',
      };
    }

    return {
      success: true,
      errorType: null,
      installedVersion: pkgInfo.version,
      requiredVersion,
    };
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      errorType: 'COPILOT_CLI_MISSING',
      requiredVersion,
      message: `Failed to read local Copilot CLI installation: ${errMsg}`,
    };
  }
}

async function checkNodeEnvironment(): Promise<{
  success: boolean;
  nodePath: string | null;
  nodeVersion: string | null;
  errorType: 'NODE_NOT_FOUND' | 'NODE_VERSION_TOO_LOW' | null;
  message: string | null;
}> {
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
      errorType: 'NODE_VERSION_TOO_LOW',
      message: `The resolved Node.js version is ${highestVersionFound.version}. Version ${MIN_NODE_VERSION} or above is required to run the Copilot CLI.`,
    };
  }

  return {
    success: false,
    nodePath: null,
    nodeVersion: null,
    errorType: 'NODE_NOT_FOUND',
    message: `Node.js was not found on your system PATH. Node.js version ${MIN_NODE_VERSION} or above is required.`,
  };
}

export async function checkEnvironment(): Promise<EnvironmentCheckResult> {
  const nodeResult = await checkNodeEnvironment();
  if (!nodeResult.success) {
    return {
      success: false,
      nodePath: nodeResult.nodePath,
      nodeVersion: nodeResult.nodeVersion,
      minRequiredVersion: MIN_NODE_VERSION,
      errorType: nodeResult.errorType,
      message: nodeResult.message,
    };
  }

  const copilotResult = await checkCopilotCli();
  if (!copilotResult.success) {
    return {
      success: false,
      nodePath: nodeResult.nodePath,
      nodeVersion: nodeResult.nodeVersion,
      minRequiredVersion: MIN_NODE_VERSION,
      errorType: copilotResult.errorType,
      message: copilotResult.message,
      requiredCopilotVersion: copilotResult.requiredVersion,
      installedCopilotVersion: copilotResult.installedVersion,
    };
  }

  return {
    success: true,
    nodePath: nodeResult.nodePath,
    nodeVersion: nodeResult.nodeVersion,
    minRequiredVersion: MIN_NODE_VERSION,
    errorType: null,
    message: null,
  };
}

export async function getNodePath(): Promise<string | null> {
  const result = await checkNodeEnvironment();
  return result.success ? result.nodePath : null;
}

export function getCopilotScriptPath(): string | null {
  // Check the managed directory first
  const managedDir = getManagedCopilotDir();
  const copilotDir = path.join(
    managedDir,
    'node_modules',
    '@github',
    'copilot',
  );
  if (fs.existsSync(copilotDir)) {
    const pkgInfo = getCopilotPackageInfo(copilotDir);
    if (pkgInfo) {
      const candidate = path.join(copilotDir, pkgInfo.binScript);
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
  }

  // Fallback to peer package resolution if running in dev/test environment
  try {
    const sdkEntryPoint = eval("require.resolve('@github/copilot-sdk')");
    let dir = path.dirname(sdkEntryPoint);
    for (let i = 0; i < 5; i++) {
      const fallbackDir = path.join(dir, '@github', 'copilot');
      if (fs.existsSync(fallbackDir)) {
        const pkgInfo = getCopilotPackageInfo(fallbackDir);
        const fallbackCandidate = path.join(fallbackDir, pkgInfo.binScript);
        if (fs.existsSync(fallbackCandidate)) {
          return fallbackCandidate;
        }
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

export async function installCopilotCli(): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const nodePath = await getNodePath();
    if (!nodePath) {
      return { success: false, error: 'Node.js executable not found' };
    }

    const managedDir = getManagedCopilotDir();

    // Ensure the managed directory exists
    if (!fs.existsSync(managedDir)) {
      fs.mkdirSync(managedDir, { recursive: true });
    }

    // Write package.json if it doesn't exist
    const pkgJsonPath = path.join(managedDir, 'package.json');
    if (!fs.existsSync(pkgJsonPath)) {
      fs.writeFileSync(
        pkgJsonPath,
        JSON.stringify(
          {
            name: 'stitch-copilot-cli',
            version: '1.0.0',
            private: true,
          },
          null,
          2,
        ),
      );
    }

    // Locate npm relative to nodePath or fallback to system path
    let npmCmd = 'npm';
    const nodeDir = path.dirname(nodePath);
    const isWin = process.platform === 'win32';

    if (isWin) {
      const candidates = [
        path.join(nodeDir, 'npm.cmd'),
        path.join(nodeDir, 'npm.bat'),
        path.join(nodeDir, 'npm.exe'),
      ];
      for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
          npmCmd = candidate;
          break;
        }
      }
    } else {
      const candidate = path.join(nodeDir, 'npm');
      if (fs.existsSync(candidate)) {
        npmCmd = candidate;
      }
    }

    const requiredVersion = getRequiredCopilotVersion();
    const pkgToInstall = `@github/copilot@${requiredVersion}`;

    // Execute installation
    const args = ['install', '--no-audit', '--no-fund', pkgToInstall];

    console.log(
      `Running install command: ${npmCmd} ${args.join(' ')} in ${managedDir}`,
    );

    if (path.isAbsolute(npmCmd)) {
      const finalCmd =
        isWin && npmCmd.includes(' ') && !npmCmd.startsWith('"')
          ? `"${npmCmd}"`
          : npmCmd;
      await execFilePromise(finalCmd, args, {
        cwd: managedDir,
        shell: isWin,
      });
    } else {
      // Fallback: run via shell if npmCmd is just 'npm'
      await execPromise(`npm install --no-audit --no-fund ${pkgToInstall}`, {
        cwd: managedDir,
      });
    }

    // Verify it works by checking checkCopilotCli()
    const verifyResult = await checkCopilotCli();
    if (!verifyResult.success) {
      return {
        success: false,
        error: verifyResult.message || 'Installation verification failed.',
      };
    }

    return { success: true };
  } catch (err: unknown) {
    console.error('Error installing Copilot CLI:', err);
    const errMsg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      error: errMsg || 'An unknown error occurred during installation.',
    };
  }
}
