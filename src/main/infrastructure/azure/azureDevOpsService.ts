import * as azdev from 'azure-devops-node-api';
import { IWorkItemTrackingApi } from 'azure-devops-node-api/WorkItemTrackingApi';
import { IssueTrackerProvider } from '../providers/IssueTrackerProvider';
import { TicketData } from '../../../types';

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

  async searchTickets(query: string, type?: string): Promise<TicketData[]> {
    const witApi = await this.getApi();
    const cleanQuery = query.trim();
    const isNumber = /^\d+$/.test(cleanQuery);

    let exactMatch: TicketData | null = null;
    if (isNumber) {
      try {
        const item = await witApi.getWorkItem(parseInt(cleanQuery));
        if (item && item.id !== undefined && item.fields) {
          const itemType = item.fields['System.WorkItemType'];
          if (
            !type ||
            (itemType && itemType.toLowerCase() === type.toLowerCase())
          ) {
            exactMatch = {
              id: item.id.toString(),
              title: item.fields['System.Title'] || '',
              description: item.fields['System.Description'] || '',
              acceptanceCriteria:
                item.fields['Microsoft.VSTS.Common.AcceptanceCriteria'] || '',
            };
          }
        }
      } catch (error) {
        // Suppress error if work item is not found or fails
        console.warn(
          `Exact match search for ID ${cleanQuery} failed/not found:`,
          error,
        );
      }
    }

    const escapedQuery = cleanQuery.replace(/'/g, "''");
    let wiqlQuery = `Select [System.Id], [System.Title] From WorkItems Where [System.Title] Contains '${escapedQuery}'`;
    if (type) {
      const escapedType = type.replace(/'/g, "''");
      wiqlQuery += ` And [System.WorkItemType] = '${escapedType}'`;
    }
    wiqlQuery += ' Order By [System.Id] Desc';

    try {
      const queryResult = await witApi.queryByWiql({ query: wiqlQuery });
      const workItemsRefs = queryResult.workItems || [];

      let ids = workItemsRefs
        .map((wi) => wi.id)
        .filter((id): id is number => id !== undefined);

      if (exactMatch) {
        const exactIdNum = parseInt(exactMatch.id!);
        ids = ids.filter((id) => id !== exactIdNum);
      }

      // Limit to top 20 results (or 19 if we have exactMatch) for performance
      const limit = exactMatch ? 19 : 20;
      const slicedIds = ids.slice(0, limit);

      let results: TicketData[] = [];
      if (exactMatch) {
        results.push(exactMatch);
      }

      if (slicedIds.length > 0) {
        const workItems = await witApi.getWorkItems(slicedIds, [
          'System.Id',
          'System.Title',
          'System.Description',
          'Microsoft.VSTS.Common.AcceptanceCriteria',
        ]);

        const mapped = workItems.map((wi) => ({
          id: wi.id?.toString() || '',
          title: wi.fields?.['System.Title'] || '',
          description: wi.fields?.['System.Description'] || '',
          acceptanceCriteria:
            wi.fields?.['Microsoft.VSTS.Common.AcceptanceCriteria'] || '',
        }));

        results = results.concat(mapped);
      }

      return results;
    } catch (error) {
      console.error('Error searching work items:', error);
      throw error;
    }
  }

  async getWorkItemTypes(project: string): Promise<string[]> {
    const witApi = await this.getApi();
    try {
      const types = await witApi.getWorkItemTypes(project);
      return (types || [])
        .map((t) => t.name)
        .filter((name): name is string => typeof name === 'string');
    } catch (error) {
      console.error('Error fetching work item types:', error);
      throw error;
    }
  }
}
