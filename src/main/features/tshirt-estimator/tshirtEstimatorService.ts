/* eslint-disable @typescript-eslint/no-explicit-any */
import { AppSettings, CopilotUsage } from '../../../types';
import { CopilotService } from '../../infrastructure/copilot/copilotService';
import { GitService } from '../../infrastructure/git/gitService';
import { buildTShirtEstimatorPrompt } from './tshirtEstimatorPrompts';
import { createReportIntentTool } from '../../infrastructure/copilot/tools/reportIntentTool';
import fs from 'fs';
import path from 'path';

export class TShirtEstimatorService {
  private activeEstimations = new Map<
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
  ) {}

  async startTShirtEstimation(
    description: string,
    repoPath: string | null,
    modelOverride: string,
    settings: AppSettings,
    branch?: string,
    onLine?: (line: string) => void,
  ): Promise<string> {
    if (!repoPath || !repoPath.trim()) {
      throw new Error('Local repository path is required for estimation.');
    }

    // Generate a unique ID for this estimation session
    const sessionId = `tshirt_${Date.now()}`;

    let effectiveRepoPath = repoPath;
    let worktreeInfo: { repoRoot: string; worktreePath: string } | undefined;

    try {
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
            const worktreeName = `${sanitizeDirName(repoDirName)}_tshirt_${sessionId}`;
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

      const { client, session } =
        await this.copilotService.createClientAndSession(
          settings.copilotToken,
          modelOverride,
          {
            workingDirectory: effectiveRepoPath,
            tools: [createReportIntentTool()],
          },
        );
      session.label = 'T-Shirt Size Estimator';

      // Store in map
      this.activeEstimations.set(sessionId, {
        client,
        session,
        onLine,
        worktreeInfo,
      });

      const prompt = buildTShirtEstimatorPrompt(description);

      const result = await this.copilotService.sendAndCollectStream(
        session,
        prompt,
        onLine,
        (type, tool, success, error, args) => {
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
        },
      );

      return JSON.stringify({ sessionId, result });
    } catch (error) {
      console.error('Error starting T-Shirt estimation:', error);
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
      throw error;
    }
  }

  async stopTShirtEstimation(sessionId: string): Promise<CopilotUsage | null> {
    const data = this.activeEstimations.get(sessionId);
    if (!data) return null;

    this.activeEstimations.delete(sessionId);
    const { client, session, worktreeInfo } = data;
    const usage = session.usage || null;
    try {
      await session.disconnect();
    } catch (e) {
      console.error('Error destroying session in stopTShirtEstimation:', e);
    }
    try {
      await client.stop();
    } catch (e) {
      console.error('Error stopping client in stopTShirtEstimation:', e);
    }
    if (worktreeInfo) {
      try {
        await this.gitService.removeWorktree(
          worktreeInfo.repoRoot,
          worktreeInfo.worktreePath,
        );
      } catch (e) {
        console.error('Error removing worktree in stopTShirtEstimation:', e);
      }
    }
    return usage;
  }

  async cleanup() {
    for (const [sessionId, data] of this.activeEstimations.entries()) {
      try {
        await data.session.disconnect();
        await data.client.stop();
      } catch (e) {
        console.error(
          `Error cleaning up active estimation session ${sessionId}:`,
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
            `Error removing worktree during cleanup for session ${sessionId}:`,
            e,
          );
        }
      }
    }
    this.activeEstimations.clear();
  }
}
