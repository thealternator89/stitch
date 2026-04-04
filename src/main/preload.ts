import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings: any) => ipcRenderer.invoke('save-settings', settings),
  fetchTicket: (id: string) => ipcRenderer.invoke('fetch-ticket', id),
  generateTestCases: (ticketData: any, context: string) => ipcRenderer.invoke('generate-test-cases', ticketData, context),
  fetchConfluencePage: (pageId: string) => ipcRenderer.invoke('fetch-confluence-page', pageId),
  generateStories: (pageData: any, context: string) => ipcRenderer.invoke('generate-stories', pageData, context),
  addComment: (ticketId: string, text: string) => ipcRenderer.invoke('add-comment', ticketId, text),
  addChildTask: (parentTicketId: string, title: string, description: string) => ipcRenderer.invoke('add-child-task', parentTicketId, title, description),
  createPBI: (parentTicketId: string, title: string, description: string, acceptanceCriteria: string) => ipcRenderer.invoke('create-pbi', parentTicketId, title, description, acceptanceCriteria),
  checkCopilotAuth: () => ipcRenderer.invoke('check-copilot-auth'),
  getVersion: () => ipcRenderer.invoke('get-version'),
});
