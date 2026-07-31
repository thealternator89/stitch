/* eslint-disable @typescript-eslint/no-explicit-any */
import { TicketData, AppSettings, CopilotUsage } from '../../../types';
import { CopilotService } from '../../infrastructure/copilot/copilotService';
import { DocumentationProvider } from '../../infrastructure/providers/DocumentationProvider';
import { buildStoryElaboratorPrompt } from './storyElaboratorPrompts';
import { createRequestDocumentationTool } from '../../infrastructure/copilot/tools/documentationTool';
import { createReportIntentTool } from '../../infrastructure/copilot/tools/reportIntentTool';
import { GitService } from '../../infrastructure/git/gitService';
import fs from 'fs';
import path from 'path';

export class StoryElaboratorService {
  private activeElaborations = new Map<
    string,
    {
      client: any;
      session: any;
      onLine?: (line: string) => void;
      worktreeInfo?: {
        repoRoot: string;
        worktreePath: string;
      };
    }
  >();

  constructor(
    private copilotService: CopilotService,
    private gitService: GitService,
    private getDocProvider: () => Promise<DocumentationProvider | null>,
  ) {}

  async startStoryElaboration(
    ticketData: TicketData,
    repoPath: string | null,
    additionalContext: string,
    modelOverride: string,
    settings: AppSettings,
    branch?: string,
    onLine?: (line: string) => void,
  ): Promise<string> {
    // Stop any existing session for this ticket
    await this.stopStoryElaboration(ticketData.id || '');

    let effectiveRepoPath = repoPath;
    let worktreeInfo: { repoRoot: string; worktreePath: string } | undefined;

    try {
      const requestDocumentationTool = createRequestDocumentationTool(
        this.getDocProvider,
        () => this.activeElaborations.get(ticketData.id || '')?.onLine,
      );

      if (
        repoPath &&
        settings.gitWorktreeEnabled &&
        settings.gitWorktreeBaseDir
      ) {
        const isGit = await this.gitService.checkGitRepo(repoPath);
        if (isGit) {
          const repoRoot = await this.gitService.getRepoRoot(repoPath);
          if (repoRoot) {
            const relativeSubdir = path.relative(repoRoot, repoPath);
            const repoDirName = path.basename(repoRoot);
            const sanitizeDirName = (name: string) =>
              name.replace(/[^a-zA-Z0-9-_]/g, '_');
            const worktreeName = `${sanitizeDirName(repoDirName)}_ticket_${ticketData.id || 'unknown'}`;
            const worktreePath = path.join(
              settings.gitWorktreeBaseDir,
              worktreeName,
            );

            if (!fs.existsSync(settings.gitWorktreeBaseDir)) {
              fs.mkdirSync(settings.gitWorktreeBaseDir, { recursive: true });
            }

            const targetBranch = branch || 'develop';
            let checkoutRef = targetBranch;
            try {
              await this.gitService.runCommand(
                repoRoot,
                `git fetch origin ${targetBranch}`,
              );
              const fetchedSha = await this.gitService.runCommand(
                repoRoot,
                'git rev-parse FETCH_HEAD',
              );
              if (fetchedSha) {
                checkoutRef = fetchedSha;
              }
            } catch (err) {
              console.warn(
                `Failed to fetch branch ${targetBranch} from origin, falling back to local branch:`,
                err,
              );
            }

            await this.gitService.addWorktree(
              repoRoot,
              worktreePath,
              checkoutRef,
            );

            worktreeInfo = { repoRoot, worktreePath };
            effectiveRepoPath = path.join(worktreePath, relativeSubdir);

            if (!fs.existsSync(effectiveRepoPath)) {
              throw new Error(
                'The selected directory does not exist in the checked out branch. Your local repository might be outdated. Please pull the branch and try again.',
              );
            }
          }
        }
      }

      const reportIntentTool = createReportIntentTool();

      const { client, session } =
        await this.copilotService.createClientAndSession(
          settings.copilotToken,
          modelOverride,
          effectiveRepoPath
            ? {
                workingDirectory: effectiveRepoPath,
                tools: [requestDocumentationTool, reportIntentTool],
              }
            : {
                availableTools: [
                  'custom:request_documentation',
                  'custom:report_intent',
                ],
                tools: [requestDocumentationTool, reportIntentTool],
              },
        );
      session.label = 'Story Elaborator';

      // Store in map so we can continue or stop later
      this.activeElaborations.set(ticketData.id || '', {
        client,
        session,
        onLine,
        worktreeInfo,
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

      return await this.runElaborationTurn(ticketData.id || '', prompt, onLine);
    } catch (error) {
      console.error('Error starting story elaboration:', error);
      // Clean up if it failed
      if (worktreeInfo) {
        try {
          await this.gitService.removeWorktree(
            worktreeInfo.repoRoot,
            worktreeInfo.worktreePath,
          );
        } catch (e) {
          console.error('Failed to clean up worktree after error:', e);
        }
      }
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
        if (tool === 'report_intent') {
          if (type === 'start' && args?.intent) {
            onLine(
              JSON.stringify({
                type: 'status',
                text: args.intent,
              }),
            );
          }
          return;
        }
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

  async stopStoryElaboration(ticketId: string): Promise<CopilotUsage | null> {
    const data = this.activeElaborations.get(ticketId);
    if (!data) return null;

    this.activeElaborations.delete(ticketId);
    const { client, session, worktreeInfo } = data;
    const usage = session.usage || null;
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
    if (worktreeInfo) {
      try {
        await this.gitService.removeWorktree(
          worktreeInfo.repoRoot,
          worktreeInfo.worktreePath,
        );
      } catch (e) {
        console.error('Error removing worktree in stopStoryElaboration:', e);
      }
    }
    return usage;
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
      if (data.worktreeInfo) {
        try {
          await this.gitService.removeWorktree(
            data.worktreeInfo.repoRoot,
            data.worktreeInfo.worktreePath,
          );
        } catch (e) {
          console.error(
            `Error removing worktree during cleanup for ticket ${ticketId}:`,
            e,
          );
        }
      }
    }
    this.activeElaborations.clear();
  }
}
