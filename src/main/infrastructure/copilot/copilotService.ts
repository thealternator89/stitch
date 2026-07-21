import fs from 'fs';
import path from 'path';
import {
  CopilotModel,
  EnvironmentCheckResult,
  CopilotUsage,
} from '../../../types';
import {
  checkEnvironment,
  getNodePath,
  getCopilotScriptPath,
  installCopilotCli,
} from './copilotDetector';

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

  if (!nodePath || !copilotScriptPath) {
    throw new Error(
      `Copilot CLI client cannot be started: Node.js executable or Copilot CLI script path could not be resolved. Node.js path: ${nodePath}, Copilot script path: ${copilotScriptPath}`,
    );
  }

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

function parseResilientJSONL(
  text: string,
  onLine: (line: string) => void,
): string {
  let tempBuffer = text;
  let changed = true;

  while (changed) {
    changed = false;
    const startIdx = tempBuffer.indexOf('{');
    if (startIdx === -1) {
      // Discard all non-JSON prefix noise if there is no opening brace in the buffer
      tempBuffer = '';
      break;
    }

    if (startIdx > 0) {
      tempBuffer = tempBuffer.slice(startIdx);
    }

    let searchStart = 1;
    while (true) {
      const closeIdx = tempBuffer.indexOf('}', searchStart);
      if (closeIdx === -1) {
        break;
      }

      const candidate = tempBuffer.slice(0, closeIdx + 1);
      try {
        JSON.parse(candidate);
        onLine(candidate);
        tempBuffer = tempBuffer.slice(closeIdx + 1);
        changed = true;
        break; // break inner loop, restart search from the new start of the buffer
      } catch {
        searchStart = closeIdx + 1;
      }
    }
  }

  return tempBuffer;
}

export class TimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`[TIMEOUT_ERROR] Timeout after ${timeoutMs}ms waiting for response`);
    this.name = 'TimeoutError';
  }
}

function getTimeoutMs(): number {
  if (process.env.STITCH_COPILOT_TIMEOUT) {
    const parsed = parseInt(process.env.STITCH_COPILOT_TIMEOUT, 10);
    if (!isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return 180_000;
}

export class CopilotService {
  private model = 'auto';
  private cachedModels: CopilotModel[] = [];
  private promptLogPath = process.env.STITCH_PROMPT_LOG || null;

  async checkEnvironment(): Promise<EnvironmentCheckResult> {
    return checkEnvironment();
  }

  async installCopilotCli(): Promise<{ success: boolean; error?: string }> {
    return installCopilotCli();
  }

  setModel(model: string) {
    if (model) {
      this.model = model;
    }
  }

  getModel(): string {
    return this.model;
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

  getCachedModels(): CopilotModel[] {
    return this.cachedModels;
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

  private logPrompt(prompt: string): void {
    if (!this.promptLogPath) {
      return;
    }
    try {
      const dir = path.dirname(this.promptLogPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const logEntry = `\n=========================================\n[${new Date().toISOString()}] Prompt:\n=========================================\n${prompt}\n`;
      fs.appendFileSync(this.promptLogPath, logEntry, 'utf8');
    } catch (error: any) {
      console.error(
        `Failed to write prompt log to ${this.promptLogPath}:`,
        error.message || error,
      );
    }
  }

  async createClientAndSession(
    copilotToken: string | undefined,
    modelOverride: string | undefined,
    options: {
      workingDirectory?: string | null;
      availableTools?: any[];
      tools?: any[];
      streaming?: boolean;
    },
  ): Promise<{ client: any; session: any; approveAll: any }> {
    const { client, approveAll } = await createCopilotClient(copilotToken);
    await client.start();
    const sessionOptions: any = {
      model: modelOverride || this.model,
      onPermissionRequest: approveAll,
      streaming: options.streaming ?? true,
    };
    if (options.workingDirectory) {
      sessionOptions.workingDirectory = options.workingDirectory;
    } else if (options.availableTools) {
      sessionOptions.availableTools = options.availableTools;
    }
    if (options.tools) {
      sessionOptions.tools = options.tools;
    }
    const session = await client.createSession(sessionOptions);
    return { client, session, approveAll };
  }

  async sendAndCollectStream(
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
  ): Promise<string> {
    this.logPrompt(prompt);
    const timeoutMs = getTimeoutMs();
    const chunks: string[] = [];
    let buffer = '';
    let lastAssistantMessage: any = null;
    let resolvePromise: (value: string) => void;
    let rejectPromise: (reason: any) => void;

    const sessionUsage: CopilotUsage = {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cost: 0,
    };
    session.usage = sessionUsage;

    const completionPromise = new Promise<string>((resolve, reject) => {
      resolvePromise = resolve;
      rejectPromise = reject;
    });

    let timeoutId: NodeJS.Timeout | undefined;
    const activeToolCalls = new Map<string, string>();

    const resetTimeout = () => {
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
        timeoutId = undefined;
      }
      if (activeToolCalls.size > 0) {
        return;
      }
      timeoutId = setTimeout(() => {
        rejectPromise(new TimeoutError(timeoutMs));
      }, timeoutMs);
    };

    const unsubscribe = session.on((event: any) => {
      if (event.type === 'assistant.message_delta') {
        resetTimeout();
        const delta = event.data?.deltaContent;
        if (delta) {
          chunks.push(delta);
          if (onLine) {
            buffer = parseResilientJSONL(buffer + delta, onLine);
          }
        }
      } else if (event.type === 'assistant.message') {
        lastAssistantMessage = event;
      } else if (event.type === 'assistant.usage') {
        sessionUsage.inputTokens += event.data?.inputTokens ?? 0;
        sessionUsage.outputTokens += event.data?.outputTokens ?? 0;
        sessionUsage.cacheReadTokens += event.data?.cacheReadTokens ?? 0;
        if (event.data?.cost !== undefined) {
          sessionUsage.cost = event.data.cost;
        }
        if (event.data?.model !== undefined) {
          sessionUsage.model = event.data.model;
        }
      } else if (event.type === 'session.idle') {
        if (onLine && buffer.trim()) {
          buffer = parseResilientJSONL(buffer, onLine);
          buffer = '';
        }
        const fullContent =
          chunks.join('') || lastAssistantMessage?.data?.content || '';

        // Fallback: If nothing was streamed (e.g. chunks was empty), stream the fullContent
        if (onLine && chunks.length === 0 && fullContent.trim()) {
          parseResilientJSONL(fullContent, onLine);
        }

        resolvePromise(fullContent);
      } else if (event.type === 'tool.execution_start') {
        const toolName = event.data.toolName;
        activeToolCalls.set(event.data.toolCallId, toolName);
        resetTimeout();
        if (onTool) {
          onTool('start', toolName, undefined, undefined, event.data.arguments);
        }
      } else if (event.type === 'tool.execution_complete') {
        const toolName =
          activeToolCalls.get(event.data.toolCallId) || 'unknown';
        activeToolCalls.delete(event.data.toolCallId);
        resetTimeout();
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
      resetTimeout();
      await session.send({ prompt });
      return await completionPromise;
    } finally {
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }
      unsubscribe();
    }
  }
}
