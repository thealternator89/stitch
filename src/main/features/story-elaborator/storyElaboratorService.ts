/* eslint-disable @typescript-eslint/no-explicit-any */
import { TicketData, AppSettings } from '../../../types';
import { CopilotService } from '../../infrastructure/copilot/copilotService';
import { buildStoryElaboratorPrompt } from './storyElaboratorPrompts';

export class StoryElaboratorService {
  private activeElaborations = new Map<string, { client: any; session: any }>();

  constructor(private copilotService: CopilotService) {}

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

    try {
      const { client, session } =
        await this.copilotService.createClientAndSession(
          settings.copilotToken,
          modelOverride,
          repoPath ? { workingDirectory: repoPath } : { availableTools: [] },
        );

      // Store in map so we can continue or stop later
      this.activeElaborations.set(ticketData.id || '', { client, session });

      const prompt = buildStoryElaboratorPrompt(
        ticketData,
        additionalContext,
        settings,
        !!repoPath,
      );

      return await this.copilotService.sendAndCollectStream(
        session,
        prompt,
        onLine,
        (type, tool, success, error, args) => {
          if (onLine) {
            onLine(
              JSON.stringify({
                type: 'tool',
                status: type,
                name: tool,
                success,
                error,
                arguments: args,
              }),
            );
          }
        },
      );
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
      return await this.copilotService.sendAndCollectStream(
        session,
        answer,
        onLine,
        (type, tool, success, error, args) => {
          if (onLine) {
            onLine(
              JSON.stringify({
                type: 'tool',
                status: type,
                name: tool,
                success,
                error,
                arguments: args,
              }),
            );
          }
        },
      );
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
