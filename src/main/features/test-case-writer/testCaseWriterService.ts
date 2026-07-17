import { TicketData, AppSettings, CopilotResult } from '../../../types';
import { CopilotService } from '../../infrastructure/copilot/copilotService';
import { buildTestCasePrompt } from './testCaseWriterPrompts';

export class TestCaseWriterService {
  constructor(private copilotService: CopilotService) {}

  async generateTestCases(
    ticketData: TicketData,
    additionalContext: string,
    modelOverride: string,
    settings: AppSettings,
    onLine?: (line: string) => void,
  ): Promise<CopilotResult<string>> {
    const { client, session } =
      await this.copilotService.createClientAndSession(
        settings.copilotToken,
        modelOverride,
        { availableTools: [] },
      );
    session.label = 'Test Case Writer';

    try {
      const prompt = buildTestCasePrompt(
        ticketData.id || '',
        ticketData.title,
        ticketData.description,
        ticketData.acceptanceCriteria || '',
        additionalContext,
        settings,
      );

      const res = await this.copilotService.sendAndCollectStream(
        session,
        prompt,
        onLine,
      );
      return { result: res, usage: session.usage };
    } catch (error) {
      console.error('Error generating test cases:', error);
      throw error;
    } finally {
      try {
        await session.disconnect();
      } catch (e) {
        console.error('Error destroying session in generateTestCases:', e);
      }
      try {
        await client.stop();
      } catch (e) {
        console.error('Error stopping client in generateTestCases:', e);
      }
    }
  }
}
