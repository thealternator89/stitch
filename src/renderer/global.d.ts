import {
  AppSettings,
  TicketData,
  DocPageData,
  CopilotAuth,
  CopilotModel,
  UpdateStatus,
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
  getVersion: () => Promise<string>;
  checkUpdateStatus: () => Promise<UpdateStatus>;
  acknowledgeUpdate: () => Promise<{ success: boolean }>;
  listCopilotModels: () => Promise<CopilotModel[]>;
  openExternal: (url: string) => Promise<void>;
  checkPromptComplexity: (
    type: 'story' | 'testcase',
    prompts: Record<string, string>,
  ) => Promise<string>;
  isWindows: boolean;
}

declare global {
  interface Window {
    electronAPI: IElectronAPI;
  }
}
