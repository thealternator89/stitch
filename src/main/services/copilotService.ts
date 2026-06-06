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
                console.log(`DELTA: ${line}`);
                onLine(line);
              }
            }
          }
        }
      } else if (event.type === 'assistant.message') {
        lastAssistantMessage = event;
      } else if (event.type === 'session.idle') {
        if (onLine && buffer.trim()) {
          console.log(`IDLE: ${buffer}`);
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
              console.log(`FALLBACK LINE: ${line}`);
              onLine(line);
            }
          }
        }

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

      const metaPrompt = `
You are an expert AI prompt engineer and validator.
Review the following prompt template which is intended to guide an AI to generate JSON Lines (JSONL) output.
Is there anything in the instructions or fields that is likely to confuse you (or any other LLM) or cause you to violate the requirement to produce valid JSONL?
Specifically check if any of the custom descriptions might encourage code blocks, markdown fences, unescaped double quotes, or raw newlines inside JSON properties.

Avoid being unnecessarily pessimistic. If the prompt is sufficiently clear DO NOT invent potential issues.

Explain any issues detected clearly and suggest action-oriented improvements, or respond with a confirmation that the prompt template looks perfectly safe and compliant. Keep your response brief, clear, and formatted nicely as markdown.

PROMPT TEMPLATE TO REVIEW:
"""
${promptToCheck.trim()}
"""
      `;

      const responseContent = await this.sendAndCollectStream(
        session,
        metaPrompt,
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

export function buildStoryPrompt(
  pageTitle: string,
  pageContent: string,
  additionalContext: string,
  settings: AppSettings,
): string {
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

  return `
        Generate a set of user stories based on the following functional requirements from a Confluence page.
        ${generalPrompt ? `\n        ${generalPrompt}\n` : ''}
        Page Title: ${pageTitle}
        Page Content: ${pageContent}
        
        Additional Context: ${additionalContext || 'None provided'}
        
        Please format the output as JSON Lines (JSONL), where each line is a valid JSON object.
        Do NOT wrap the JSON objects inside a JSON array. Each line MUST be a standalone JSON object.

        Do NOT use markdown code blocks, fences, or any formatting other than plain JSON objects. All newlines within string values must be represented as \`\\n\` (double backslash-n), not as actual newlines.
        
        Each JSON object must have exactly the following keys:
        - "title": (string) ${titlePrompt}
        - "description": (string) ${descriptionPrompt}
        - "acceptanceCriteria": (string) ${acceptanceCriteriaPrompt}
        - "notes": (string) ${notesPrompt}

        For any fields containing markdown, these MUST be formatted and escaped for JSON.

        For example:
        {"title": "Title text", "description": "First line\\\\n\\\\nSecond line", "acceptanceCriteria": "* AC 1\\\\n* AC 2\\\\n* AC 3", "notes": "First line\\\\nSecond Line\\\\nThird Line"}
        
        All double quotes inside string values must be escaped as \\".
        Do not use markdown formatting or syntax; only plain text is allowed.
        Do not use actual newlines inside string values; use \\n instead.
        Bullet points or numbers should be plain text only (e.g., "1. Step one\\n2. Step two").

        DO NOT create any files, directly output the user stories in your response here.
        DO NOT include any other text in your response (no explanation, no intro, no outro, no markdown fences).
  `;
}

export function buildTestCasePrompt(
  ticketId: string,
  ticketTitle: string,
  ticketDescription: string,
  ticketAcceptanceCriteria: string,
  additionalContext: string,
  settings: AppSettings,
): string {
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

  return `
        Generate a set of comprehensive test cases for the following user story/ticket.
        ${generalPrompt ? `\n        ${generalPrompt}\n` : ''}
        Ticket ID: ${ticketId}
        Title: ${ticketTitle}
        Description: ${ticketDescription}
        Acceptance Criteria: ${ticketAcceptanceCriteria || 'N/A'}
        
        Additional Context: ${additionalContext || 'None provided'}
        
        Please format the output as JSON Lines (JSONL), where each line is a valid JSON object.
        Do NOT wrap the JSON objects inside a JSON array. Each line MUST be a standalone JSON object.

        Do NOT use markdown code blocks, fences, or any formatting other than plain JSON objects. All newlines within string values must be represented as \`\\n\` (double backslash-n), not as actual newlines.
        
        Each JSON object must have exactly the following keys:
        - "id": (string) ${idPrompt}
        - "description": (string) ${descriptionPrompt}
        - "preConditions": (string) ${preConditionsPrompt}
        - "steps": (string) ${stepsPrompt}
        - "expectedResult": (string) ${expectedResultPrompt}
        - "priority": (string) Priority of the test (e.g., "High", "Medium", "Low")

        For example:
        {"id": "", "description": "It works", "preConditions": "* One\\\\n* Two\\\\n* Three", "steps": "1. Step 1\\\\n2. Step 2\\\\n3. Step 3", "expectedResult": "Nothing", "priority": "High"}

        All double quotes inside string values must be escaped as \\".
        Do not use markdown formatting or syntax; only plain text is allowed.
        Do not use actual newlines inside string values; use \\n instead.
        Bullet points or numbers should be plain text only (e.g., "1. Step one\\\\n2. Step two").

        DO NOT create any files, directly output the test cases in your response here.
        DO NOT include any other text in your response (no explanation, no intro, no outro, no markdown fences).
  `;
}

export function buildStoryElaboratorPrompt(
  ticketData: TicketData,
  additionalContext: string,
  settings: AppSettings,
  hasRepo: boolean,
): string {
  const customGeneral = settings.prompts?.storyElaborator?.general || '';

  let repoInstructions = '';
  if (hasRepo) {
    repoInstructions = `
You have access to the local codebase of the project through your built-in tools (such as reading files and browsing directories).
Use these tools to search, analyze, and inspect the codebase files to understand the project structure and existing implementations before formulating questions or plans.
Once you have collected enough information and the user has answered all questions, you MUST write the final plan to a markdown file in the repository (e.g., \`implementation_plan.md\` or another appropriate path/file in the directory) using your file-writing tools.
Once written, return a "plan" message containing both the markdown text and the saved file path.
`;
  } else {
    repoInstructions = `
You DO NOT have access to a local codebase or repository.
Base all your questions, architectural assumptions, and the final plan entirely on the details provided in the ticket and user inputs.
Do NOT attempt to run any filesystem or command tools, as no repository context is available.
Once you have enough information, generate the final plan in markdown format and output it in a "plan" message. Do not specify a filePath.
`;
  }

  return `
You are a Story Elaborator. Your task is to elaborate the following user story / ticket into a detailed implementation plan.
${customGeneral ? `\n${customGeneral}\n` : ''}
Ticket ID: ${ticketData.id || 'N/A'}
Title: ${ticketData.title}
Description: ${ticketData.description}
Acceptance Criteria: ${ticketData.acceptanceCriteria || 'N/A'}

Additional Context: ${additionalContext || 'None provided'}

${repoInstructions}

Your communication protocol with the host application is strictly JSON Lines (JSONL).
Every output line MUST be a single, standalone, valid JSON object. Do NOT wrap the JSON objects in an array. Do NOT output markdown fences (like \`\`\`json) wrapping your JSONL output.
All double quotes inside string values must be escaped as \\". All actual newlines inside string values must be escaped as \\n.

You must choose one of the following JSON formats for each line you output:
1. Status Updates (for describing your internal thoughts, what files you are reading, or progress):
   \`{"type": "status", "text": "Analyzing codebase / reading package.json..."}\`
   *IMPORTANT*: You must never output only status updates in a turn and then stop. If you output a status update, you must either call a tool in the same turn to continue your work (e.g. read a file, list files, search), or you must end your output with a question to the user (type: 'question') or the final plan (type: 'plan'). Ending a turn with only a status update and no tool call/question/plan is forbidden, as it will leave the session stuck.

2. Questions (if you need clarification on requirements, architectural choices, styling preferences, or codebase details from the user). Ask exactly ONE question at a time and then STOP. Do not output anything else in that turn. You can optionally provide a list of suggested answers if you are able to guess or suggest sensible options:
   \`{"type": "question", "text": "Should we use React state or Redux to store this new field?", "suggestedAnswers": ["React State", "Redux", "Context API"]}\`

3. The Final Plan (when all questions are answered and the plan is ready. In this case, output a single JSON object. If a repository is available, make sure to write the plan to a file in the workspace first using your tools, and provide the absolute or relative file path in the 'filePath' attribute):
   \`{"type": "plan", "text": "# Detailed Implementation Plan\\n\\n### Proposed Changes...", "filePath": "implementation_plan.md"}\` (omit 'filePath' if no repository is available)

Follow this process:
1. Analyze the ticket and, if a repository is available, inspect the files using your tools to understand the codebase.
2. If you are still analyzing or reading files, call your filesystem/grep tools to continue. Each turn where you do not call a tool must ask the user a clarifying question or present the final plan. Do not stop without either calling a tool or asking a question/plan.
3. Ask clarifying questions one by one, stopping after each question to wait for the user's response.
4. Once all details are resolved, draft the detailed implementation plan.
5. If a repository is available, write the plan to a file in the workspace using your file tools.
6. Finally, return the "plan" message in JSONL format.

Start by analyzing the ticket details and/or repository, and ask your first question or output a status update followed by a tool call or question.
`;
}
