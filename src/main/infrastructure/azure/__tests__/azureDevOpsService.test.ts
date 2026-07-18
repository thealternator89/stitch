import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AzureDevOpsService } from '../azureDevOpsService';
import {
  ATTRIBUTION_STATEMENT_GENERATED,
  ATTRIBUTION_STATEMENT_ASSISTED,
} from '../../constants';

const mockWitApi = {
  getWorkItem: vi.fn(),
  updateWorkItem: vi.fn(),
  createWorkItem: vi.fn(),
  queryByWiql: vi.fn(),
  getWorkItems: vi.fn(),
  getWorkItemTypes: vi.fn(),
};

function mockWebApiFunction() {
  return {
    getWorkItemTrackingApi() {
      return Promise.resolve(mockWitApi);
    },
  };
}

vi.mock('azure-devops-node-api', () => {
  return {
    getPersonalAccessTokenHandler: vi.fn(() => ({})),
    WebApi: mockWebApiFunction,
  };
});

describe('AzureDevOpsService', () => {
  let service: AzureDevOpsService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new AzureDevOpsService('https://dev.azure.com/myorg', 'mypat123');
  });

  describe('fetchTicket', () => {
    it('should successfully fetch a work item and map fields correctly', async () => {
      mockWitApi.getWorkItem.mockResolvedValueOnce({
        id: 42,
        fields: {
          'System.Title': 'Implement User Auth',
          'System.Description': 'As a user I want to log in...',
          'Microsoft.VSTS.Common.AcceptanceCriteria': 'Must use OAuth2',
        },
      });

      const result = await service.fetchTicket('42');

      expect(mockWitApi.getWorkItem).toHaveBeenCalledWith(42);
      expect(result).toEqual({
        id: '42',
        title: 'Implement User Auth',
        description: 'As a user I want to log in...',
        acceptanceCriteria: 'Must use OAuth2',
      });
    });

    it('should throw error when work item has missing fields', async () => {
      mockWitApi.getWorkItem.mockResolvedValueOnce({
        id: undefined,
      });

      await expect(service.fetchTicket('42')).rejects.toThrow(
        'Work item not found.',
      );
    });

    it('should throw and log error when API call fails', async () => {
      const apiError = new Error('Network Error');
      mockWitApi.getWorkItem.mockRejectedValueOnce(apiError);

      await expect(service.fetchTicket('42')).rejects.toThrow('Network Error');
    });
  });

  describe('addComment', () => {
    it('should update work item with history/comment comment patches (generated)', async () => {
      mockWitApi.updateWorkItem.mockResolvedValueOnce({});

      await service.addComment('42', 'This is a test comment');

      expect(mockWitApi.updateWorkItem).toHaveBeenCalledWith(
        undefined,
        [
          {
            op: 'add',
            path: '/fields/System.History',
            value: [
              'This is a test comment',
              '',
              ATTRIBUTION_STATEMENT_GENERATED,
            ].join('\n'),
          },
          {
            op: 'add',
            path: '/multilineFieldsFormat/System.History',
            value: 'Markdown',
          },
        ],
        42,
      );
    });

    it('should update work item with history/comment comment patches (assisted)', async () => {
      mockWitApi.updateWorkItem.mockResolvedValueOnce({});

      await service.addComment('42', 'This is a test comment', {
        edited: true,
      });

      expect(mockWitApi.updateWorkItem).toHaveBeenCalledWith(
        undefined,
        [
          {
            op: 'add',
            path: '/fields/System.History',
            value: [
              'This is a test comment',
              '',
              ATTRIBUTION_STATEMENT_ASSISTED,
            ].join('\n'),
          },
          {
            op: 'add',
            path: '/multilineFieldsFormat/System.History',
            value: 'Markdown',
          },
        ],
        42,
      );
    });
  });

  describe('createTicket', () => {
    it('should fetch parent details and create a child ticket with reverse hierarchy link (generated)', async () => {
      mockWitApi.getWorkItem.mockResolvedValueOnce({
        id: 10,
        url: 'https://dev.azure.com/myorg/_apis/wit/workItems/10',
        fields: {
          'System.TeamProject': 'MyStitchProject',
        },
      });

      mockWitApi.createWorkItem.mockResolvedValueOnce({});

      await service.createTicket('Task', '10', {
        id: '',
        title: 'Write unit tests',
        description: 'Need to write unit tests for Stitch services',
        acceptanceCriteria: 'Coverage should be high',
      });

      expect(mockWitApi.getWorkItem).toHaveBeenCalledWith(10);
      expect(mockWitApi.createWorkItem).toHaveBeenCalledWith(
        undefined,
        [
          {
            op: 'add',
            path: '/fields/System.Title',
            value: 'Write unit tests',
          },
          {
            op: 'add',
            path: '/fields/System.Description',
            value: [
              'Need to write unit tests for Stitch services',
              '',
              ATTRIBUTION_STATEMENT_GENERATED,
            ].join('\n'),
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
              url: 'https://dev.azure.com/myorg/_apis/wit/workItems/10',
              attributes: { comment: 'Created via Stitch' },
            },
          },
          {
            op: 'add',
            path: '/fields/Microsoft.VSTS.Common.AcceptanceCriteria',
            value: 'Coverage should be high',
          },
          {
            op: 'add',
            path: '/multilineFieldsFormat/Microsoft.VSTS.Common.AcceptanceCriteria',
            value: 'Markdown',
          },
        ],
        'MyStitchProject',
        'Task',
      );
    });

    it('should fetch parent details and create a child ticket with reverse hierarchy link (assisted)', async () => {
      mockWitApi.getWorkItem.mockResolvedValueOnce({
        id: 10,
        url: 'https://dev.azure.com/myorg/_apis/wit/workItems/10',
        fields: {
          'System.TeamProject': 'MyStitchProject',
        },
      });

      mockWitApi.createWorkItem.mockResolvedValueOnce({});

      await service.createTicket(
        'Task',
        '10',
        {
          id: '',
          title: 'Write unit tests',
          description: 'Need to write unit tests for Stitch services',
          acceptanceCriteria: 'Coverage should be high',
        },
        { edited: true },
      );

      expect(mockWitApi.getWorkItem).toHaveBeenCalledWith(10);
      expect(mockWitApi.createWorkItem).toHaveBeenCalledWith(
        undefined,
        [
          {
            op: 'add',
            path: '/fields/System.Title',
            value: 'Write unit tests',
          },
          {
            op: 'add',
            path: '/fields/System.Description',
            value: [
              'Need to write unit tests for Stitch services',
              '',
              ATTRIBUTION_STATEMENT_ASSISTED,
            ].join('\n'),
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
              url: 'https://dev.azure.com/myorg/_apis/wit/workItems/10',
              attributes: { comment: 'Created via Stitch' },
            },
          },
          {
            op: 'add',
            path: '/fields/Microsoft.VSTS.Common.AcceptanceCriteria',
            value: 'Coverage should be high',
          },
          {
            op: 'add',
            path: '/multilineFieldsFormat/Microsoft.VSTS.Common.AcceptanceCriteria',
            value: 'Markdown',
          },
        ],
        'MyStitchProject',
        'Task',
      );
    });

    it('should throw an error if parent ticket is not found', async () => {
      mockWitApi.getWorkItem.mockResolvedValueOnce(null);

      await expect(
        service.createTicket('Task', '10', {
          id: '',
          title: 'Write unit tests',
          description: '',
        }),
      ).rejects.toThrow('Parent work item not found.');
    });
  });

  describe('searchTickets', () => {
    it('should query work items using WIQL with title match when search is a string', async () => {
      mockWitApi.queryByWiql.mockResolvedValueOnce({
        workItems: [{ id: 101 }, { id: 102 }],
      });

      mockWitApi.getWorkItems.mockResolvedValueOnce([
        {
          id: 101,
          fields: {
            'System.Title': 'Refactor user service',
            'System.Description': 'Description 101',
            'Microsoft.VSTS.Common.AcceptanceCriteria': 'Criteria 101',
          },
        },
        {
          id: 102,
          fields: {
            'System.Title': 'Implement user validation',
            'System.Description': 'Description 102',
            'Microsoft.VSTS.Common.AcceptanceCriteria': 'Criteria 102',
          },
        },
      ]);

      const result = await service.searchTickets('user');

      expect(mockWitApi.queryByWiql).toHaveBeenCalledWith({
        query:
          "Select [System.Id], [System.Title] From WorkItems Where [System.Title] Contains 'user' Order By [System.Id] Desc",
      });
      expect(mockWitApi.getWorkItems).toHaveBeenCalledWith(
        [101, 102],
        [
          'System.Id',
          'System.Title',
          'System.Description',
          'Microsoft.VSTS.Common.AcceptanceCriteria',
        ],
      );

      expect(result).toEqual([
        {
          id: '101',
          title: 'Refactor user service',
          description: 'Description 101',
          acceptanceCriteria: 'Criteria 101',
        },
        {
          id: '102',
          title: 'Implement user validation',
          description: 'Description 102',
          acceptanceCriteria: 'Criteria 102',
        },
      ]);
    });

    it('should query work items by title and ID when search is numeric', async () => {
      mockWitApi.getWorkItem.mockResolvedValueOnce({
        id: 456,
        fields: {
          'System.Title': 'Fix login bug 456',
          'System.Description': 'Description 456',
        },
      });

      mockWitApi.queryByWiql.mockResolvedValueOnce({
        workItems: [{ id: 456 }, { id: 789 }],
      });

      mockWitApi.getWorkItems.mockResolvedValueOnce([
        {
          id: 789,
          fields: {
            'System.Title': 'Another bug 456',
            'System.Description': 'Description 789',
          },
        },
      ]);

      const result = await service.searchTickets('456');

      expect(mockWitApi.getWorkItem).toHaveBeenCalledWith(456);
      expect(mockWitApi.queryByWiql).toHaveBeenCalledWith({
        query:
          "Select [System.Id], [System.Title] From WorkItems Where [System.Title] Contains '456' Order By [System.Id] Desc",
      });
      expect(mockWitApi.getWorkItems).toHaveBeenCalledWith(
        [789],
        [
          'System.Id',
          'System.Title',
          'System.Description',
          'Microsoft.VSTS.Common.AcceptanceCriteria',
        ],
      );

      expect(result).toEqual([
        {
          id: '456',
          title: 'Fix login bug 456',
          description: 'Description 456',
          acceptanceCriteria: '',
        },
        {
          id: '789',
          title: 'Another bug 456',
          description: 'Description 789',
          acceptanceCriteria: '',
        },
      ]);
    });

    it('should return empty list if queryByWiql returns no items', async () => {
      mockWitApi.queryByWiql.mockResolvedValueOnce({
        workItems: [],
      });

      const result = await service.searchTickets('something');
      expect(result).toEqual([]);
      expect(mockWitApi.getWorkItems).not.toHaveBeenCalled();
    });

    it('should query using WIQL with type filter when type is passed', async () => {
      mockWitApi.queryByWiql.mockResolvedValueOnce({
        workItems: [{ id: 111 }],
      });
      mockWitApi.getWorkItems.mockResolvedValueOnce([
        {
          id: 111,
          fields: {
            'System.Title': 'Some Feature',
            'System.Description': 'Desc',
            'Microsoft.VSTS.Common.AcceptanceCriteria': 'Criteria',
          },
        },
      ]);

      const result = await service.searchTickets('some', 'Feature');

      expect(mockWitApi.queryByWiql).toHaveBeenCalledWith({
        query:
          "Select [System.Id], [System.Title] From WorkItems Where [System.Title] Contains 'some' And [System.WorkItemType] = 'Feature' Order By [System.Id] Desc",
      });
      expect(result[0].id).toBe('111');
    });

    it('should filter exact match by work item type when type is passed', async () => {
      // 1. When type matches
      mockWitApi.getWorkItem.mockResolvedValueOnce({
        id: 456,
        fields: {
          'System.Title': 'Fix login bug 456',
          'System.Description': 'Description 456',
          'System.WorkItemType': 'Feature',
        },
      });
      mockWitApi.queryByWiql.mockResolvedValueOnce({
        workItems: [],
      });

      const resultWithMatch = await service.searchTickets('456', 'Feature');
      expect(resultWithMatch.length).toBe(1);
      expect(resultWithMatch[0].id).toBe('456');

      // 2. When type does not match
      mockWitApi.getWorkItem.mockResolvedValueOnce({
        id: 456,
        fields: {
          'System.Title': 'Fix login bug 456',
          'System.Description': 'Description 456',
          'System.WorkItemType': 'Bug',
        },
      });
      mockWitApi.queryByWiql.mockResolvedValueOnce({
        workItems: [],
      });

      const resultWithoutMatch = await service.searchTickets('456', 'Feature');
      expect(resultWithoutMatch.length).toBe(0);
    });
  });

  describe('getWorkItemTypes', () => {
    it('should retrieve work item types and map names correctly', async () => {
      mockWitApi.getWorkItemTypes.mockResolvedValueOnce([
        { name: 'Feature' },
        { name: 'Product Backlog Item' },
        { name: 'Bug' },
      ]);

      const result = await service.getWorkItemTypes('MyProject');

      expect(mockWitApi.getWorkItemTypes).toHaveBeenCalledWith('MyProject');
      expect(result).toEqual(['Feature', 'Product Backlog Item', 'Bug']);
    });

    it('should throw error when API call fails', async () => {
      const apiError = new Error('WIT API error');
      mockWitApi.getWorkItemTypes.mockRejectedValueOnce(apiError);

      await expect(service.getWorkItemTypes('MyProject')).rejects.toThrow(
        'WIT API error',
      );
    });
  });
});
