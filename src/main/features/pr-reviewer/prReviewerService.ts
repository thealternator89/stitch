import fs from 'fs';
import path from 'path';
import * as azdev from 'azure-devops-node-api';
import { IGitApi } from 'azure-devops-node-api/GitApi';
import { GitPullRequestSearchCriteria } from 'azure-devops-node-api/interfaces/GitInterfaces';
import { GitService } from '../../infrastructure/git/gitService';
import { CopilotService } from '../../infrastructure/copilot/copilotService';
import { PRMetadata, AppSettings } from '../../../types';

export function buildPRReviewPrompt(
  files: { path: string; status: string }[],
  customInstructions = '',
): string {
  const filesListStr = files
    .map((file) => `- ${file.path} (${file.status})`)
    .join('\n');

  return `You are an expert software engineer and code reviewer.
Your task is to review the changes in the repository. The following files have been modified/added/deleted in this Pull Request:
${filesListStr}

Please inspect these files using your codebase tools (such as reading file contents or looking at specific ranges of files) to understand the changes made.
Then, perform a thorough review, checking for:
- Logic errors, bugs, or edge cases
- Code quality, readability, and adherence to best practices
- Security vulnerabilities or performance issues
- Proper error handling and logging

${customInstructions ? `Additional specific instructions for this review:\n${customInstructions}\n` : ''}

Your response must strictly consist of JSON Lines (JSONL).
Every line of your response MUST be a single, standalone, valid JSON object.
Do NOT wrap the JSON objects in an array.
Do NOT output markdown code blocks (such as \`\`\`json) wrapping your JSONL output.
All double quotes and newlines inside the JSON strings must be properly escaped (e.g. \\" for quotes, \\n for newlines).

Each JSON object on each line must conform to one of the following formats:

1. For a general comment about the entire PR or a file as a whole:
{
  "type": "general",
  "comment": "Your review comment in Markdown format"
}

2. For a line-specific comment anchored to a particular line:
{
  "type": "line",
  "file": "path/to/file",
  "line": 42,
  "context": 5,
  "comment": "Your line-specific review comment in Markdown format"
}

Ensure the "line" number corresponds to the line in the modified version of the file (after applying the diff). The "context" field must be an integer indicating how many surrounding lines of code to display before and after this line (e.g. 0 to display only line 42, or 5 to display 5 lines before, line 42, and 5 lines after).

Begin your review now.`;
}

export function extractFileContextSync(
  repoPath: string,
  filePath: string,
  targetLine: number,
  contextSize: number,
): { line: number; text: string; isTarget: boolean }[] | null {
  try {
    const fullPath = path.join(repoPath, filePath);
    // Security check: ensure path is within repoPath
    const relative = path.relative(repoPath, fullPath);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      return null;
    }

    if (!fs.existsSync(fullPath)) {
      return null;
    }

    const content = fs.readFileSync(fullPath, 'utf8');
    const allLines = content.split(/\r?\n/);

    const startLine = Math.max(1, targetLine - contextSize);
    const endLine = Math.min(allLines.length, targetLine + contextSize);

    const lines: { line: number; text: string; isTarget: boolean }[] = [];
    for (let i = startLine; i <= endLine; i++) {
      lines.push({
        line: i,
        text: allLines[i - 1] ?? '',
        isTarget: i === targetLine,
      });
    }
    return lines;
  } catch (error) {
    console.error(`Failed to extract context for ${filePath}:`, error);
    return null;
  }
}

export class PRReviewerService {
  constructor(
    private gitService: GitService,
    private copilotService: CopilotService,
  ) {}

  parsePRUrl(url: string): {
    org: string;
    project: string;
    repoName: string;
    prNumber: number;
  } | null {
    const trimmed = url.trim();

    // Pattern 1: dev.azure.com
    // https://dev.azure.com/org/project/_git/repo/pullrequest/123
    const devAzureRegex =
      /https:\/\/dev\.azure\.com\/([^/]+)\/([^/]+)\/_git\/([^/]+)\/pullrequest\/(\d+)/i;
    let match = devAzureRegex.exec(trimmed);
    if (match) {
      return {
        org: match[1],
        project: match[2],
        repoName: match[3],
        prNumber: parseInt(match[4]),
      };
    }

    // Pattern 2: visualstudio.com
    // https://org.visualstudio.com/project/_git/repo/pullrequest/123
    const vsRegex =
      /https:\/\/([^/]+)\.visualstudio\.com\/([^/]+)\/_git\/([^/]+)\/pullrequest\/(\d+)/i;
    match = vsRegex.exec(trimmed);
    if (match) {
      return {
        org: match[1],
        project: match[2],
        repoName: match[3],
        prNumber: parseInt(match[4]),
      };
    }

    return null;
  }

  parseRemoteUrl(url: string): {
    org: string;
    project: string;
    repoName: string;
  } | null {
    const trimmed = url.trim();

    // Pattern 1: HTTPS dev.azure.com
    // https://dev.azure.com/org/project/_git/repo
    // or https://user@dev.azure.com/org/project/_git/repo
    const httpsRegex =
      /https:\/\/(?:[^/]+@)?dev\.azure\.com\/([^/]+)\/([^/]+)\/_git\/([^/.]+)/i;
    let match = httpsRegex.exec(trimmed);
    if (match) {
      return {
        org: match[1],
        project: match[2],
        repoName: match[3],
      };
    }

    // Pattern 2: SSH dev.azure.com
    // git@ssh.dev.azure.com:v3/org/project/repo
    const sshRegex = /git@ssh\.dev\.azure\.com:v3\/([^/]+)\/([^/]+)\/([^/.]+)/i;
    match = sshRegex.exec(trimmed);
    if (match) {
      return {
        org: match[1],
        project: match[2],
        repoName: match[3],
      };
    }

    // Pattern 3: Legacy HTTPS visualstudio.com
    // https://org.visualstudio.com/project/_git/repo
    const vsRegex =
      /https:\/\/([^/]+)\.visualstudio\.com\/([^/]+)\/_git\/([^/.]+)/i;
    match = vsRegex.exec(trimmed);
    if (match) {
      return {
        org: match[1],
        project: match[2],
        repoName: match[3],
      };
    }

    return null;
  }

  private getOrgUrl(org: string): string {
    if (org.startsWith('http://') || org.startsWith('https://')) {
      return org;
    }
    return `https://dev.azure.com/${org}`;
  }

  async getPRDetails(
    repoPath: string,
    prUrlOrId: string,
    settings: AppSettings,
  ): Promise<PRMetadata> {
    let prNumber = parseInt(prUrlOrId);
    let org = settings.azureOrg || '';
    let project = settings.azureProject || '';

    const parsedUrl = this.parsePRUrl(prUrlOrId);
    if (parsedUrl) {
      prNumber = parsedUrl.prNumber;
      org = parsedUrl.org;
      project = parsedUrl.project;
    } else if (isNaN(prNumber)) {
      throw new Error(`Invalid Pull Request URL or ID format: "${prUrlOrId}"`);
    } else {
      // Try to detect org and project from remote URL
      const remoteUrl = await this.gitService.getRemoteUrl(repoPath);
      if (remoteUrl) {
        const parsedRemote = this.parseRemoteUrl(remoteUrl);
        if (parsedRemote) {
          org = org || parsedRemote.org;
          project = project || parsedRemote.project;
        }
      }
    }

    if (!org) {
      throw new Error(
        'Azure DevOps Organization is not configured in settings and could not be detected from git remote.',
      );
    }
    if (!project) {
      throw new Error(
        'Azure DevOps Project is not configured in settings and could not be detected from git remote.',
      );
    }

    const pat = settings.azurePat;
    if (!pat) {
      throw new Error(
        'Azure DevOps PAT token is missing. Please configure it in Settings.',
      );
    }

    const orgUrl = this.getOrgUrl(org);
    const authHandler = azdev.getPersonalAccessTokenHandler(pat);
    const connection = new azdev.WebApi(orgUrl, authHandler);
    const gitApi: IGitApi = await connection.getGitApi();

    try {
      const pr = await gitApi.getPullRequestById(prNumber);
      if (!pr) {
        throw new Error(`Pull Request #${prNumber} not found.`);
      }

      if (!pr.targetRefName) {
        throw new Error(
          `Pull Request #${prNumber} is missing target branch ref.`,
        );
      }

      const cleanRef = (ref: string) => ref.replace(/^refs\/heads\//, '');

      return {
        id: pr.pullRequestId?.toString() || prNumber.toString(),
        title: pr.title || '',
        description: pr.description || '',
        sourceBranch: cleanRef(pr.sourceRefName || ''),
        targetBranch: cleanRef(pr.targetRefName || ''),
        author: pr.createdBy?.displayName || '',
        repositoryName: pr.repository?.name || '',
        hostType: 'azure',
      };
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to fetch PR from Azure DevOps API: ${errMsg}`);
    }
  }

  async getProjectPRs(
    searchType: 'assigned' | 'created' | 'all',
    settings: AppSettings,
  ): Promise<PRMetadata[]> {
    const org = settings.azureOrg || '';
    const project = settings.azureProject || '';
    const pat = settings.azurePat;

    if (!org) {
      throw new Error(
        'Azure DevOps Organization is not configured in settings.',
      );
    }
    if (!project) {
      throw new Error('Azure DevOps Project is not configured in settings.');
    }
    if (!pat) {
      throw new Error(
        'Azure DevOps PAT token is missing. Please configure it in Settings.',
      );
    }

    const orgUrl = this.getOrgUrl(org);
    const authHandler = azdev.getPersonalAccessTokenHandler(pat);
    const connection = new azdev.WebApi(orgUrl, authHandler);
    const gitApi: IGitApi = await connection.getGitApi();

    try {
      let reviewerId: string | undefined;
      let creatorId: string | undefined;

      if (searchType === 'assigned' || searchType === 'created') {
        const connectionData = await connection.connect();
        const currentUserId = connectionData.authorizedUser?.id;
        if (!currentUserId) {
          throw new Error(
            'Could not resolve current authenticated user identity ID.',
          );
        }
        if (searchType === 'assigned') {
          reviewerId = currentUserId;
        } else {
          creatorId = currentUserId;
        }
      }

      const searchCriteria: GitPullRequestSearchCriteria = {
        status: 1, // Active
      };
      if (reviewerId) searchCriteria.reviewerId = reviewerId;
      if (creatorId) searchCriteria.creatorId = creatorId;

      const prs = await gitApi.getPullRequestsByProject(
        project,
        searchCriteria,
      );
      const cleanRef = (ref: string) => ref.replace(/^refs\/heads\//, '');

      return prs.map((pr) => ({
        id: pr.pullRequestId?.toString() || '',
        title: pr.title || '',
        description: pr.description || '',
        sourceBranch: cleanRef(pr.sourceRefName || ''),
        targetBranch: cleanRef(pr.targetRefName || ''),
        author: pr.createdBy?.displayName || '',
        repositoryName: pr.repository?.name || '',
        hostType: 'azure',
      }));
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to query PRs from Azure DevOps: ${errMsg}`);
    }
  }

  async checkoutAndDiff(
    repoPath: string,
    prNumber: number,
    expectedRepoName?: string,
  ): Promise<{ commitSha: string }> {
    const isRepo = await this.gitService.checkGitRepo(repoPath);
    if (!isRepo) {
      throw new Error('The selected path is not a valid Git repository.');
    }

    if (expectedRepoName) {
      const remoteUrl = await this.gitService.getRemoteUrl(repoPath);
      if (remoteUrl) {
        const parsedRemote = this.parseRemoteUrl(remoteUrl);
        if (
          parsedRemote &&
          parsedRemote.repoName.toLowerCase() !== expectedRepoName.toLowerCase()
        ) {
          throw new Error(
            `The selected repository "${parsedRemote.repoName}" does not match the Pull Request repository "${expectedRepoName}".`,
          );
        }
      }
    }

    const isDirty = await this.gitService.hasUncommittedChanges(repoPath);
    if (isDirty) {
      throw new Error(
        'The local git repository has uncommitted changes. Please commit, stash, or revert them first.',
      );
    }

    const commitSha = await this.gitService.fetchAndCheckoutPR(
      repoPath,
      prNumber,
    );
    return { commitSha };
  }

  async reviewPR(
    repoPath: string,
    targetBranch: string,
    settings: AppSettings,
    options: {
      modelOverride?: string;
      customInstructions?: string;
      onLine?: (line: string) => void;
    } = {},
  ): Promise<string> {
    const files = await this.gitService.getDiffFiles(repoPath, targetBranch);
    const prompt = buildPRReviewPrompt(files, options.customInstructions);

    const { client, session } =
      await this.copilotService.createClientAndSession(
        settings.copilotToken,
        options.modelOverride,
        { workingDirectory: repoPath },
      );

    const wrappedOnLine = (line: string) => {
      if (!options.onLine) return;
      try {
        const obj = JSON.parse(line);
        if (
          obj &&
          obj.type === 'line' &&
          typeof obj.file === 'string' &&
          typeof obj.line === 'number'
        ) {
          const contextSize = typeof obj.context === 'number' ? obj.context : 0;
          const codeLines = extractFileContextSync(
            repoPath,
            obj.file,
            obj.line,
            contextSize,
          );
          if (codeLines) {
            obj.codeLines = codeLines;
          }
        }
        options.onLine(JSON.stringify(obj));
      } catch {
        options.onLine(line);
      }
    };

    try {
      return await this.copilotService.sendAndCollectStream(
        session,
        prompt,
        options.onLine ? wrappedOnLine : undefined,
      );
    } finally {
      try {
        await session.disconnect();
      } catch (e) {
        console.error('Error destroying session in reviewPR:', e);
      }
      try {
        await client.stop();
      } catch (e) {
        console.error('Error stopping client in reviewPR:', e);
      }
    }
  }
}
