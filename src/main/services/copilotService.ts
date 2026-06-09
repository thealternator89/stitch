// Since we dynamically import the SDK, we need to use any - disable eslint rule
/* eslint-disable @typescript-eslint/no-explicit-any */
async function createCopilotClient(copilotToken?: string) {
  // Eval to avoid webpack interfering with the import
  const { CopilotClient, approveAll } = await eval(
    'import("@github/copilot-sdk")',
  );

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
  const disableEnvVal = process.env.DISABLE_COPILOT_WINDOWS_WORKAROUND || '';
  const env = copilotToken
    ? {
        ...process.env,
        GITHUB_TOKEN: copilotToken,
        COPILOT_TOKEN: copilotToken,
      }
    : undefined;

  if (process.platform === 'win32' && !['1', 'true'].includes(disableEnvVal)) {
    if (!process.env.NODE_PATH || !process.env.COPILOT_SCRIPT_PATH) {
      throw new Error(
        'On Windows, both NODE_PATH and COPILOT_SCRIPT_PATH environment variables are required to initialise the Copilot client.',
      );
    }
    return {
      client: new CopilotClient({
        cliPath: process.env.NODE_PATH,
        cliArgs: [process.env.COPILOT_SCRIPT_PATH],
        useStdio: true,
        env,
      }),
      approveAll,
    };
  }

  return { client: new CopilotClient({ env }), approveAll };
}

import {
  TicketData,
  DocPageData,
  CopilotModel,
  AppSettings,
} from '../../types';
import {
  buildStoryPrompt,
  buildTestCasePrompt,
  buildStoryElaboratorPrompt,
  buildPromptComplexityCheckPrompt,
} from './copilotPrompts';

export class CopilotService {
  private model = 'gpt-4.1';
  private cachedModels: CopilotModel[] = [];

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
    onTool?: (type: 'start' | 'end', tool: string, success?: boolean) => void,
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
          onTool('start', toolName);
        }
      } else if (event.type === 'tool.execution_complete') {
        const toolName =
          activeToolCalls.get(event.data.toolCallId) || 'unknown';
        activeToolCalls.delete(event.data.toolCallId);
        if (onTool) {
          onTool('end', toolName, event.data.success);
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
          await session.destroy();
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
          await session.destroy();
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
          await session.destroy();
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
        (type, tool, success) =>
          onLine(
            JSON.stringify({ type: 'tool', status: type, name: tool, success }),
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
        (type, tool, success) =>
          onLine(
            JSON.stringify({ type: 'tool', status: type, name: tool, success }),
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
      await session.destroy();
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
        await data.session.destroy();
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
