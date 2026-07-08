import { contextBridge, ipcRenderer } from 'electron';
import {
  AppSettings,
  TicketData,
  DocPageData,
  PRMetadata,
  PRDiffFile,
  ReviewPhase,
} from '../types';

contextBridge.exposeInMainWorld('electronAPI', {
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings: AppSettings) =>
    ipcRenderer.invoke('save-settings', settings),
  fetchTicket: (id: string) => ipcRenderer.invoke('fetch-ticket', id),
  searchTickets: (query: string) => ipcRenderer.invoke('search-tickets', query),
  generateTestCases: (
    ticketData: TicketData,
    context: string,
    modelOverride: string,
  ) =>
    ipcRenderer.invoke(
      'generate-test-cases',
      ticketData,
      context,
      modelOverride,
    ),
  onTestCaseLine: (callback: (line: string) => void) => {
    const listener = (_event: unknown, line: string) => callback(line);
    ipcRenderer.on('test-case-line', listener);
    return () => {
      ipcRenderer.removeListener('test-case-line', listener);
    };
  },
  fetchConfluencePage: (pageId: string) =>
    ipcRenderer.invoke('fetch-confluence-page', pageId),
  searchConfluencePages: (query: string) =>
    ipcRenderer.invoke('search-confluence-pages', query),
  generateStories: (
    pageData: DocPageData,
    context: string,
    modelOverride: string,
  ) => ipcRenderer.invoke('generate-stories', pageData, context, modelOverride),
  onStoryLine: (callback: (line: string) => void) => {
    const listener = (_event: unknown, line: string) => callback(line);
    ipcRenderer.on('story-line', listener);
    return () => {
      ipcRenderer.removeListener('story-line', listener);
    };
  },
  addComment: (ticketId: string, text: string) =>
    ipcRenderer.invoke('add-comment', ticketId, text),
  createTicket: (type: string, parentTicketId: string, data: TicketData) =>
    ipcRenderer.invoke('create-ticket', type, parentTicketId, data),
  checkCopilotAuth: () => ipcRenderer.invoke('check-copilot-auth'),
  checkEnvironment: () => ipcRenderer.invoke('check-environment'),
  installCopilotCli: () => ipcRenderer.invoke('install-copilot-cli'),
  getVersionStatus: () => ipcRenderer.invoke('get-version-status'),
  listCopilotModels: () => ipcRenderer.invoke('list-copilot-models'),
  openExternal: (url: string) => ipcRenderer.invoke('open-external', url),
  checkPromptComplexity: (
    type: 'story' | 'testcase',
    prompts: Record<string, string>,
  ) => ipcRenderer.invoke('check-prompt-complexity', type, prompts),
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  startStoryElaboration: (
    ticketData: TicketData,
    repoPath: string | null,
    additionalContext: string,
    modelOverride: string,
  ) =>
    ipcRenderer.invoke(
      'start-story-elaboration',
      ticketData,
      repoPath,
      additionalContext,
      modelOverride,
    ),
  sendElaborationAnswer: (ticketId: string, answer: string) =>
    ipcRenderer.invoke('send-elaboration-answer', ticketId, answer),
  stopStoryElaboration: (ticketId: string) =>
    ipcRenderer.invoke('stop-story-elaboration', ticketId),
  onElaborationLine: (callback: (line: string) => void) => {
    const listener = (_event: unknown, line: string) => callback(line);
    ipcRenderer.on('elaboration-line', listener);
    return () => {
      ipcRenderer.removeListener('elaboration-line', listener);
    };
  },
  getPRDetails: (repoPath: string, prUrlOrId: string): Promise<PRMetadata> =>
    ipcRenderer.invoke('pr-reviewer:get-details', repoPath, prUrlOrId),
  checkoutPR: (
    repoPath: string,
    prNumber: number,
    expectedRepoName?: string,
  ): Promise<{ commitSha: string }> =>
    ipcRenderer.invoke(
      'pr-reviewer:checkout',
      repoPath,
      prNumber,
      expectedRepoName,
    ),
  getPRDiffFiles: (
    repoPath: string,
    targetBranch: string,
  ): Promise<PRDiffFile[]> =>
    ipcRenderer.invoke('pr-reviewer:get-diff-files', repoPath, targetBranch),
  getPRFileDiff: (
    repoPath: string,
    targetBranch: string,
    filePath: string,
  ): Promise<string> =>
    ipcRenderer.invoke(
      'pr-reviewer:get-file-diff',
      repoPath,
      targetBranch,
      filePath,
    ),
  searchPRs: (
    searchType: 'assigned' | 'created' | 'all',
  ): Promise<PRMetadata[]> =>
    ipcRenderer.invoke('pr-reviewer:search-prs', searchType),
  getRepoPathHistory: (repoName: string): Promise<string | null> =>
    ipcRenderer.invoke('pr-reviewer:get-repo-path-history', repoName),
  saveRepoPathHistory: (repoName: string, repoPath: string): Promise<boolean> =>
    ipcRenderer.invoke(
      'pr-reviewer:save-repo-path-history',
      repoName,
      repoPath,
    ),
  verifyRepoPath: (
    repoPath: string,
  ): Promise<{
    isGitRepo: boolean;
    path: string;
    originalPath: string;
    wasModified: boolean;
  }> => ipcRenderer.invoke('pr-reviewer:verify-repo-path', repoPath),
  getPhases: (): Promise<ReviewPhase[]> =>
    ipcRenderer.invoke('pr-reviewer:get-phases'),
  openPRReviewerDirectory: (): Promise<boolean> =>
    ipcRenderer.invoke('pr-reviewer:open-directory'),
  checkWorktrees: (baseDir: string) =>
    ipcRenderer.invoke('pr-reviewer:check-worktrees', baseDir),
  cleanWorktrees: (baseDir: string) =>
    ipcRenderer.invoke('pr-reviewer:clean-worktrees', baseDir),

  reviewPR: (
    repoPath: string,
    targetBranch: string,
    customInstructions: string,
    modelOverride: string,
    enabledPhaseIds?: string[],
    prDescription?: string,
    prId?: string,
  ): Promise<string> =>
    ipcRenderer.invoke(
      'pr-reviewer:review',
      repoPath,
      targetBranch,
      customInstructions,
      modelOverride,
      enabledPhaseIds,
      prDescription,
      prId,
    ),
  onPRReviewLine: (callback: (line: string) => void) => {
    const listener = (_event: unknown, line: string) => callback(line);
    ipcRenderer.on('pr-reviewer:review-line', listener);
    return () => {
      ipcRenderer.removeListener('pr-reviewer:review-line', listener);
    };
  },
  postPRComment: (
    repoPath: string,
    prUrlOrId: string,
    comment: {
      type: 'general' | 'line';
      file?: string;
      line?: number;
      comment: string;
    },
  ): Promise<void> =>
    ipcRenderer.invoke(
      'pr-reviewer:post-comment',
      repoPath,
      prUrlOrId,
      comment,
    ),
  isWindows: process.platform === 'win32',
});
