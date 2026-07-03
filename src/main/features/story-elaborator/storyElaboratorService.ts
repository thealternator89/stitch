/* eslint-disable @typescript-eslint/no-explicit-any */
import { TicketData, AppSettings } from '../../../types';
import { CopilotService } from '../../infrastructure/copilot/copilotService';
import { DocumentationProvider } from '../../infrastructure/providers/DocumentationProvider';
import { buildStoryElaboratorPrompt } from './storyElaboratorPrompts';
import { createRequestDocumentationTool } from '../../infrastructure/copilot/tools/documentationTool';

export class StoryElaboratorService {
  private activeElaborations = new Map<
    string,
    {
      client: any;
      session: any;
      providedDocIds: Set<string>;
      onLine?: (line: string) => void;
    }
  >();

  constructor(
    private copilotService: CopilotService,
    private getDocProvider: () => Promise<DocumentationProvider | null>,
  ) {}

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
      const providedDocIds = new Set<string>();

      const requestDocumentationTool = createRequestDocumentationTool(
        this.getDocProvider,
        providedDocIds,
        () => this.activeElaborations.get(ticketData.id || '')?.onLine,
      );

      const { client, session } =
        await this.copilotService.createClientAndSession(
          settings.copilotToken,
          modelOverride,
          repoPath
            ? {
                workingDirectory: repoPath,
                tools: [requestDocumentationTool],
              }
            : {
                availableTools: ['custom:request_documentation'],
                tools: [requestDocumentationTool],
              },
        );

      // Store in map so we can continue or stop later
      this.activeElaborations.set(ticketData.id || '', {
        client,
        session,
        providedDocIds,
        onLine,
      });

      // Find links and fetch titles for knownDocs
      const knownDocs: { id: string; title: string }[] = [];
      const docProvider = await this.getDocProvider();
      if (docProvider) {
        const urls = [
          ...this.extractUrls(ticketData.description || ''),
          ...this.extractUrls(ticketData.acceptanceCriteria || ''),
        ];
        const pageIds = Array.from(
          new Set(
            urls
              .filter((url) => docProvider.isDocPageUrl(url))
              .map((url) => docProvider.extractPageId(url))
              .filter((id): id is string => id !== null),
          ),
        );

        for (const pageId of pageIds) {
          try {
            const page = await docProvider.fetchPage(pageId);
            knownDocs.push({ id: page.id, title: page.title });
          } catch (e) {
            console.error(
              `Failed to fetch metadata for Confluence page ${pageId}:`,
              e,
            );
            knownDocs.push({ id: pageId, title: `Document ID: ${pageId}` });
          }
        }
      }

      const prompt = buildStoryElaboratorPrompt(
        ticketData,
        additionalContext,
        settings,
        !!repoPath,
        knownDocs,
      );

      console.log(prompt);

      return await this.runElaborationTurn(ticketData.id || '', prompt, onLine);
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
    if (data) {
      data.onLine = onLine;
    }
    return await this.runElaborationTurn(ticketId, answer, onLine);
  }

  private async runElaborationTurn(
    ticketId: string,
    inputContent: string,
    onLine?: (line: string) => void,
  ): Promise<string> {
    const data = this.activeElaborations.get(ticketId);
    if (!data) {
      throw new Error(
        `No active story elaboration session found for ticket ID: ${ticketId}`,
      );
    }
    const { session } = data;

    const onToolCallback = (
      type: 'start' | 'end',
      tool: string,
      success?: boolean,
      error?: string,
      args?: any,
    ) => {
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
    };

    return await this.copilotService.sendAndCollectStream(
      session,
      inputContent,
      onLine,
      onToolCallback,
    );
  }

  private extractUrls(text: string): string[] {
    const urls: string[] = [];
    const hrefRegex = /href=["'](https?:\/\/[^"']+)["']/gi;
    let match;
    while ((match = hrefRegex.exec(text)) !== null) {
      urls.push(match[1]);
    }
    const rawRegex = /(https?:\/\/[^\s"<>]+)/gi;
    while ((match = rawRegex.exec(text)) !== null) {
      const url = match[1].replace(/[.,;:!?)]+$/, '');
      if (!urls.includes(url)) {
        urls.push(url);
      }
    }
    return urls;
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
