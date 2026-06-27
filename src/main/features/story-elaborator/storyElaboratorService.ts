/* eslint-disable @typescript-eslint/no-explicit-any */
import { TicketData, AppSettings } from '../../../types';
import { CopilotService } from '../../infrastructure/copilot/copilotService';
import { DocumentationProvider } from '../../infrastructure/providers/DocumentationProvider';
import { buildStoryElaboratorPrompt } from './storyElaboratorPrompts';

export class StoryElaboratorService {
  private activeElaborations = new Map<
    string,
    { client: any; session: any; providedDocIds: Set<string> }
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
      const { client, session } =
        await this.copilotService.createClientAndSession(
          settings.copilotToken,
          modelOverride,
          repoPath ? { workingDirectory: repoPath } : { availableTools: [] },
        );

      const providedDocIds = new Set<string>();
      // Store in map so we can continue or stop later
      this.activeElaborations.set(ticketData.id || '', {
        client,
        session,
        providedDocIds,
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
    const { session, providedDocIds } = data;

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

    let response = await this.copilotService.sendAndCollectStream(
      session,
      inputContent,
      onLine,
      onToolCallback,
    );

    let requestedDocId = this.extractDocRequest(response);
    while (requestedDocId) {
      const docProvider = await this.getDocProvider();
      if (!docProvider) {
        const errorMsg =
          'Documentation provider not configured. Cannot retrieve document.';
        if (onLine) {
          onLine(JSON.stringify({ type: 'status', text: errorMsg }));
        }
        response = await this.copilotService.sendAndCollectStream(
          session,
          `Error: ${errorMsg}`,
          onLine,
          onToolCallback,
        );
      } else if (providedDocIds.has(requestedDocId)) {
        const warningMsg = `Document with ID ${requestedDocId} has already been provided to you. Do not request it again. Use the information already in your context.`;
        if (onLine) {
          onLine(
            JSON.stringify({
              type: 'status',
              text: `Agent requested duplicate document ID: ${requestedDocId} (declined)`,
            }),
          );
        }
        response = await this.copilotService.sendAndCollectStream(
          session,
          `Error: ${warningMsg}`,
          onLine,
          onToolCallback,
        );
      } else {
        try {
          const page = await docProvider.fetchPage(requestedDocId);
          providedDocIds.add(requestedDocId);

          if (onLine) {
            onLine(
              JSON.stringify({
                type: 'status',
                text: `Agent viewed document: ${page.title}`,
              }),
            );
          }

          const docPrompt = `
Here is the requested document content:
Title: ${page.title}
ID: ${page.id}
Content:
${page.body}
`;
          response = await this.copilotService.sendAndCollectStream(
            session,
            docPrompt,
            onLine,
            onToolCallback,
          );
        } catch (e: any) {
          const errorMsg = `Failed to fetch document: ${e.message || e}`;
          if (onLine) {
            onLine(JSON.stringify({ type: 'status', text: errorMsg }));
          }
          response = await this.copilotService.sendAndCollectStream(
            session,
            `Error: ${errorMsg}`,
            onLine,
            onToolCallback,
          );
        }
      }

      requestedDocId = this.extractDocRequest(response);
    }

    return response;
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

  private extractDocRequest(text: string): string | null {
    const lines = text.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const obj = JSON.parse(trimmed);
        if (obj && obj.type === 'request_doc') {
          return obj.documentId || obj.id || null;
        }
      } catch {
        // Ignore
      }
    }

    const regex =
      /"type"\s*:\s*"request_doc"\s*,\s*"(documentId|id)"\s*:\s*"([^"]+)"/i;
    const match = regex.exec(text);
    if (match) {
      return match[2];
    }
    const regexAlt =
      /"(documentId|id)"\s*:\s*"([^"]+)"\s*,\s*"type"\s*:\s*"request_doc"/i;
    const matchAlt = regexAlt.exec(text);
    if (matchAlt) {
      return matchAlt[2];
    }
    return null;
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
