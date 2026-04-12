import {
  AppSettings,
  TicketData,
  ConfluencePageData,
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
  fetchConfluencePage: (pageId: string) => Promise<ConfluencePageData>;
  generateStories: (
    pageData: ConfluencePageData,
    context: string,
    modelOverride: string,
  ) => Promise<StoryData[]>;
  addComment: (ticketId: string, text: string) => Promise<void>;
  addChildTask: (
    parentTicketId: string,
    title: string,
    description: string,
  ) => Promise<TicketData>;
  createPBI: (
    parentTicketId: string,
    title: string,
    description: string,
    acceptanceCriteria: string,
  ) => Promise<TicketData>;
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
