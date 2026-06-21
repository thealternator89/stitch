/* eslint-disable @typescript-eslint/no-explicit-any */
import { AppSettings } from '../../../types';
import { CopilotService } from '../../infrastructure/copilot/copilotService';
import { buildStoryPrompt } from '../story-writer/storyWriterPrompts';
import { buildTestCasePrompt } from '../test-case-writer/testCaseWriterPrompts';
import { buildPromptComplexityCheckPrompt } from './promptComplexityPrompts';

export class PromptComplexityService {
  constructor(private copilotService: CopilotService) {}

  async checkPromptComplexity(
    type: 'story' | 'testcase',
    prompts: any,
    settings: AppSettings,
    modelOverride?: string,
  ): Promise<string> {
    const { client, session } =
      await this.copilotService.createClientAndSession(
        settings.copilotToken,
        modelOverride,
        { availableTools: [], streaming: false },
      );

    try {
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

      return await this.copilotService.sendAndCollectStream(
        session,
        metaPrompt,
      );
    } catch (error) {
      console.error('Error checking prompt complexity:', error);
      throw error;
    } finally {
      try {
        await session.disconnect();
      } catch (e) {
        console.error('Error destroying session in checkPromptComplexity:', e);
      }
      try {
        await client.stop();
      } catch (e) {
        console.error('Error stopping client in checkPromptComplexity:', e);
      }
    }
  }
}
