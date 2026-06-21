/* eslint-disable @typescript-eslint/no-explicit-any */
import { TicketData, AppSettings } from '../../../types';
import { CopilotService } from '../../infrastructure/copilot/copilotService';
import {
  buildTestCasePrompt,
  buildPromptComplexityCheckPrompt,
} from './testCaseWriterPrompts';

export class TestCaseWriterService {
  constructor(private copilotService: CopilotService) {}

  async generateTestCases(
    ticketData: TicketData,
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
      const prompt = buildTestCasePrompt(
        ticketData.id || '',
        ticketData.title,
        ticketData.description,
        ticketData.acceptanceCriteria || '',
        additionalContext,
        settings,
      );

      return await this.copilotService.sendAndCollectStream(
        session,
        prompt,
        onLine,
      );
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
      const promptToCheck = buildTestCasePrompt(
        '[Ticket ID Placeholder]',
        '[Title Placeholder]',
        '[Description Placeholder]',
        '[Acceptance Criteria Placeholder]',
        '[Additional Context Placeholder]',
        { prompts: { testCaseWriter: prompts } },
      );

      const metaPrompt = buildPromptComplexityCheckPrompt(promptToCheck);

      return await this.copilotService.sendAndCollectStream(
        session,
        metaPrompt,
      );
    } catch (error) {
      console.error('Error checking test case prompt complexity:', error);
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
