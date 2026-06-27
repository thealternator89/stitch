import { contextBridge, ipcRenderer } from 'electron';
import {
  AppSettings,
  TicketData,
  DocPageData,
  PRMetadata,
  PRDiffFile,
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
  ): Promise<{ commitSha: string }> =>
    ipcRenderer.invoke('pr-reviewer:checkout', repoPath, prNumber),
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
  isWindows: process.platform === 'win32',
});
