import { contextBridge, ipcRenderer } from 'electron';
import { AppSettings, TicketData, DocPageData } from '../types';

contextBridge.exposeInMainWorld('electronAPI', {
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings: AppSettings) =>
    ipcRenderer.invoke('save-settings', settings),
  fetchTicket: (id: string) => ipcRenderer.invoke('fetch-ticket', id),
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
  fetchConfluencePage: (pageId: string) =>
    ipcRenderer.invoke('fetch-confluence-page', pageId),
  generateStories: (
    pageData: DocPageData,
    context: string,
    modelOverride: string,
  ) => ipcRenderer.invoke('generate-stories', pageData, context, modelOverride),
  addComment: (ticketId: string, text: string) =>
    ipcRenderer.invoke('add-comment', ticketId, text),
  createTicket: (type: string, parentTicketId: string, data: TicketData) =>
    ipcRenderer.invoke('create-ticket', type, parentTicketId, data),
  checkCopilotAuth: () => ipcRenderer.invoke('check-copilot-auth'),
  getVersion: () => ipcRenderer.invoke('get-version'),
  listCopilotModels: () => ipcRenderer.invoke('list-copilot-models'),
  openExternal: (url: string) => ipcRenderer.invoke('open-external', url),
  isWindows: process.platform === 'win32',
});
