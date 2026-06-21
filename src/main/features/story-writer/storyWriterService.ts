/* eslint-disable @typescript-eslint/no-explicit-any */
import { DocPageData, AppSettings } from '../../../types';
import { CopilotService } from '../../infrastructure/copilot/copilotService';
import {
  buildStoryPrompt,
  buildPromptComplexityCheckPrompt,
} from './storyWriterPrompts';

export class StoryWriterService {
  constructor(private copilotService: CopilotService) {}

  async generateStories(
    pageData: DocPageData,
    additionalContext: string,
    modelOverride: string,
    settings: AppSettings,
    onLine?: (line: string) => void,
  ): Promise<string> {
    const { client, session } =
      await this.copilotService.createClientAndSession(
        settings.copilotToken,
        modelOverride,
        { availableTools: [] },
      );

    try {
      const prompt = buildStoryPrompt(
        pageData.title,
        pageData.body,
        additionalContext,
        settings,
      );

      return await this.copilotService.sendAndCollectStream(
        session,
        prompt,
        onLine,
      );
    } catch (error) {
      console.error('Error generating stories:', error);
      throw error;
    } finally {
      try {
        await session.disconnect();
      } catch (e) {
        console.error('Error destroying session in generateStories:', e);
      }
      try {
        await client.stop();
      } catch (e) {
        console.error('Error stopping client in generateStories:', e);
      }
    }
  }

  async checkPromptComplexity(
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
      const promptToCheck = buildStoryPrompt(
        '[Page Title Placeholder]',
        '[Page Content Placeholder]',
        '[Additional Context Placeholder]',
        { prompts: { storyWriter: prompts } },
      );

      const metaPrompt = buildPromptComplexityCheckPrompt(promptToCheck);

      return await this.copilotService.sendAndCollectStream(
        session,
        metaPrompt,
      );
    } catch (error) {
      console.error('Error checking story prompt complexity:', error);
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
