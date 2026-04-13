import * as azdev from 'azure-devops-node-api';
import { IWorkItemTrackingApi } from 'azure-devops-node-api/WorkItemTrackingApi';
import { IssueTrackerProvider } from './providers/IssueTrackerProvider';
import { TicketData } from '../../types';

export class AzureDevOpsService implements IssueTrackerProvider {
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

  async fetchTicket(ticketId: string): Promise<TicketData> {
    const witApi = await this.getApi();

    try {
      const workItem = await witApi.getWorkItem(parseInt(ticketId));
      if (!workItem || !workItem.fields || workItem.id === undefined) {
        throw new Error('Work item not found.');
      }

      return {
        id: workItem.id.toString(),
        title: workItem.fields['System.Title'],
        description: workItem.fields['System.Description'],
        acceptanceCriteria:
          workItem.fields['Microsoft.VSTS.Common.AcceptanceCriteria'],
      };
    } catch (error) {
      console.error('Error fetching ticket:', error);
      throw error;
    }
  }

  async addComment(ticketId: string, text: string): Promise<void> {
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
    await witApi.updateWorkItem(undefined, document, parseInt(ticketId));
  }

  async createTicket(
    type: string,
    parentTicketId: string,
    data: TicketData,
  ): Promise<void> {
    const witApi = await this.getApi();

    const parentWorkItem = await witApi.getWorkItem(parseInt(parentTicketId));
    if (!parentWorkItem || !parentWorkItem.fields) {
      throw new Error('Parent work item not found.');
    }

    const project = parentWorkItem.fields['System.TeamProject'];
    const parentUrl = parentWorkItem.url;

    const document = [
      { op: 'add', path: '/fields/System.Title', value: data.title },
      {
        op: 'add',
        path: '/fields/System.Description',
        value: data.description,
      },
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
          attributes: { comment: 'Created via Stitch' },
        },
      },
    ];

    if (data.acceptanceCriteria) {
      document.push({
        op: 'add',
        path: '/fields/Microsoft.VSTS.Common.AcceptanceCriteria',
        value: data.acceptanceCriteria,
      });
      document.push({
        op: 'add',
        path: '/multilineFieldsFormat/Microsoft.VSTS.Common.AcceptanceCriteria',
        value: 'Markdown',
      });
    }

    await witApi.createWorkItem(undefined, document, project, type);
  }
}
