import * as azdev from 'azure-devops-node-api';
import { IWorkItemTrackingApi } from 'azure-devops-node-api/WorkItemTrackingApi';

export class AzureDevOpsService {
  private witApi: IWorkItemTrackingApi | null = null;

  constructor(
    private org: string,
    private pat: string,
  ) {}

  private async getApi(): Promise<IWorkItemTrackingApi> {
    if (!this.witApi) {
      const authHandler = azdev.getPersonalAccessTokenHandler(this.pat);
      const connection = new azdev.WebApi(this.org, authHandler);
      this.witApi = await connection.getWorkItemTrackingApi();
    }
    return this.witApi;
  }

  async fetchTicket(ticketId: string) {
    const witApi = await this.getApi();

    try {
      const workItem = await witApi.getWorkItem(parseInt(ticketId));
      if (!workItem || !workItem.fields) {
        throw new Error('Work item not found.');
      }

      return {
        id: workItem.id,
        title: workItem.fields['System.Title'],
        description: workItem.fields['System.Description'],
        acceptanceCriteria:
          workItem.fields['Microsoft.VSTS.Common.AcceptanceCriteria'],
        project: workItem.fields['System.TeamProject'],
      };
    } catch (error) {
      console.error('Error fetching ticket:', error);
      throw error;
    }
  }

  async addComment(ticketId: string, text: string) {
    const witApi = await this.getApi();
    const document = [
      {
        op: 'add',
        path: '/fields/System.History',
        value: text,
      },
      {
        op: 'add',
        path: '/multilineFieldsFormat/System.History',
        value: 'Markdown',
      },
    ];
    return witApi.updateWorkItem(undefined, document, parseInt(ticketId));
  }

  async addChildTask(
    parentTicketId: string,
    title: string,
    description: string,
  ) {
    const witApi = await this.getApi();

    const parentWorkItem = await witApi.getWorkItem(parseInt(parentTicketId));
    if (!parentWorkItem || !parentWorkItem.fields) {
      throw new Error('Parent work item not found.');
    }

    const project = parentWorkItem.fields['System.TeamProject'];
    const parentUrl = parentWorkItem.url;

    const document = [
      { op: 'add', path: '/fields/System.Title', value: title },
      { op: 'add', path: '/fields/System.Description', value: description },
      {
        op: 'add',
        path: '/multilineFieldsFormat/System.Description',
        value: 'Markdown',
      },
      {
        op: 'add',
        path: '/relations/-',
        value: {
          rel: 'System.LinkTypes.Hierarchy-Reverse',
          url: parentUrl,
          attributes: { comment: 'Added via Copilot test case generation' },
        },
      },
    ];

    return witApi.createWorkItem(undefined, document, project, 'Task');
  }

  async createProductBacklogItem(
    parentTicketId: string,
    title: string,
    description: string,
    acceptanceCriteria: string,
  ) {
    const witApi = await this.getApi();

    const parentWorkItem = await witApi.getWorkItem(parseInt(parentTicketId));
    if (!parentWorkItem || !parentWorkItem.fields) {
      throw new Error('Parent work item not found.');
    }

    const project = parentWorkItem.fields['System.TeamProject'];
    const parentUrl = parentWorkItem.url;

    const document = [
      { op: 'add', path: '/fields/System.Title', value: title },
      { op: 'add', path: '/fields/System.Description', value: description },
      {
        op: 'add',
        path: '/multilineFieldsFormat/System.Description',
        value: 'Markdown',
      },
      {
        op: 'add',
        path: '/fields/Microsoft.VSTS.Common.AcceptanceCriteria',
        value: acceptanceCriteria,
      },
      {
        op: 'add',
        path: '/multilineFieldsFormat/Microsoft.VSTS.Common.AcceptanceCriteria',
        value: 'Markdown',
      },
      {
        op: 'add',
        path: '/relations/-',
        value: {
          rel: 'System.LinkTypes.Hierarchy-Reverse',
          url: parentUrl,
          attributes: { comment: 'Added via Copilot story generation' },
        },
      },
    ];

    return witApi.createWorkItem(
      undefined,
      document,
      project,
      'Product Backlog Item',
    );
  }
}
