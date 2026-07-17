import fs from 'fs';
import path from 'path';
import os from 'os';
import picomatch from 'picomatch';
import matter from 'gray-matter';
import { powerSaveBlocker } from 'electron';
import { GitService } from '../../infrastructure/git/gitService';
import { CopilotService } from '../../infrastructure/copilot/copilotService';
import {
  PRMetadata,
  AppSettings,
  ReviewPhase,
  TicketData,
  CopilotUsage,
  CopilotResult,
} from '../../../types';
import { IssueTrackerProvider } from '../../infrastructure/providers/IssueTrackerProvider';
import { DocumentationProvider } from '../../infrastructure/providers/DocumentationProvider';
import { CodeReviewProvider } from '../../infrastructure/providers/CodeReviewProvider';
import { createRequestDocumentationTool } from '../../infrastructure/copilot/tools/documentationTool';

export function buildPhaseReviewPrompt(
  files: { path: string; status: string }[],
  phaseTitle: string,
  phaseContent: string,
  customInstructions = '',
  prDescription = '',
  storyContent = '',
  knownDocs?: { id: string; title: string }[],
): string {
  const filesListStr = files
    .map((file) => `- ${file.path} (${file.status})`)
    .join('\n');

  let docsInstructions = '';
  if (knownDocs && knownDocs.length > 0) {
    const docsList = knownDocs
      .map((d) => `- "${d.title}" (ID: ${d.id})`)
      .join('\n');
    docsInstructions = `\n\nYou have identified the following documentation links in the linked story. You can request the content of any of these documents using the "request_documentation" tool with the corresponding document ID:\n${docsList}\n`;
  }

  return `You are an expert software engineer and code reviewer.
Your task is to review the changes in the repository for the phase: "${phaseTitle}".

The following files have been modified/added/deleted in this Pull Request and are relevant to this phase:
${filesListStr}
${prDescription ? `\nHere is the Pull Request Description for additional context:\n--- PR DESCRIPTION ---\n${prDescription}\n----------------------\n` : ''}
${storyContent ? `\nHere is the User Story/Work Item for additional context:\n--- LINKED STORY ---\n${storyContent}\n--------------------\n` : ''}${docsInstructions}
Please inspect these files using your codebase tools (such as reading file contents or looking at specific ranges of files) to understand the changes made.
You MUST use the git history (such as git diff or git log) to identify the exact changes made to the files we are reviewing. Only suggest comments on the changed (added or modified) lines. Do not suggest line-specific comments on lines of code that are outside the scope of the change.

Then, perform a thorough review, checking for adherence ONLY to the following phase guidelines:

--- PHASE GUIDELINES ---
${phaseContent}
------------------------

DO NOT comment on any issues you see which are not explicitly related to the phase guidelines. This is critical.
You are conducting exactly one phase of a multi-phase review. Even if you spot a major issue, if it does not fall under the current phase guidelines, IGNORE IT. Assume it will be handled in a separate phase; mentioning it now will only cause disruptive, duplicate comments.

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
Only output a general comment if you have constructive feedback, suggestions, or issues to point out. Do NOT output a general comment stating that the code looks good, that there are no obvious issues, or that everything is fine. If you have no issues or feedback to report, do not output any comments (general or line) at all.

2. For a line-specific comment anchored to a particular line:
{
  "type": "line",
  "file": "path/to/file",
  "line": 42,
  "context": 5,
  "comment": "Your line-specific review comment in Markdown format"
}

3. For reporting status updates (e.g., when you start checking a file, analyze a function, or run check guidelines):
{
  "type": "status",
  "status": "A brief message describing what you are currently doing (e.g., 'Checking authService.ts for potential logic flaws')"
}

Ensure the "line" number corresponds to the line in the modified version of the file (after applying the diff). The "context" field must be an integer indicating how many surrounding lines of code to display before and after this line (e.g. 0 to display only line 42, or 5 to display 5 lines before, line 42, and 5 lines after).
You MUST only suggest line-specific comments (type: 'line') on lines that were actually changed (added or modified) as shown in the git history. Do not comment on unchanged lines.

You are highly encouraged to output status updates (type: 'status') periodically as you proceed to let the user know what you are doing.
If you have no issues or feedback to report for a phase, simply do not output any review comments (general or line-specific) at all for that phase.

Begin your review now.`;
}

export function getGlobMatcher(
  globInput: string | string[],
): (str: string) => boolean {
  const globs = Array.isArray(globInput) ? globInput : [globInput];
  const matchers = globs.map((g) => picomatch(g, { dot: true }));
  return (str: string) => matchers.some((m) => m(str));
}

export function parseFrontmatter(content: string): {
  frontmatter: Record<string, string | string[]>;
  body: string;
} {
  try {
    const parsed = matter(content);
    const lowercaseFrontmatter: Record<string, string | string[]> = {};
    for (const [key, val] of Object.entries(parsed.data)) {
      lowercaseFrontmatter[key.toLowerCase()] = val as string | string[];
    }
    return {
      frontmatter: lowercaseFrontmatter,
      body: parsed.content.trim(),
    };
  } catch (err) {
    console.error('Failed to parse frontmatter with gray-matter:', err);
    return { frontmatter: {}, body: content.trim() };
  }
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
  private activeCheckouts = new Map<string, string>();
  private activeWorktrees = new Map<
    string,
    { worktreePath: string; originalRef: string }
  >();

  constructor(
    private gitService: GitService,
    private copilotService: CopilotService,
    private getIssueTrackerProvider: () => Promise<IssueTrackerProvider | null>,
    private getDocProvider: () => Promise<DocumentationProvider | null>,
    private getCodeReviewProvider: () => Promise<CodeReviewProvider | null>,
  ) {}

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

  async loadPhasesFromDisk(): Promise<ReviewPhase[]> {
    const homeDir = os.homedir();
    const stitchDir = path.join(homeDir, '.stitch', 'pr-reviewer');
    const phasesDir = path.join(stitchDir, 'phases');
    const templatesDir = path.join(stitchDir, 'templates');

    for (const dir of [phasesDir, templatesDir]) {
      if (!fs.existsSync(dir)) {
        try {
          fs.mkdirSync(dir, { recursive: true });
        } catch (err) {
          console.error(`Failed to create directory ${dir}:`, err);
        }
      }
    }

    if (!fs.existsSync(phasesDir)) {
      return [];
    }

    try {
      let groupOrder: string[] = [];
      const configPath = path.join(
        homeDir,
        '.stitch',
        'pr-reviewer',
        'config.json',
      );
      if (fs.existsSync(configPath)) {
        try {
          const configContent = fs.readFileSync(configPath, 'utf8');
          const config = JSON.parse(configContent);
          if (config && Array.isArray(config.groups)) {
            groupOrder = config.groups;
          }
        } catch (err) {
          console.error(
            `Failed to read or parse config.json at ${configPath}:`,
            err,
          );
        }
      }

      const files = fs.readdirSync(phasesDir);
      const mdFiles = files.filter((f) => f.endsWith('.md')).sort();

      const phases: ReviewPhase[] = [];
      for (const file of mdFiles) {
        const fullPath = path.join(phasesDir, file);
        try {
          const content = fs.readFileSync(fullPath, 'utf8');
          const parsed = parseFrontmatter(content);

          let body = parsed.body;
          const templateName = Array.isArray(parsed.frontmatter.template)
            ? parsed.frontmatter.template[0]
            : parsed.frontmatter.template;
          let templateError: string | undefined = undefined;

          if (templateName) {
            const templatesDir = path.join(
              path.dirname(phasesDir),
              'templates',
            );
            const templatePath = path.resolve(templatesDir, templateName);
            const relative = path.relative(templatesDir, templatePath);
            if (relative.startsWith('..') || path.isAbsolute(relative)) {
              templateError = `Directory traversal detected in template path: ${templateName}`;
            } else if (!fs.existsSync(templatePath)) {
              templateError = `Template file not found: ${templatePath}`;
            } else {
              const templateContent = fs.readFileSync(templatePath, 'utf8');
              if (!templateContent.includes('<%content%>')) {
                templateError = `Template "${templateName}" is missing the required <%content%> placeholder.`;
              } else {
                body = templateContent.replace(
                  /<%content%>/g,
                  () => parsed.body,
                );
              }
            }
          }

          const title = Array.isArray(parsed.frontmatter.title)
            ? parsed.frontmatter.title[0]
            : parsed.frontmatter.title;
          const group = Array.isArray(parsed.frontmatter.group)
            ? parsed.frontmatter.group[0]
            : parsed.frontmatter.group;
          const attach = Array.isArray(parsed.frontmatter.attach)
            ? parsed.frontmatter.attach[0]
            : parsed.frontmatter.attach;

          phases.push({
            id: file,
            title: title || file,
            group: group || 'Ungrouped',
            include: parsed.frontmatter.include,
            exclude: parsed.frontmatter.exclude,
            attach: attach,
            body,
            template: templateName,
            templateError,
          });
        } catch (err) {
          console.error(`Failed to read/parse phase file ${file}:`, err);
        }
      }

      phases.sort((a, b) => {
        const groupA = a.group || 'Ungrouped';
        const groupB = b.group || 'Ungrouped';
        if (groupA === 'Ungrouped' && groupB !== 'Ungrouped') {
          return -1;
        }
        if (groupB === 'Ungrouped' && groupA !== 'Ungrouped') {
          return 1;
        }
        if (groupA !== groupB) {
          const idxA = groupOrder.indexOf(groupA);
          const idxB = groupOrder.indexOf(groupB);
          if (idxA !== -1 && idxB !== -1) {
            return idxA - idxB;
          }
          if (idxA !== -1) {
            return -1;
          }
          if (idxB !== -1) {
            return 1;
          }
          const groupCompare = groupA.localeCompare(groupB);
          if (groupCompare !== 0) {
            return groupCompare;
          }
        }
        return a.id.localeCompare(b.id);
      });

      return phases;
    } catch (err) {
      console.error('Failed to read phases directory:', err);
      return [];
    }
  }

  async getPRDetails(
    repoPath: string,
    prUrlOrId: string,
    _settings: AppSettings,
  ): Promise<PRMetadata> {
    const provider = await this.getCodeReviewProvider();
    if (!provider) {
      throw new Error('No code review provider configured.');
    }
    const remoteUrl = await this.gitService.getRemoteUrl(repoPath);
    return provider.getPRDetails(repoPath, prUrlOrId, remoteUrl);
  }

  async getProjectPRs(
    searchType: 'assigned' | 'created' | 'all',
    _settings: AppSettings,
  ): Promise<PRMetadata[]> {
    const provider = await this.getCodeReviewProvider();
    if (!provider) {
      throw new Error('No code review provider configured.');
    }
    return provider.getProjectPRs(searchType);
  }

  getEffectiveRepoPath(repoPath: string): string {
    const active = this.activeWorktrees.get(repoPath);
    return active ? active.worktreePath : repoPath;
  }

  async cleanupWorktree(repoPath: string): Promise<void> {
    const active = this.activeWorktrees.get(repoPath);
    if (active) {
      try {
        await this.gitService.removeWorktree(repoPath, active.worktreePath);
      } catch (err) {
        console.error(
          `Failed to clean up worktree at ${active.worktreePath}:`,
          err,
        );
      }
      this.activeWorktrees.delete(repoPath);
    }
  }

  async checkWorktrees(
    baseDir: string,
  ): Promise<{ hasWorktrees: boolean; worktreeCount: number }> {
    try {
      if (!baseDir) {
        return { hasWorktrees: false, worktreeCount: 0 };
      }
      const resolved = path.resolve(baseDir);
      if (!fs.existsSync(resolved)) {
        return { hasWorktrees: false, worktreeCount: 0 };
      }
      const stat = fs.statSync(resolved);
      if (!stat.isDirectory()) {
        return { hasWorktrees: false, worktreeCount: 0 };
      }
      const files = fs.readdirSync(resolved);
      let worktreeCount = 0;
      for (const file of files) {
        const fullPath = path.join(resolved, file);
        try {
          const s = fs.statSync(fullPath);
          if (s.isDirectory()) {
            worktreeCount++;
          }
        } catch {
          // Ignore files we cannot access
        }
      }
      return {
        hasWorktrees: worktreeCount > 0,
        worktreeCount,
      };
    } catch (err) {
      console.error(`Error in checkWorktrees for ${baseDir}:`, err);
      return { hasWorktrees: false, worktreeCount: 0 };
    }
  }

  async cleanWorktrees(
    baseDir: string,
  ): Promise<{ success: boolean; cleanedCount: number; errors: string[] }> {
    const errors: string[] = [];
    let cleanedCount = 0;
    try {
      if (!baseDir) {
        return { success: true, cleanedCount: 0, errors: [] };
      }
      const resolved = path.resolve(baseDir);
      if (!fs.existsSync(resolved)) {
        return { success: true, cleanedCount: 0, errors: [] };
      }
      const files = fs.readdirSync(resolved);
      for (const file of files) {
        const worktreePath = path.join(resolved, file);
        try {
          const s = fs.statSync(worktreePath);
          if (!s.isDirectory()) {
            continue;
          }

          let removed = false;
          const gitFilePath = path.join(worktreePath, '.git');
          if (fs.existsSync(gitFilePath)) {
            const gitFileStat = fs.statSync(gitFilePath);
            if (gitFileStat.isFile()) {
              const content = fs.readFileSync(gitFilePath, 'utf8');
              const match = content.match(/gitdir:\s*(.+)/);
              if (match) {
                const gitDir = match[1].trim();
                const normalizedGitDir = path.normalize(gitDir);
                const marker = path.join('.git', 'worktrees');
                const index = normalizedGitDir.indexOf(marker);
                if (index !== -1) {
                  const mainRepoPath = path.resolve(
                    normalizedGitDir.substring(0, index),
                  );
                  if (fs.existsSync(mainRepoPath)) {
                    await this.gitService.removeWorktree(
                      mainRepoPath,
                      worktreePath,
                    );
                    removed = true;
                  }
                }
              }
            }
          }

          if (!removed) {
            if (fs.existsSync(worktreePath)) {
              fs.rmSync(worktreePath, { recursive: true, force: true });
            }
          }
          cleanedCount++;
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          errors.push(`Failed to clean up ${file}: ${errMsg}`);
          console.error(`Error cleaning up worktree at ${worktreePath}:`, err);
        }
      }

      this.activeWorktrees.clear();

      return {
        success: errors.length === 0,
        cleanedCount,
        errors,
      };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        cleanedCount,
        errors: [errMsg],
      };
    }
  }

  async checkoutAndDiff(
    repoPath: string,
    prNumber: number,
    expectedRepoName?: string,
    settings?: AppSettings,
  ): Promise<{ commitSha: string }> {
    const isRepo = await this.gitService.checkGitRepo(repoPath);
    if (!isRepo) {
      throw new Error('The selected path is not a valid Git repository.');
    }

    if (expectedRepoName) {
      const remoteUrl = await this.gitService.getRemoteUrl(repoPath);
      if (remoteUrl) {
        const provider = await this.getCodeReviewProvider();
        const parsedRemote = provider
          ? provider.parseRemoteUrl(remoteUrl)
          : null;
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

    // Restore any existing active checkout/worktree first to avoid leaks
    const existingRef = this.activeCheckouts.get(repoPath);
    if (existingRef) {
      try {
        await this.gitService.restoreRef(repoPath, existingRef);
      } catch (err) {
        console.error(
          `Failed to restore existing checkout for ${repoPath}:`,
          err,
        );
      }
      this.activeCheckouts.delete(repoPath);
    }

    if (settings?.gitWorktreeEnabled && settings?.gitWorktreeBaseDir) {
      await this.cleanupWorktree(repoPath);

      // Fetch the PR
      const commitSha = await this.gitService.fetchPR(repoPath, prNumber);

      // Create worktree
      const sanitizeDirName = (name: string) =>
        name.replace(/[^a-zA-Z0-9-_]/g, '_');
      const worktreeName = `${sanitizeDirName(expectedRepoName || 'repo')}_pr_${prNumber}`;
      const worktreePath = path.join(settings.gitWorktreeBaseDir, worktreeName);

      if (!fs.existsSync(settings.gitWorktreeBaseDir)) {
        fs.mkdirSync(settings.gitWorktreeBaseDir, { recursive: true });
      }

      await this.gitService.addWorktree(repoPath, worktreePath, commitSha);

      // Store in worktree mapping
      this.activeWorktrees.set(repoPath, {
        worktreePath,
        originalRef: commitSha,
      });

      return { commitSha };
    }

    const isDirty = await this.gitService.hasUncommittedChanges(repoPath);
    if (isDirty) {
      throw new Error(
        'The local git repository has uncommitted changes. Please commit, stash, or revert them first.',
      );
    }

    // Capture the current (original) ref before performing the PR checkout
    const originalRef = await this.gitService.getCurrentRef(repoPath);
    this.activeCheckouts.set(repoPath, originalRef);

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
      enabledPhaseIds?: string[];
      prDescription?: string;
      prId?: string;
      onLine?: (line: string) => void;
      maxParallelism?: number;
    } = {},
  ): Promise<CopilotResult<string>> {
    if (!options.enabledPhaseIds || options.enabledPhaseIds.length === 0) {
      throw new Error(
        'No review phases selected. Please select at least one phase to start the review.',
      );
    }

    let blockerId: number | null = null;
    try {
      blockerId = powerSaveBlocker.start('prevent-app-suspension');

      const effectiveRepoPath = this.getEffectiveRepoPath(repoPath);
      const files = await this.gitService.getDiffFiles(
        effectiveRepoPath,
        targetBranch,
      );
      const phases = await this.loadPhasesFromDisk();

      if (phases.length === 0) {
        throw new Error(
          'No custom review phases found on disk. Please configure them in ~/.stitch/pr-reviewer/phases',
        );
      }

      const enabledPhases = phases.filter((phase) =>
        options.enabledPhaseIds!.includes(phase.id),
      );

      if (enabledPhases.length === 0) {
        throw new Error(
          'None of the selected review phases were found on disk.',
        );
      }

      for (const phase of enabledPhases) {
        if (phase.templateError) {
          throw new Error(phase.templateError);
        }
      }

      let prDetails: PRMetadata | null = null;
      if (options.prId) {
        try {
          prDetails = await this.getPRDetails(repoPath, options.prId, settings);
        } catch (err) {
          console.error(
            `Failed to fetch PR details for PR ${options.prId}:`,
            err,
          );
        }
      }

      let linkedStoriesContent = '';
      const knownDocs: { id: string; title: string }[] = [];

      const anyPhaseNeedsStory = enabledPhases.some(
        (phase) => phase.attach && phase.attach.toLowerCase().includes('story'),
      );

      if (anyPhaseNeedsStory && prDetails && options.prId) {
        try {
          const provider = await this.getCodeReviewProvider();
          if (provider) {
            const workItemRefs = await provider.getLinkedTickets(
              prDetails.id,
              prDetails.repositoryId,
            );

            if (workItemRefs && workItemRefs.length > 0) {
              const issueTracker = await this.getIssueTrackerProvider();
              const docProvider = await this.getDocProvider();
              const storiesList: string[] = [];

              for (const refId of workItemRefs) {
                if (refId) {
                  try {
                    let ticketData: TicketData;
                    if (issueTracker) {
                      ticketData = await issueTracker.fetchTicket(refId);
                    } else {
                      ticketData = {
                        id: refId,
                        title: `Work Item ${refId}`,
                        description: '',
                      };
                    }

                    const storyFormatted = `Ticket ID: ${ticketData.id || 'N/A'}\nTitle: ${ticketData.title}\nDescription: ${ticketData.description}\nAcceptance Criteria: ${ticketData.acceptanceCriteria || 'N/A'}`;
                    storiesList.push(storyFormatted);

                    if (docProvider) {
                      const urls = [
                        ...this.extractUrls(ticketData.description || ''),
                        ...this.extractUrls(
                          ticketData.acceptanceCriteria || '',
                        ),
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
                          if (!knownDocs.some((d) => d.id === page.id)) {
                            knownDocs.push({ id: page.id, title: page.title });
                          }
                        } catch (e) {
                          console.error(
                            `Failed to fetch metadata for Confluence page ${pageId}:`,
                            e,
                          );
                          if (!knownDocs.some((d) => d.id === pageId)) {
                            knownDocs.push({
                              id: pageId,
                              title: `Document ID: ${pageId}`,
                            });
                          }
                        }
                      }
                    }
                  } catch (err) {
                    console.error(
                      `Failed to fetch details for work item ${refId}:`,
                      err,
                    );
                  }
                }
              }

              if (storiesList.length > 0) {
                linkedStoriesContent = storiesList.join('\n\n');
              }
            }
          }
        } catch (err) {
          console.error('Failed to retrieve associated work items:', err);
        }
      }

      const results: string[] = new Array(enabledPhases.length).fill('');
      const phaseStats: { phaseTitle: string; usage: CopilotUsage }[] = [];
      let firstError: Error | null = null;
      let queueIndex = 0;

      const getNextPhase = () => {
        if (queueIndex < enabledPhases.length) {
          const index = queueIndex++;
          return { phase: enabledPhases[index], phaseIdx: index };
        }
        return null;
      };

      const numCPUs = os.cpus().length;
      let maxWorkers: number;
      if (numCPUs < 4) {
        maxWorkers = 1;
      } else {
        const preferredLimit =
          options.maxParallelism ?? settings.maxParallelism;
        if (
          preferredLimit !== undefined &&
          preferredLimit >= 1 &&
          preferredLimit <= numCPUs - 2
        ) {
          maxWorkers = preferredLimit;
        } else {
          maxWorkers = Math.max(1, Math.floor(numCPUs / 2));
        }
      }
      const workerCount = Math.min(maxWorkers, enabledPhases.length);

      const runWorker = async () => {
        while (true) {
          if (firstError) {
            break;
          }
          const task = getNextPhase();
          if (!task) {
            break;
          }
          const { phase, phaseIdx } = task;

          let eligibleFiles = [...files];

          if (phase.include) {
            try {
              const isMatch = getGlobMatcher(phase.include);
              eligibleFiles = eligibleFiles.filter((f) => isMatch(f.path));
            } catch (err) {
              console.error(`Invalid include glob: ${phase.include}`, err);
            }
          }

          if (phase.exclude) {
            try {
              const isMatch = getGlobMatcher(phase.exclude);
              eligibleFiles = eligibleFiles.filter((f) => !isMatch(f.path));
            } catch (err) {
              console.error(`Invalid exclude glob: ${phase.exclude}`, err);
            }
          }

          if (eligibleFiles.length === 0) {
            if (options.onLine) {
              options.onLine(
                JSON.stringify({
                  type: 'phase-skip',
                  phaseId: phase.id,
                  phaseTitle: phase.title,
                  reason: 'No matching files found',
                }),
              );
            }
            continue;
          }

          const attachStory =
            phase.attach && phase.attach.toLowerCase().includes('story');

          if (attachStory && !linkedStoriesContent) {
            if (options.onLine) {
              options.onLine(
                JSON.stringify({
                  type: 'phase-skip',
                  phaseId: phase.id,
                  phaseTitle: phase.title,
                  reason: 'No linked stories found for this Pull Request',
                }),
              );
            }
            continue;
          }

          if (options.onLine) {
            options.onLine(
              JSON.stringify({
                type: 'phase-start',
                phaseId: phase.id,
                phaseTitle: phase.title,
              }),
            );
          }

          const wrappedOnLine = (line: string) => {
            if (!options.onLine) return;
            try {
              const obj = JSON.parse(line);
              if (obj) {
                obj.phase = phase.title;
                obj.phaseId = phase.id;

                if (obj.type === 'status' && obj.text && !obj.status) {
                  obj.status = obj.text;
                }

                if (
                  obj.type === 'line' &&
                  typeof obj.file === 'string' &&
                  typeof obj.line === 'number'
                ) {
                  const contextSize =
                    typeof obj.context === 'number' ? obj.context : 0;
                  const codeLines = extractFileContextSync(
                    effectiveRepoPath,
                    obj.file,
                    obj.line,
                    contextSize,
                  );
                  if (codeLines) {
                    obj.codeLines = codeLines;
                  }
                }
              }
              options.onLine(JSON.stringify(obj));
            } catch {
              options.onLine(line);
            }
          };

          const sessionOpts = attachStory
            ? {
                workingDirectory: effectiveRepoPath,
                tools: [
                  createRequestDocumentationTool(this.getDocProvider, () =>
                    options.onLine ? wrappedOnLine : undefined,
                  ),
                ],
              }
            : { workingDirectory: effectiveRepoPath };

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let clientAndSession: { client: any; session: any } | null;
          try {
            clientAndSession = await this.copilotService.createClientAndSession(
              settings.copilotToken,
              options.modelOverride,
              sessionOpts,
            );
          } catch (err) {
            console.error(
              `Error creating client/session for phase ${phase.title}:`,
              err,
            );
            if (!firstError) {
              firstError = err as Error;
            }
            break;
          }

          const { client, session } = clientAndSession;
          session.isPrReviewer = true;
          session.label = `PR Reviewer Phase: ${phase.title}`;

          const attachDescription =
            phase.attach && phase.attach.toLowerCase().includes('description');

          let fullDescription = options.prDescription;
          if (attachDescription && prDetails && prDetails.description) {
            fullDescription = prDetails.description;
          }

          const prompt = buildPhaseReviewPrompt(
            eligibleFiles,
            phase.title,
            phase.body,
            options.customInstructions,
            attachDescription ? fullDescription : undefined,
            attachStory ? linkedStoriesContent : undefined,
            attachStory ? knownDocs : undefined,
          );

          const onToolCallback = (
            type: 'start' | 'end',
            tool: string,
            success?: boolean,
            error?: string,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            args?: any,
          ) => {
            if (options.onLine) {
              options.onLine(
                JSON.stringify({
                  type: 'tool',
                  status: type,
                  name: tool,
                  success,
                  error,
                  arguments: args,
                  phaseId: phase.id,
                  phaseTitle: phase.title,
                }),
              );
            }
          };

          try {
            const res = await this.copilotService.sendAndCollectStream(
              session,
              prompt,
              options.onLine ? wrappedOnLine : undefined,
              ...(attachStory ? [onToolCallback] : []),
            );
            results[phaseIdx] = `\n--- Phase ${phase.title} Result ---\n${res}`;
          } catch (err) {
            console.error(`Error executing phase ${phase.title}:`, err);
            if (!firstError) {
              firstError = err as Error;
            }
          } finally {
            const usage: CopilotUsage = session.usage ?? {
              inputTokens: 0,
              outputTokens: 0,
              cacheReadTokens: 0,
              cost: 0,
            };

            phaseStats.push({
              phaseTitle: phase.title,
              usage,
            });

            try {
              await session.disconnect();
            } catch (e) {
              console.error('Error destroying session in reviewPR phase:', e);
            }
            try {
              await client.stop();
            } catch (e) {
              console.error('Error stopping client in reviewPR phase:', e);
            }

            if (options.onLine) {
              options.onLine(
                JSON.stringify({
                  type: 'phase-end',
                  phaseId: phase.id,
                  phaseTitle: phase.title,
                }),
              );
            }
          }
        }
      };

      const workers = Array.from({ length: workerCount }, () => runWorker());
      await Promise.all(workers);

      const totalInputTokens = phaseStats.reduce(
        (sum, stat) => sum + stat.usage.inputTokens,
        0,
      );
      const totalOutputTokens = phaseStats.reduce(
        (sum, stat) => sum + stat.usage.outputTokens,
        0,
      );
      const totalCacheReadTokens = phaseStats.reduce(
        (sum, stat) => sum + stat.usage.cacheReadTokens,
        0,
      );
      const totalCost = phaseStats.reduce(
        (sum, stat) => sum + stat.usage.cost,
        0,
      );

      if (firstError) {
        throw firstError;
      }

      const accumulatedResult = results.filter((r) => r !== '').join('');

      return {
        result: accumulatedResult,
        usage: {
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
          cacheReadTokens: totalCacheReadTokens,
          cost: totalCost,
        },
      };
    } finally {
      if (blockerId !== null && powerSaveBlocker.isStarted(blockerId)) {
        powerSaveBlocker.stop(blockerId);
      }

      if (settings.gitWorktreeEnabled && settings.gitWorktreeBaseDir) {
        await this.cleanupWorktree(repoPath);
      } else {
        const originalRef = this.activeCheckouts.get(repoPath);
        if (originalRef) {
          try {
            await this.gitService.restoreRef(repoPath, originalRef);
          } catch (err) {
            console.error(
              `Failed to automatically restore repository at ${repoPath}:`,
              err,
            );
          }
          this.activeCheckouts.delete(repoPath);
        }
      }
    }
  }

  async postPRComment(
    repoPath: string,
    prUrlOrId: string,
    comment: {
      type: 'general' | 'line';
      file?: string;
      line?: number;
      comment: string;
    },
    _settings: AppSettings,
  ): Promise<void> {
    const provider = await this.getCodeReviewProvider();
    if (!provider) {
      throw new Error('No code review provider configured.');
    }
    const remoteUrl = await this.gitService.getRemoteUrl(repoPath);
    await provider.postPRComment(repoPath, prUrlOrId, comment, remoteUrl);
  }
}
