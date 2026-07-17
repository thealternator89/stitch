import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AzureDevOpsCodeReviewService } from '../azureDevOpsCodeReviewService';
import { ATTRIBUTION_STATEMENT } from '../../constants';

const mockGetPullRequestById = vi.fn();
const mockGetPullRequestsByProject = vi.fn();
const mockCreateThread = vi.fn();
const mockGetPullRequestWorkItemRefs = vi.fn();

const mockGitApi = {
  getPullRequestById: mockGetPullRequestById,
  getPullRequestsByProject: mockGetPullRequestsByProject,
  createThread: mockCreateThread,
  getPullRequestWorkItemRefs: mockGetPullRequestWorkItemRefs,
};

const mockConnect = vi.fn().mockResolvedValue({
  authorizedUser: { id: 'mock-user-id' },
});

function mockWebApiFunction() {
  return {
    getGitApi() {
      return Promise.resolve(mockGitApi);
    },
    connect: mockConnect,
  };
}

vi.mock('azure-devops-node-api', () => {
  return {
    getPersonalAccessTokenHandler: vi.fn(() => ({})),
    WebApi: mockWebApiFunction,
  };
});

describe('AzureDevOpsCodeReviewService', () => {
  let service: AzureDevOpsCodeReviewService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new AzureDevOpsCodeReviewService(
      'conf-org',
      'conf-pat',
      'conf-proj',
    );
  });

  describe('parsePRUrl', () => {
    it('should parse valid dev.azure.com pullrequest URLs', () => {
      const result = service.parsePRUrl(
        'https://dev.azure.com/myorg/myproject/_git/myrepo/pullrequest/12345',
      );
      expect(result).toEqual({
        org: 'myorg',
        project: 'myproject',
        repoName: 'myrepo',
        prNumber: 12345,
      });
    });

    it('should parse valid visualstudio.com pullrequest URLs', () => {
      const result = service.parsePRUrl(
        'https://myorg.visualstudio.com/myproject/_git/myrepo/pullrequest/54321',
      );
      expect(result).toEqual({
        org: 'myorg',
        project: 'myproject',
        repoName: 'myrepo',
        prNumber: 54321,
      });
    });

    it('should return null for invalid URLs', () => {
      const result = service.parsePRUrl(
        'https://dev.azure.com/myorg/myproject',
      );
      expect(result).toBeNull();
    });
  });

  describe('parseRemoteUrl', () => {
    it('should parse valid HTTPS remote URLs', () => {
      const result = service.parseRemoteUrl(
        'https://dev.azure.com/myorg/myproject/_git/myrepo',
      );
      expect(result).toEqual({
        org: 'myorg',
        project: 'myproject',
        repoName: 'myrepo',
      });
    });

    it('should parse valid HTTPS remote URLs with userInfo', () => {
      const result = service.parseRemoteUrl(
        'https://user@dev.azure.com/myorg/myproject/_git/myrepo',
      );
      expect(result).toEqual({
        org: 'myorg',
        project: 'myproject',
        repoName: 'myrepo',
      });
    });

    it('should parse SSH remote URLs', () => {
      const result = service.parseRemoteUrl(
        'git@ssh.dev.azure.com:v3/myorg/myproject/myrepo',
      );
      expect(result).toEqual({
        org: 'myorg',
        project: 'myproject',
        repoName: 'myrepo',
      });
    });
  });

  describe('getPRDetails', () => {
    it('should fetch PR details successfully using settings when given numeric ID and remote URL', async () => {
      mockGetPullRequestById.mockResolvedValue({
        pullRequestId: 123,
        title: 'Pr Title',
        description: 'Pr Description',
        sourceRefName: 'refs/heads/feature-x',
        targetRefName: 'refs/heads/main',
        createdBy: { displayName: 'John Doe' },
        repository: { id: 'repo-123', name: 'my-repo' },
      });

      const details = await service.getPRDetails(
        '/mock/repo',
        '123',
        'https://dev.azure.com/myorg/myproject/_git/myrepo',
      );

      expect(mockGetPullRequestById).toHaveBeenCalledWith(123);
      expect(details).toEqual({
        id: '123',
        title: 'Pr Title',
        description: 'Pr Description',
        sourceBranch: 'feature-x',
        targetBranch: 'main',
        author: 'John Doe',
        repositoryName: 'my-repo',
        repositoryId: 'repo-123',
        hostType: 'azure',
        url: 'https://dev.azure.com/conf-org/conf-proj/_git/my-repo/pullrequest/123',
      });
    });

    it('should fetch PR details successfully falling back to remote URL when settings are empty', async () => {
      const emptyService = new AzureDevOpsCodeReviewService('', 'conf-pat', '');
      mockGetPullRequestById.mockResolvedValue({
        pullRequestId: 123,
        title: 'Pr Title',
        description: 'Pr Description',
        sourceRefName: 'refs/heads/feature-x',
        targetRefName: 'refs/heads/main',
        createdBy: { displayName: 'John Doe' },
        repository: { id: 'repo-123', name: 'my-repo' },
      });

      const details = await emptyService.getPRDetails(
        '/mock/repo',
        '123',
        'https://dev.azure.com/myorg/myproject/_git/myrepo',
      );

      expect(details.url).toBe(
        'https://dev.azure.com/myorg/myproject/_git/my-repo/pullrequest/123',
      );
    });

    it('should parse URL and use its org/project when given a full URL', async () => {
      mockGetPullRequestById.mockResolvedValue({
        pullRequestId: 999,
        title: 'Url PR',
        description: 'Url Desc',
        sourceRefName: 'refs/heads/feature-url',
        targetRefName: 'refs/heads/master',
        createdBy: { displayName: 'Jane Doe' },
        repository: { name: 'myrepo' },
      });

      const details = await service.getPRDetails(
        '/mock/repo',
        'https://dev.azure.com/url-org/url-proj/_git/myrepo/pullrequest/999',
      );
      expect(details.id).toBe('999');
      expect(details.sourceBranch).toBe('feature-url');
      expect(details.targetBranch).toBe('master');
    });

    it('should throw if target branch ref is missing', async () => {
      mockGetPullRequestById.mockResolvedValue({
        pullRequestId: 123,
        title: 'Pr Title',
      });

      await expect(service.getPRDetails('/mock/repo', '123')).rejects.toThrow(
        'missing target branch ref',
      );
    });
  });

  describe('getProjectPRs', () => {
    it('should query pull requests for project and return mapped results', async () => {
      mockGetPullRequestsByProject.mockResolvedValue([
        {
          pullRequestId: 444,
          title: 'My active PR',
          description: 'PR Description',
          sourceRefName: 'refs/heads/feature-x',
          targetRefName: 'refs/heads/main',
          createdBy: { displayName: 'John Author' },
          repository: { name: 'my-repo-name' },
        },
      ]);

      const result = await service.getProjectPRs('all');
      expect(result).toEqual([
        {
          id: '444',
          title: 'My active PR',
          description: 'PR Description',
          sourceBranch: 'feature-x',
          targetBranch: 'main',
          author: 'John Author',
          repositoryName: 'my-repo-name',
          hostType: 'azure',
          url: 'https://dev.azure.com/conf-org/conf-proj/_git/my-repo-name/pullrequest/444',
        },
      ]);

      expect(mockGetPullRequestsByProject).toHaveBeenCalledWith('conf-proj', {
        status: 1,
      });
    });

    it('should filter by reviewer if searchType is assigned', async () => {
      mockConnect.mockResolvedValue({
        authorizedUser: { id: 'user-guid-123' },
      });
      mockGetPullRequestsByProject.mockResolvedValue([]);

      await service.getProjectPRs('assigned');

      expect(mockConnect).toHaveBeenCalled();
      expect(mockGetPullRequestsByProject).toHaveBeenCalledWith('conf-proj', {
        status: 1,
        reviewerId: 'user-guid-123',
      });
    });

    it('should filter by creator if searchType is created', async () => {
      mockConnect.mockResolvedValue({
        authorizedUser: { id: 'user-guid-123' },
      });
      mockGetPullRequestsByProject.mockResolvedValue([]);

      await service.getProjectPRs('created');

      expect(mockConnect).toHaveBeenCalled();
      expect(mockGetPullRequestsByProject).toHaveBeenCalledWith('conf-proj', {
        status: 1,
        creatorId: 'user-guid-123',
      });
    });
  });

  describe('getLinkedTickets', () => {
    it('should fetch linked ticket IDs', async () => {
      mockGetPullRequestWorkItemRefs.mockResolvedValue([
        { id: '1001' },
        { id: '1002' },
      ]);

      const result = await service.getLinkedTickets('123', 'repo-123');
      expect(result).toEqual(['1001', '1002']);
      expect(mockGetPullRequestWorkItemRefs).toHaveBeenCalledWith(
        'repo-123',
        123,
      );
    });

    it('should throw if repositoryId is missing', async () => {
      await expect(service.getLinkedTickets('123')).rejects.toThrow(
        'Repository ID is required',
      );
    });
  });

  describe('postPRComment', () => {
    it('should successfully post a general comment', async () => {
      mockGetPullRequestById.mockResolvedValue({
        repository: { id: 'mock-repo-id' },
      });
      mockCreateThread.mockResolvedValue({});

      await service.postPRComment(
        '/mock/repo',
        '123',
        {
          type: 'general',
          comment: 'This is a general comment',
        },
        'https://dev.azure.com/conf-org/conf-proj/_git/my-repo',
      );

      expect(mockGetPullRequestById).toHaveBeenCalledWith(123);
      expect(mockCreateThread).toHaveBeenCalledWith(
        {
          comments: [
            {
              parentCommentId: 0,
              content:
                'This is a general comment\n' +
                [ATTRIBUTION_STATEMENT].join('\n'),
              commentType: 1,
            },
          ],
          status: 1,
        },
        'mock-repo-id',
        123,
        'conf-proj',
      );
    });

    it('should successfully post a line comment with threadContext', async () => {
      mockGetPullRequestById.mockResolvedValue({
        repository: { id: 'mock-repo-id' },
      });
      mockCreateThread.mockResolvedValue({});

      await service.postPRComment(
        '/mock/repo',
        '123',
        {
          type: 'line',
          file: 'src/index.ts',
          line: 42,
          comment: 'Fix this line',
        },
        'https://dev.azure.com/conf-org/conf-proj/_git/my-repo',
      );

      expect(mockGetPullRequestById).toHaveBeenCalledWith(123);
      expect(mockCreateThread).toHaveBeenCalledWith(
        {
          comments: [
            {
              parentCommentId: 0,
              content: 'Fix this line\n' + [ATTRIBUTION_STATEMENT].join('\n'),
              commentType: 1,
            },
          ],
          status: 1,
          threadContext: {
            filePath: '/src/index.ts',
            rightFileStart: { line: 42, offset: 1 },
            rightFileEnd: { line: 43, offset: 1 },
          },
        },
        'mock-repo-id',
        123,
        'conf-proj',
      );
    });

    it('should format Windows file paths with backslashes and ensure starting forward slash when posting a line comment', async () => {
      mockGetPullRequestById.mockResolvedValue({
        repository: { id: 'mock-repo-id' },
      });
      mockCreateThread.mockResolvedValue({});

      await service.postPRComment(
        '/mock/repo',
        '123',
        {
          type: 'line',
          file: 'PartySystemApi\\src\\PartySystem.Domain\\Migrations\\20260624014055_Update-Table-OrganisationType-RemoveIdentity.cs',
          line: 10,
          comment: 'Fix this migration',
        },
        'https://dev.azure.com/conf-org/conf-proj/_git/my-repo',
      );

      expect(mockCreateThread).toHaveBeenCalledWith(
        expect.objectContaining({
          threadContext: {
            filePath:
              '/PartySystemApi/src/PartySystem.Domain/Migrations/20260624014055_Update-Table-OrganisationType-RemoveIdentity.cs',
            rightFileStart: { line: 10, offset: 1 },
            rightFileEnd: { line: 11, offset: 1 },
          },
        }),
        'mock-repo-id',
        123,
        'conf-proj',
      );
    });
  });
});
