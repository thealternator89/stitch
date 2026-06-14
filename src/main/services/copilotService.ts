import { exec, execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import {
  TicketData,
  DocPageData,
  CopilotModel,
  AppSettings,
  EnvironmentCheckResult,
} from '../../types';

const execPromise = promisify(exec);
const execFilePromise = promisify(execFile);

const MIN_NODE_VERSION = 22;

// Windows has weird redirection issues, where the wrapper exits causing stdio to drop
// To get around this, instead of launching `copilot` directly, we launch `node` with the
// `copilot` script as an argument. This seems to fix the issue.
//
// FIXME: Ideally once Copilot CLI or SDK come out of preview it will be working normally
// and we can remove this
//
// DISABLE_COPILOT_WINDOWS_WORKAROUND is provided to simplify periodic compatibility testing
// with new Copilot CLI/SDK releases on Windows. If the standard platform-agnostic approach
// starts working, the entire Windows workaround block below should be removed.
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

async function getNodePath(): Promise<string | null> {
  const result = await checkEnvironment();
  return result.success ? result.nodePath : null;
}

function getCopilotScriptPath(): string | null {
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

// Since we dynamically import the SDK, we need to use any - disable eslint rule
/* eslint-disable @typescript-eslint/no-explicit-any */
async function createCopilotClient(copilotToken?: string) {
  // Eval to avoid webpack interfering with the import
  const { CopilotClient, approveAll } = await eval(
    'import("@github/copilot-sdk")',
  );

  const env = {
    ...process.env,
    ELECTRON_RUN_AS_NODE: '1',
    ...(copilotToken
      ? {
          GITHUB_TOKEN: copilotToken,
          COPILOT_TOKEN: copilotToken,
        }
      : {}),
  };

  const nodePath = await getNodePath();
  const copilotScriptPath = getCopilotScriptPath();

  // If we found both the system node and the copilot script path, spawn the Copilot CLI
  // using the system node. This avoids Electron's process.argv parsing issues
  // (e.g. Commander.js bug) and packaging limitations.
  if (nodePath && copilotScriptPath) {
    return {
      client: new CopilotClient({
        connection: {
          kind: 'stdio',
          path: nodePath,
          args: [copilotScriptPath],
        },
        env,
      }),
      approveAll,
    };
  }

  // Fallback to the default platform-agnostic approach using process.execPath (Electron)
  return { client: new CopilotClient({ env }), approveAll };
}

import {
  buildStoryPrompt,
  buildTestCasePrompt,
  buildStoryElaboratorPrompt,
  buildPromptComplexityCheckPrompt,
} from './copilotPrompts';

export class CopilotService {
  private model = 'gpt-4.1';
  private cachedModels: CopilotModel[] = [];

  async checkEnvironment(): Promise<EnvironmentCheckResult> {
    return checkEnvironment();
  }

  setModel(model: string) {
    if (model) {
      this.model = model;
    }
  }

  async initializeAsync(copilotToken?: string): Promise<void> {
    try {
      await this.fetchAndCacheModels(copilotToken);
    } catch (error: any) {
      console.warn(
        'Could not pre-fetch Copilot models on startup:',
        error.message || error,
      );
    }
  }

  private async fetchAndCacheModels(
    copilotToken?: string,
  ): Promise<CopilotModel[]> {
    const { client } = await createCopilotClient(copilotToken);
    try {
      await client.start();
      const models = await client.listModels();
      this.cachedModels = models;
      return models;
    } catch (error) {
      console.error('Error fetching/caching Copilot models:', error);
      throw error;
    } finally {
      try {
        await client.stop();
      } catch (stopError) {
        console.error(
          'Error stopping Copilot client after fetching models:',
          stopError,
        );
      }
    }
  }

  async checkAuthStatus(copilotToken?: string) {
    const { client } = await createCopilotClient(copilotToken);
    try {
      await client.start();
      const authStatus = await client.getAuthStatus();
      const status = await client.getStatus();

      if (authStatus?.isAuthenticated) {
        try {
          // If authentication succeeds, refresh the cached models. This ensures a valid list
          // is populated if startup credentials were bad/missing, and reuses the active client.
          const models = await client.listModels();
          this.cachedModels = models;
        } catch (modelsError) {
          console.error(
            'Error refreshing models during auth check:',
            modelsError,
          );
        }
      }

      return { authStatus, status };
    } catch (error) {
      console.error('Error checking Copilot auth status:', error);
      throw error;
    } finally {
      try {
        await client.stop();
      } catch (stopError) {
        console.error(
          'Error stopping Copilot client in checkAuthStatus:',
          stopError,
        );
      }
    }
  }

  async listModels(copilotToken?: string): Promise<CopilotModel[]> {
    if (this.cachedModels.length > 0) {
      return this.cachedModels;
    }
    return this.fetchAndCacheModels(copilotToken);
  }

  clearCache(copilotToken?: string) {
    this.cachedModels = [];
    this.initializeAsync(copilotToken).catch((err) => {
      console.error(
        'Failed to re-initialize copilotService after settings update:',
        err,
      );
    });
  }

  private async sendAndCollectStream(
    session: any,
    prompt: string,
    onLine?: (line: string) => void,
    onTool?: (
      type: 'start' | 'end',
      tool: string,
      success?: boolean,
      error?: string,
      args?: any,
    ) => void,
    timeoutMs = 180000,
  ): Promise<string> {
    const chunks: string[] = [];
    let buffer = '';
    let lastAssistantMessage: any = null;
    let resolvePromise: (value: string) => void;
    let rejectPromise: (reason: any) => void;

    const completionPromise = new Promise<string>((resolve, reject) => {
      resolvePromise = resolve;
      rejectPromise = reject;
    });

    let timeoutId: NodeJS.Timeout | undefined;
    const activeToolCalls = new Map<string, string>();

    const unsubscribe = session.on((event: any) => {
      if (event.type === 'assistant.message_delta') {
        const delta = event.data?.deltaContent;
        if (delta) {
          chunks.push(delta);
          if (onLine) {
            buffer += delta;
            let newlineIndex;
            while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
              const line = buffer.slice(0, newlineIndex);
              buffer = buffer.slice(newlineIndex + 1);
              if (line.trim()) {
                onLine(line);
              }
            }
          }
        }
      } else if (event.type === 'assistant.message') {
        lastAssistantMessage = event;
      } else if (event.type === 'session.idle') {
        if (onLine && buffer.trim()) {
          onLine(buffer);
          buffer = '';
        }
        const fullContent =
          chunks.join('') || lastAssistantMessage?.data?.content || '';

        // Fallback: If nothing was streamed (e.g. chunks was empty), stream the fullContent
        if (onLine && chunks.length === 0 && fullContent.trim()) {
          const lines = fullContent.split('\n');
          for (const line of lines) {
            if (line.trim()) {
              onLine(line);
            }
          }
        }

        resolvePromise(fullContent);
      } else if (event.type === 'tool.execution_start') {
        const toolName = event.data.toolName;
        activeToolCalls.set(event.data.toolCallId, toolName);
        if (onTool) {
          onTool('start', toolName, undefined, undefined, event.data.arguments);
        }
      } else if (event.type === 'tool.execution_complete') {
        const toolName =
          activeToolCalls.get(event.data.toolCallId) || 'unknown';
        activeToolCalls.delete(event.data.toolCallId);
        if (onTool) {
          onTool(
            'end',
            toolName,
            event.data.success,
            event.data.error?.message,
          );
        }
      } else if (event.type === 'session.error') {
        const error = new Error(
          event.data?.message || 'Session error occurred',
        );
        if (event.data?.stack) {
          error.stack = event.data.stack;
        }
        rejectPromise(error);
      }
    });

    try {
      await session.send({ prompt });

      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(
            new Error(`Timeout after ${timeoutMs}ms waiting for response`),
          );
        }, timeoutMs);
      });

      return await Promise.race([completionPromise, timeoutPromise]);
    } finally {
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }
      unsubscribe();
    }
  }

  async generateTestCases(
    ticketData: TicketData,
    additionalContext: string,
    modelOverride: string,
    settings: AppSettings,
    onLine?: (line: string) => void,
  ) {
    const { client, approveAll } = await createCopilotClient(
      settings.copilotToken,
    );
    let session: any = null;
    try {
      await client.start();
      session = await client.createSession({
        model: modelOverride || this.model,
        availableTools: [],
        onPermissionRequest: approveAll,
        streaming: true,
      });

      const prompt = buildTestCasePrompt(
        ticketData.id || '',
        ticketData.title,
        ticketData.description,
        ticketData.acceptanceCriteria || '',
        additionalContext,
        settings,
      );

      const responseContent = await this.sendAndCollectStream(
        session,
        prompt,
        onLine,
        undefined,
        180000,
      );
      return responseContent;
    } catch (error) {
      console.error('Error generating test cases:', error);
      throw error;
    } finally {
      if (session) {
        try {
          await session.disconnect();
        } catch (e) {
          console.error('Error destroying session in generateTestCases:', e);
        }
      }
      try {
        await client.stop();
      } catch (e) {
        console.error('Error stopping client in generateTestCases:', e);
      }
    }
  }

  async generateStories(
    pageData: DocPageData,
    additionalContext: string,
    modelOverride: string,
    settings: AppSettings,
    onLine?: (line: string) => void,
  ): Promise<string> {
    const { client, approveAll } = await createCopilotClient(
      settings.copilotToken,
    );
    let session: any = null;
    try {
      await client.start();
      session = await client.createSession({
        model: modelOverride || this.model,
        availableTools: [],
        onPermissionRequest: approveAll,
        streaming: true,
      });

      const prompt = buildStoryPrompt(
        pageData.title,
        pageData.body,
        additionalContext,
        settings,
      );

      const responseContent = await this.sendAndCollectStream(
        session,
        prompt,
        onLine,
        undefined,
        180000,
      );
      return responseContent;
    } catch (error) {
      console.error('Error generating stories:', error);
      throw error;
    } finally {
      if (session) {
        try {
          await session.disconnect();
        } catch (e) {
          console.error('Error destroying session in generateStories:', e);
        }
      }
      try {
        await client.stop();
      } catch (e) {
        console.error('Error stopping client in generateStories:', e);
      }
    }
  }

  async checkPromptComplexity(
    type: 'story' | 'testcase',
    prompts: any,
    settings: AppSettings,
    modelOverride?: string,
  ): Promise<string> {
    const { client, approveAll } = await createCopilotClient(
      settings.copilotToken,
    );
    let session: any = null;
    try {
      await client.start();
      session = await client.createSession({
        model: modelOverride || this.model,
        availableTools: [],
        onPermissionRequest: approveAll,
        streaming: false,
      });

      let promptToCheck = '';
      if (type === 'story') {
        promptToCheck = buildStoryPrompt(
          '[Page Title Placeholder]',
          '[Page Content Placeholder]',
          '[Additional Context Placeholder]',
          { prompts: { storyWriter: prompts } },
        );
      } else {
        promptToCheck = buildTestCasePrompt(
          '[Ticket ID Placeholder]',
          '[Title Placeholder]',
          '[Description Placeholder]',
          '[Acceptance Criteria Placeholder]',
          '[Additional Context Placeholder]',
          { prompts: { testCaseWriter: prompts } },
        );
      }

      const metaPrompt = buildPromptComplexityCheckPrompt(promptToCheck);

      const responseContent = await this.sendAndCollectStream(
        session,
        metaPrompt,
        undefined,
        undefined,
        180000,
      );
      return responseContent;
    } catch (error) {
      console.error('Error checking prompt complexity:', error);
      throw error;
    } finally {
      if (session) {
        try {
          await session.disconnect();
        } catch (e) {
          console.error(
            'Error destroying session in checkPromptComplexity:',
            e,
          );
        }
      }
      try {
        await client.stop();
      } catch (e) {
        console.error('Error stopping client in checkPromptComplexity:', e);
      }
    }
  }

  private activeElaborations = new Map<string, { client: any; session: any }>();

  async startStoryElaboration(
    ticketData: TicketData,
    repoPath: string | null,
    additionalContext: string,
    modelOverride: string,
    settings: AppSettings,
    onLine?: (line: string) => void,
  ): Promise<string> {
    // Stop any existing session for this ticket
    await this.stopStoryElaboration(ticketData.id || '');

    const { client, approveAll } = await createCopilotClient(
      settings.copilotToken,
    );
    let session: any = null;
    try {
      await client.start();

      const sessionOptions: any = {
        model: modelOverride || this.model,
        onPermissionRequest: approveAll,
        streaming: true,
      };

      if (repoPath) {
        sessionOptions.workingDirectory = repoPath;
      } else {
        sessionOptions.availableTools = [];
      }

      session = await client.createSession(sessionOptions);

      // Store in map so we can continue or stop later
      this.activeElaborations.set(ticketData.id || '', { client, session });

      const prompt = buildStoryElaboratorPrompt(
        ticketData,
        additionalContext,
        settings,
        !!repoPath,
      );

      const responseContent = await this.sendAndCollectStream(
        session,
        prompt,
        onLine,
        (type, tool, success, error, args) =>
          onLine(
            JSON.stringify({
              type: 'tool',
              status: type,
              name: tool,
              success,
              error,
              arguments: args,
            }),
          ),
        180000,
      );
      return responseContent;
    } catch (error) {
      console.error('Error starting story elaboration:', error);
      // Clean up if it failed
      await this.stopStoryElaboration(ticketData.id || '');
      throw error;
    }
  }

  async sendElaborationAnswer(
    ticketId: string,
    answer: string,
    onLine?: (line: string) => void,
  ): Promise<string> {
    const data = this.activeElaborations.get(ticketId);
    if (!data) {
      throw new Error(
        `No active story elaboration session found for ticket ID: ${ticketId}`,
      );
    }

    const { session } = data;
    try {
      const responseContent = await this.sendAndCollectStream(
        session,
        answer,
        onLine,
        (type, tool, success, error, args) =>
          onLine(
            JSON.stringify({
              type: 'tool',
              status: type,
              name: tool,
              success,
              error,
              arguments: args,
            }),
          ),
        180000,
      );
      return responseContent;
    } catch (error) {
      console.error(
        `Error sending answer to story elaboration session for ticket ${ticketId}:`,
        error,
      );
      throw error;
    }
  }

  async stopStoryElaboration(ticketId: string): Promise<void> {
    const data = this.activeElaborations.get(ticketId);
    if (!data) return;

    this.activeElaborations.delete(ticketId);
    const { client, session } = data;
    try {
      await session.disconnect();
    } catch (e) {
      console.error('Error destroying session in stopStoryElaboration:', e);
    }
    try {
      await client.stop();
    } catch (e) {
      console.error('Error stopping client in stopStoryElaboration:', e);
    }
  }

  async cleanup() {
    for (const [ticketId, data] of this.activeElaborations.entries()) {
      try {
        await data.session.disconnect();
        await data.client.stop();
      } catch (e) {
        console.error(
          `Error cleaning up active elaboration session for ticket ${ticketId}:`,
          e,
        );
      }
    }
    this.activeElaborations.clear();
  }
}
