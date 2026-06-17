import {
  TicketData,
  DocPageData,
  CopilotModel,
  AppSettings,
  EnvironmentCheckResult,
} from '../../types';
import {
  checkEnvironment,
  getNodePath,
  getCopilotScriptPath,
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

export class CopilotService {
  private model = 'auto';
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
    timeoutMs = 60000,
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

    const resetTimeout = () => {
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
        timeoutId = undefined;
      }
      if (activeToolCalls.size > 0) {
        return;
      }
      timeoutId = setTimeout(() => {
        rejectPromise(
          new Error(`Timeout after ${timeoutMs}ms waiting for response`),
        );
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
