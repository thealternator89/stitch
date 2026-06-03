// Since we dynamically import the SDK, we need to use any - disable eslint rule
/* eslint-disable @typescript-eslint/no-explicit-any */
async function createCopilotClient() {
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
      }),
      approveAll,
    };
  }

  return { client: new CopilotClient(), approveAll };
}

import { TicketData, DocPageData, CopilotModel } from '../../types';

export class CopilotService {
  private model = 'gpt-4.1';
  private cachedModels: CopilotModel[] = [];

  setModel(model: string) {
    if (model) {
      this.model = model;
    }
  }

  async initializeAsync(): Promise<void> {
    try {
      await this.fetchAndCacheModels();
    } catch (error: any) {
      console.warn(
        'Could not pre-fetch Copilot models on startup:',
        error.message || error,
      );
    }
  }

  private async fetchAndCacheModels(): Promise<CopilotModel[]> {
    const { client } = await createCopilotClient();
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

  async checkAuthStatus() {
    const { client } = await createCopilotClient();
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

  async listModels(): Promise<CopilotModel[]> {
    if (this.cachedModels.length > 0) {
      return this.cachedModels;
    }
    return this.fetchAndCacheModels();
  }

  clearCache() {
    this.cachedModels = [];
    this.initializeAsync().catch((err) => {
      console.error(
        'Failed to re-initialize copilotService after settings update:',
        err,
      );
    });
  }

  private async sendAndCollectStream(
    session: any,
    prompt: string,
    onLineOrTimeout?: ((line: string) => void) | number,
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

    let onLine: ((line: string) => void) | undefined;
    let actualTimeout = timeoutMs;

    if (typeof onLineOrTimeout === 'number') {
      actualTimeout = onLineOrTimeout;
    } else {
      onLine = onLineOrTimeout;
    }

    let timeoutId: NodeJS.Timeout | undefined;

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
        }
        const fullContent =
          chunks.join('') || lastAssistantMessage?.data?.content || '';
        resolvePromise(fullContent);
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
            new Error(`Timeout after ${actualTimeout}ms waiting for response`),
          );
        }, actualTimeout);
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
    onLine?: (line: string) => void,
  ) {
    const { client, approveAll } = await createCopilotClient();
    let session: any = null;
    try {
      await client.start();
      session = await client.createSession({
        model: modelOverride || this.model,
        availableTools: [],
        onPermissionRequest: approveAll,
        streaming: true,
      });

      const prompt = `
        Generate a set of comprehensive test cases for the following user story/ticket.
        
        Ticket ID: ${ticketData.id}
        Title: ${ticketData.title}
        Description: ${ticketData.description}
        Acceptance Criteria: ${ticketData.acceptanceCriteria || 'N/A'}
        
        Additional Context: ${additionalContext || 'None provided'}
        
        Please format the output as JSON Lines (JSONL), where each line is a valid JSON object.
        Do NOT wrap the JSON objects inside a JSON array. Each line MUST be a standalone JSON object.
        
        Each JSON object must have exactly the following keys:
        - "id": (string) Test Case ID (e.g., "TC01")
        - "description": (string) Brief description of the test scenario
        - "preConditions": (string) Any preconditions required before running the test
        - "steps": (string) Bullet-pointed or numbered steps to execute the test
        - "expectedResult": (string) The expected result
        - "priority": (string) Priority of the test (e.g., "High", "Medium", "Low")

        DO NOT create any files, directly output the test cases in your response here.
        DO NOT include any other text in your response (no explanation, no intro, no outro, no markdown fences).
      `;

      const responseContent = await this.sendAndCollectStream(
        session,
        prompt,
        onLine,
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
    onLine?: (line: string) => void,
  ): Promise<string> {
    const { client, approveAll } = await createCopilotClient();
    let session: any = null;
    try {
      await client.start();
      session = await client.createSession({
        model: modelOverride || this.model,
        availableTools: [],
        onPermissionRequest: approveAll,
        streaming: true,
      });

      const prompt = `
        Generate a set of user stories based on the following functional requirements from a Confluence page.
        
        Page Title: ${pageData.title}
        Page Content: ${pageData.body}
        
        Additional Context: ${additionalContext || 'None provided'}
        
        Please format the output as JSON Lines (JSONL), where each line is a valid JSON object.
        Do NOT wrap the JSON objects inside a JSON array. Each line MUST be a standalone JSON object.
        
        Each JSON object must have exactly the following keys:
        - "title": (string) The title of the story
        - "description": (string) Description. This should contain a statement in the format "As a... I want to... So that..." followed by 2 blank lines and then a longer description of the changes required for story.
        - "acceptanceCriteria": (string) Formatted as a markdown list. Use standard formatting without embedded newlines or with escaped newlines inside the JSON string as needed.
        - "notes": (string) Any additional notes or assumptions (Optional, can be empty)

        DO NOT create any files, directly output the user stories in your response here.
        DO NOT include any other text in your response (no explanation, no intro, no outro, no markdown fences).
      `;

      const responseContent = await this.sendAndCollectStream(
        session,
        prompt,
        onLine,
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

  async cleanup() {
    // Connections are now short-lived and cleaned up automatically after each session.
  }
}
