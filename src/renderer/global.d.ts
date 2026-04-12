import {
  AppSettings,
  TicketData,
  DocPageData,
  StoryData,
  CopilotAuth,
  CopilotModel,
} from '../types';

export interface IElectronAPI {
  getSettings: () => Promise<AppSettings>;
  saveSettings: (settings: AppSettings) => Promise<void>;
  fetchTicket: (id: string) => Promise<TicketData>;
  generateTestCases: (
    ticketData: TicketData,
    context: string,
    modelOverride: string,
  ) => Promise<string>;
  fetchConfluencePage: (pageId: string) => Promise<DocPageData>;
  generateStories: (
    pageData: DocPageData,
    context: string,
    modelOverride: string,
  ) => Promise<StoryData[]>;
  addComment: (ticketId: string, text: string) => Promise<void>;
  createTicket: (
    type: string,
    parentTicketId: string,
    data: TicketData,
  ) => Promise<void>;

  checkCopilotAuth: () => Promise<CopilotAuth>;
  getVersion: () => Promise<string>;
  listCopilotModels: () => Promise<CopilotModel[]>;
  openExternal: (url: string) => Promise<void>;
  isWindows: boolean;
}

declare global {
  interface Window {
    electronAPI: IElectronAPI;
  }
}
