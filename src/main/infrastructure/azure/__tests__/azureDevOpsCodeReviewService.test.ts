import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AzureDevOpsCodeReviewService } from '../azureDevOpsCodeReviewService';
import {
  ATTRIBUTION_STATEMENT_GENERATED,
  ATTRIBUTION_STATEMENT_ASSISTED,
} from '../../constants';

const mockGetPullRequestById = vi.fn();
const mockGetPullRequestsByProject = vi.fn();
const mockCreateThread = vi.fn();
const mockGetPullRequestWorkItemRefs = vi.fn();
const mockGetThreads = vi.fn();
const mockCreateComment = vi.fn();
const mockUpdateThread = vi.fn();

const mockGitApi = {
  getPullRequestById: mockGetPullRequestById,
  getPullRequestsByProject: mockGetPullRequestsByProject,
  createThread: mockCreateThread,
  getPullRequestWorkItemRefs: mockGetPullRequestWorkItemRefs,
  getThreads: mockGetThreads,
  createComment: mockCreateComment,
  updateThread: mockUpdateThread,
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
        createdBy: {
          displayName: 'John Doe',
          uniqueName: 'john.doe@company.com',
        },
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
        authorUniqueName: 'john.doe@company.com',
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
          createdBy: {
            displayName: 'John Author',
            uniqueName: 'john.author@company.com',
          },
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
          authorUniqueName: 'john.author@company.com',
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
                'This is a general comment\n' + ATTRIBUTION_STATEMENT_GENERATED,
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

    it('should successfully post an assisted general comment', async () => {
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
          edited: true,
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
                'This is a general comment\n' + ATTRIBUTION_STATEMENT_ASSISTED,
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
              content: 'Fix this line\n' + ATTRIBUTION_STATEMENT_GENERATED,
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

    it('should reply to an existing thread and reactivate it when threadId is provided', async () => {
      mockGetPullRequestById.mockResolvedValue({
        repository: { id: 'mock-repo-id' },
      });
      mockCreateComment.mockResolvedValue({});
      mockUpdateThread.mockResolvedValue({});

      await service.postPRComment(
        '/mock/repo',
        '123',
        {
          type: 'line',
          file: 'src/main.ts',
          line: 10,
          comment: 'Still an issue here',
          threadId: 999,
        },
        'https://dev.azure.com/conf-org/conf-proj/_git/my-repo',
      );

      // Verify createComment was called
      expect(mockCreateComment).toHaveBeenCalledWith(
        expect.objectContaining({
          parentCommentId: 1,
          commentType: 1,
          content: expect.stringContaining('Still an issue here'),
        }),
        'mock-repo-id',
        123,
        999,
        'conf-proj',
      );

      // Verify updateThread was called to reactivate (status: 1)
      expect(mockUpdateThread).toHaveBeenCalledWith(
        { status: 1 },
        'mock-repo-id',
        123,
        999,
        'conf-proj',
      );

      // Verify createThread was NOT called
      expect(mockCreateThread).not.toHaveBeenCalled();
    });
  });

  describe('getPRCommentThreads', () => {
    it('should fetch and correctly format PR comment threads', async () => {
      mockGetPullRequestById.mockResolvedValue({
        repository: { id: 'mock-repo-id' },
      });

      mockGetThreads.mockResolvedValue([
        {
          id: 101,
          status: 1, // Active
          threadContext: null, // General comment
          comments: [
            {
              id: 1,
              author: { displayName: 'Alice' },
              content: 'Please check auth flow.',
              publishedDate: new Date('2026-10-01T10:00:00Z'),
            },
          ],
        },
        {
          id: 102,
          status: 2, // Fixed -> Resolved
          threadContext: {
            filePath: '/src/auth.ts',
            rightFileStart: { line: 20 },
            rightFileEnd: { line: 25 },
          },
          comments: [
            {
              id: 1,
              author: { displayName: 'Bob' },
              content: 'Null check needed.',
              publishedDate: new Date('2026-10-01T11:00:00Z'),
            },
          ],
        },
        {
          id: 103,
          isDeleted: true, // Should be ignored
          comments: [{ id: 1, content: 'Deleted thread' }],
        },
        {
          id: 104,
          status: 4, // Closed -> Resolved
          comments: [], // No comments, should be ignored
        },
      ]);

      const result = await service.getPRCommentThreads(
        '/mock/repo',
        '123',
        'https://dev.azure.com/conf-org/conf-proj/_git/my-repo',
      );

      expect(result).toHaveLength(2);

      // Thread 101: General comment, Active, not resolved
      expect(result[0]).toEqual({
        id: 101,
        status: 'active',
        isResolved: false,
        type: 'general',
        file: undefined,
        lineRange: undefined,
        comments: [
          {
            id: 1,
            author: 'Alice',
            content: 'Please check auth flow.',
            publishedDate: new Date('2026-10-01T10:00:00Z'),
          },
        ],
      });

      // Thread 102: Line comment, Fixed, is resolved
      expect(result[1]).toEqual({
        id: 102,
        status: 'fixed',
        isResolved: true,
        type: 'line',
        file: 'src/auth.ts',
        lineRange: {
          startLine: 20,
          endLine: 25,
        },
        comments: [
          {
            id: 1,
            author: 'Bob',
            content: 'Null check needed.',
            publishedDate: new Date('2026-10-01T11:00:00Z'),
          },
        ],
      });
    });

    it('should handle different resolution statuses (wontFix, closed, byDesign, pending, unknown)', async () => {
      mockGetPullRequestById.mockResolvedValue({
        repository: { id: 'mock-repo-id' },
      });

      mockGetThreads.mockResolvedValue([
        {
          id: 1,
          status: 3, // wontFix
          comments: [{ id: 1, content: 'test 1' }],
        },
        {
          id: 2,
          status: 4, // closed
          comments: [{ id: 1, content: 'test 2' }],
        },
        {
          id: 3,
          status: 5, // byDesign
          comments: [{ id: 1, content: 'test 3' }],
        },
        {
          id: 4,
          status: 6, // pending
          comments: [{ id: 1, content: 'test 4' }],
        },
        {
          id: 5,
          status: 0, // unknown
          comments: [{ id: 1, content: 'test 5' }],
        },
      ]);

      const result = await service.getPRCommentThreads(
        '/mock/repo',
        '123',
        'https://dev.azure.com/conf-org/conf-proj/_git/my-repo',
      );

      expect(result).toHaveLength(5);
      expect(result[0].status).toBe('wontFix');
      expect(result[0].isResolved).toBe(true);
      expect(result[1].status).toBe('closed');
      expect(result[1].isResolved).toBe(true);
      expect(result[2].status).toBe('byDesign');
      expect(result[2].isResolved).toBe(true);
      expect(result[3].status).toBe('pending');
      expect(result[3].isResolved).toBe(false);
      expect(result[4].status).toBe('unknown');
      expect(result[4].isResolved).toBe(false);
    });
  });
});
