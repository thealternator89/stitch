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

      const testCaseWriter = settings.prompts?.testCaseWriter || {};
      const generalPrompt = testCaseWriter.general || '';

      const idPrompt = testCaseWriter.id || 'Test Case ID (e.g., "TC01")';
      const descriptionPrompt =
        testCaseWriter.description || 'Brief description of the test scenario';
      const preConditionsPrompt =
        testCaseWriter.preConditions ||
        'Any preconditions required before running the test';
      const stepsPrompt =
        testCaseWriter.steps ||
        'Bullet-pointed or numbered steps to execute the test';
      const expectedResultPrompt =
        testCaseWriter.expectedResult || 'The expected result';

      const prompt = `
        Generate a set of comprehensive test cases for the following user story/ticket.
        ${generalPrompt ? `\n        ${generalPrompt}\n` : ''}
        Ticket ID: ${ticketData.id}
        Title: ${ticketData.title}
        Description: ${ticketData.description}
        Acceptance Criteria: ${ticketData.acceptanceCriteria || 'N/A'}
        
        Additional Context: ${additionalContext || 'None provided'}
        
        Please format the output as JSON Lines (JSONL), where each line is a valid JSON object.
        Do NOT wrap the JSON objects inside a JSON array. Each line MUST be a standalone JSON object.
        
        Each JSON object must have exactly the following keys:
        - "id": (string) ${idPrompt}
        - "description": (string) ${descriptionPrompt}
        - "preConditions": (string) ${preConditionsPrompt}
        - "steps": (string) ${stepsPrompt}
        - "expectedResult": (string) ${expectedResultPrompt}
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

      const storyWriter = settings.prompts?.storyWriter || {};
      const generalPrompt = storyWriter.general || '';

      const titlePrompt = storyWriter.title || 'The title of the story';
      const descriptionPrompt =
        storyWriter.description ||
        'Description. This should contain a statement in the format "As a... I want to... So that..." followed by 2 blank lines and then a longer description of the changes required for story.';
      const acceptanceCriteriaPrompt =
        storyWriter.acceptanceCriteria || 'Formatted as a markdown list.';
      const notesPrompt =
        storyWriter.notes ||
        'Any additional notes or assumptions (Optional, can be empty)';

      const prompt = `
        Generate a set of user stories based on the following functional requirements from a Confluence page.
        ${generalPrompt ? `\n        ${generalPrompt}\n` : ''}
        Page Title: ${pageData.title}
        Page Content: ${pageData.body}
        
        Additional Context: ${additionalContext || 'None provided'}
        
        Please format the output as JSON Lines (JSONL), where each line is a valid JSON object.
        Do NOT wrap the JSON objects inside a JSON array. Each line MUST be a standalone JSON object.
        
        Each JSON object must have exactly the following keys:
        - "title": (string) ${titlePrompt}
        - "description": (string) ${descriptionPrompt}
        - "acceptanceCriteria": (string) ${acceptanceCriteriaPrompt}
        - "notes": (string) ${notesPrompt}

        For any fields containing markdown, use standard formatting without embedded newlines or with escaped newlines inside the JSON string as needed.
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
