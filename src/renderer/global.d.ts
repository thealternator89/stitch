import {
  AppSettings,
  TicketData,
  DocPageData,
  CopilotAuth,
  CopilotModel,
  UpdateStatus,
  EnvironmentCheckResult,
} from '../types';

export interface IElectronAPI {
  getSettings: () => Promise<AppSettings>;
  saveSettings: (settings: AppSettings) => Promise<void>;
  fetchTicket: (id: string) => Promise<TicketData>;
  searchTickets: (query: string) => Promise<TicketData[]>;
  generateTestCases: (
    ticketData: TicketData,
    context: string,
    modelOverride: string,
  ) => Promise<string>;
  onTestCaseLine: (callback: (line: string) => void) => () => void;
  fetchConfluencePage: (pageId: string) => Promise<DocPageData>;
  searchConfluencePages: (query: string) => Promise<DocPageData[]>;
  generateStories: (
    pageData: DocPageData,
    context: string,
    modelOverride: string,
  ) => Promise<string>;
  onStoryLine: (callback: (line: string) => void) => () => void;
  addComment: (ticketId: string, text: string) => Promise<void>;
  createTicket: (
    type: string,
    parentTicketId: string,
    data: TicketData,
  ) => Promise<void>;

  checkCopilotAuth: () => Promise<CopilotAuth>;
  checkEnvironment: () => Promise<EnvironmentCheckResult>;
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
  ) => Promise<string>;
  sendElaborationAnswer: (ticketId: string, answer: string) => Promise<string>;
  stopStoryElaboration: (ticketId: string) => Promise<void>;
  onElaborationLine: (callback: (line: string) => void) => () => void;
  isWindows: boolean;
}

declare global {
  interface Window {
    electronAPI: IElectronAPI;
  }
}
