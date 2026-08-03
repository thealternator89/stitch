import {
  AppSettings,
  TicketData,
  DocPageData,
  CopilotAuth,
  CopilotModel,
  UpdateStatus,
  EnvironmentCheckResult,
  PRMetadata,
  PRDiffFile,
  ReviewPhase,
  ReviewComment,
  CopilotResult,
  CopilotUsage,
  DbSession,
} from '../types';

export interface IElectronAPI {
  getSettings: () => Promise<AppSettings>;
  saveSettings: (settings: AppSettings) => Promise<void>;
  fetchTicket: (id: string) => Promise<TicketData>;
  searchTickets: (query: string, type?: string) => Promise<TicketData[]>;
  getAzureWorkItemTypes: (
    org: string,
    pat: string,
    project: string,
  ) => Promise<string[]>;
  generateTestCases: (
    ticketData: TicketData,
    context: string,
    modelOverride: string,
  ) => Promise<CopilotResult<string> & { dbSessionId?: number }>;
  onTestCaseLine: (callback: (line: string) => void) => () => void;
  fetchConfluencePage: (pageId: string) => Promise<DocPageData>;
  searchConfluencePages: (query: string) => Promise<DocPageData[]>;
  generateStories: (
    pageData: DocPageData,
    context: string,
    modelOverride: string,
  ) => Promise<CopilotResult<string> & { dbSessionId?: number }>;
  onStoryLine: (callback: (line: string) => void) => () => void;
  addComment: (
    ticketId: string,
    text: string,
    options?: { edited?: boolean; dbSessionId?: number },
  ) => Promise<void>;
  createTicket: (
    type: string,
    parentTicketId: string,
    data: TicketData,
    options?: { edited?: boolean; dbSessionId?: number },
  ) => Promise<void>;

  checkCopilotAuth: () => Promise<CopilotAuth>;
  checkEnvironment: () => Promise<EnvironmentCheckResult>;
  installCopilotCli: () => Promise<{ success: boolean; error?: string }>;
  getVersionStatus: () => Promise<UpdateStatus>;
  listCopilotModels: () => Promise<CopilotModel[]>;
  openExternal: (url: string) => Promise<void>;
  checkPromptComplexity: (
    type: 'story' | 'testcase',
    prompts: Record<string, string>,
  ) => Promise<string>;
  selectDirectory: () => Promise<string | null>;
  startStoryElaboration: (
    ticketData: TicketData,
    repoPath: string | null,
    additionalContext: string,
    modelOverride: string,
    branch?: string,
  ) => Promise<{ result: string; dbSessionId?: number }>;
  sendElaborationAnswer: (ticketId: string, answer: string) => Promise<string>;
  stopStoryElaboration: (ticketId: string) => Promise<CopilotUsage | null>;
  onElaborationLine: (callback: (line: string) => void) => () => void;
  startTShirtEstimation: (
    description: string,
    repoPath: string | null,
    modelOverride: string,
    branch?: string,
  ) => Promise<string>;
  stopTShirtEstimation: (sessionId: string) => Promise<CopilotUsage | null>;
  onTShirtEstimationLine: (callback: (line: string) => void) => () => void;
  getPRDetails: (repoPath: string, prUrlOrId: string) => Promise<PRMetadata>;
  checkoutPR: (
    repoPath: string,
    prNumber: number,
    expectedRepoName?: string,
  ) => Promise<{ commitSha: string }>;
  getPRDiffFiles: (
    repoPath: string,
    targetBranch: string,
  ) => Promise<PRDiffFile[]>;
  getPRFileDiff: (
    repoPath: string,
    targetBranch: string,
    filePath: string,
  ) => Promise<string>;
  searchPRs: (
    searchType: 'assigned' | 'created' | 'all',
  ) => Promise<PRMetadata[]>;
  getRepoPathHistory: (repoName: string) => Promise<string | null>;
  saveRepoPathHistory: (repoName: string, repoPath: string) => Promise<boolean>;
  getAuthorPersona: (authorKey: string) => Promise<string | null>;
  saveAuthorPersona: (authorKey: string, personaName: string) => Promise<void>;
  verifyRepoPath: (repoPath: string) => Promise<{
    isGitRepo: boolean;
    path: string;
    originalPath: string;
    wasModified: boolean;
  }>;
  getPhases: () => Promise<ReviewPhase[]>;
  openPRReviewerDirectory: () => Promise<boolean>;
  checkWorktrees: (
    baseDir: string,
  ) => Promise<{ hasWorktrees: boolean; worktreeCount: number }>;
  cleanWorktrees: (
    baseDir: string,
  ) => Promise<{ success: boolean; cleanedCount: number; errors: string[] }>;
  getCpuCount: () => Promise<number>;

  reviewPR: (
    repoPath: string,
    targetBranch: string,
    customInstructions: string,
    modelOverride: string,
    enabledPhaseIds?: string[],
    prDescription?: string,
    prId?: string,
    maxParallelism?: number,
    persona?: string,
    skipCleanup?: boolean,
  ) => Promise<CopilotResult<string> & { dbSessionId?: number }>;
  onPRReviewLine: (callback: (line: string) => void) => () => void;
  postPRComment: (
    repoPath: string,
    prUrlOrId: string,
    comment: {
      type: 'general' | 'line';
      file?: string;
      line?: number;
      comment: string;
      edited?: boolean;
    },
    dbSessionId?: number,
  ) => Promise<void>;
  critiquePRComments: (
    repoPath: string,
    comments: ReviewComment[],
    prDescription?: string,
    modelOverride?: string,
    persona?: string,
    dbSessionId?: number,
  ) => Promise<CopilotResult<ReviewComment[]>>;
  getHistory: () => Promise<DbSession[]>;
  clearHistory: () => Promise<void>;
  showNotification: (title: string, body: string) => Promise<void>;
  setWindowProgress: (
    progress: number,
    mode?: 'none' | 'normal' | 'indeterminate' | 'error' | 'paused',
  ) => Promise<void>;
  isWindows: boolean;
}

declare global {
  interface Window {
    electronAPI: IElectronAPI;
  }
}
