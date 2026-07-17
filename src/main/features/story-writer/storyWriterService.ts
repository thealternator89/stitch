import { DocPageData, AppSettings } from '../../../types';
import { CopilotService } from '../../infrastructure/copilot/copilotService';
import { buildStoryPrompt } from './storyWriterPrompts';

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
    session.label = 'Story Writer';

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
}
