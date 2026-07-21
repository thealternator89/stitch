/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  PRReviewerService,
  extractFileContextSync,
  parseFrontmatter,
  buildPhaseReviewPrompt,
  buildCriticPrompt,
} from '../prReviewerService';

const mockCodeReviewProvider = {
  parsePRUrl: vi.fn(),
  parseRemoteUrl: vi.fn(),
  getPRDetails: vi.fn(),
  getProjectPRs: vi.fn(),
  getLinkedTickets: vi.fn(),
  postPRComment: vi.fn(),
};

const mockPowerSaveBlockerStart = vi.fn().mockReturnValue(42);
const mockPowerSaveBlockerStop = vi.fn();
const mockPowerSaveBlockerIsStarted = vi.fn().mockReturnValue(true);

vi.mock('electron', () => {
  return {
    powerSaveBlocker: {
      start: (type: string) => mockPowerSaveBlockerStart(type),
      stop: (id: number) => mockPowerSaveBlockerStop(id),
      isStarted: (id: number) => mockPowerSaveBlockerIsStarted(id),
    },
  };
});

describe('PRReviewerService', () => {
  let prReviewerService: PRReviewerService;
  let mockGitService: any;
  let mockCopilotService: any;

  beforeEach(() => {
    mockGitService = {
      checkGitRepo: vi.fn(),
      getRemoteUrl: vi.fn(),
      hasUncommittedChanges: vi.fn(),
      fetchAndCheckoutPR: vi.fn(),
      getDiffFiles: vi.fn(),
      getFileDiff: vi.fn(),
      getCurrentRef: vi.fn().mockResolvedValue('mock-original-ref'),
      restoreRef: vi.fn().mockResolvedValue(undefined),
      fetchPR: vi.fn(),
      addWorktree: vi.fn(),
      removeWorktree: vi.fn(),
    };
    mockCopilotService = {
      createClientAndSession: vi.fn(),
      sendAndCollectStream: vi.fn(),
      listModels: vi.fn().mockResolvedValue([]),
      getCachedModels: vi.fn().mockReturnValue([]),
    };
    prReviewerService = new PRReviewerService(
      mockGitService,
      mockCopilotService,
      async () => null,
      async () => null,
      async () => mockCodeReviewProvider,
    );
    vi.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined as any);
    mockCodeReviewProvider.parsePRUrl.mockReset();
    mockCodeReviewProvider.parseRemoteUrl.mockReset();
    mockCodeReviewProvider.getPRDetails.mockReset().mockResolvedValue({
      id: '123',
      title: 'Pr Title',
      description: 'Pr Description',
      sourceBranch: 'feature-x',
      targetBranch: 'main',
      author: 'John Doe',
      repositoryName: 'my-repo',
      repositoryId: 'repo-123',
      hostType: 'azure',
      url: 'https://dev.azure.com/mock-org/mock-project/_git/my-repo/pullrequest/123',
    });
    mockCodeReviewProvider.getProjectPRs.mockReset();
    mockCodeReviewProvider.getLinkedTickets.mockReset();
    mockCodeReviewProvider.postPRComment.mockReset();
    mockPowerSaveBlockerStart.mockClear().mockReturnValue(42);
    mockPowerSaveBlockerStop.mockClear();
    mockPowerSaveBlockerIsStarted.mockClear().mockReturnValue(true);
  });

  describe('getPRDetails', () => {
    const settings = {
      connectors: {
        azureDevOps: {
          org: 'conf-org',
          project: 'conf-proj',
          pat: 'conf-pat',
        },
      },
    };

    it('should fetch PR details successfully delegating to CodeReviewProvider', async () => {
      mockCodeReviewProvider.getPRDetails.mockResolvedValue({
        id: '123',
        title: 'Pr Title',
        description: 'Pr Description',
        sourceBranch: 'feature-x',
        targetBranch: 'main',
        author: 'John Doe',
        repositoryName: 'my-repo',
        hostType: 'azure',
        url: 'https://dev.azure.com/conf-org/conf-proj/_git/my-repo/pullrequest/123',
      });
      mockGitService.getRemoteUrl.mockResolvedValue(
        'https://dev.azure.com/conf-org/conf-proj/_git/my-repo',
      );

      const details = await prReviewerService.getPRDetails(
        '/mock/repo',
        '123',
        settings,
      );
      expect(details).toEqual({
        id: '123',
        title: 'Pr Title',
        description: 'Pr Description',
        sourceBranch: 'feature-x',
        targetBranch: 'main',
        author: 'John Doe',
        repositoryName: 'my-repo',
        hostType: 'azure',
        url: 'https://dev.azure.com/conf-org/conf-proj/_git/my-repo/pullrequest/123',
      });
      expect(mockCodeReviewProvider.getPRDetails).toHaveBeenCalledWith(
        '/mock/repo',
        '123',
        'https://dev.azure.com/conf-org/conf-proj/_git/my-repo',
      );
    });
  });

  describe('checkoutAndDiff', () => {
    it('should throw error if repository path is not a git repo', async () => {
      mockGitService.checkGitRepo.mockResolvedValue(false);

      await expect(
        prReviewerService.checkoutAndDiff('/mock/repo', 123),
      ).rejects.toThrow('not a valid Git repository');
    });

    it('should throw error if repository is dirty', async () => {
      mockGitService.checkGitRepo.mockResolvedValue(true);
      mockGitService.hasUncommittedChanges.mockResolvedValue(true);

      await expect(
        prReviewerService.checkoutAndDiff('/mock/repo', 123),
      ).rejects.toThrow('uncommitted changes');
    });

    it('should checkout and return commit SHA if repository is clean', async () => {
      mockGitService.checkGitRepo.mockResolvedValue(true);
      mockGitService.hasUncommittedChanges.mockResolvedValue(false);
      mockGitService.fetchAndCheckoutPR.mockResolvedValue('sha-value');

      const result = await prReviewerService.checkoutAndDiff('/mock/repo', 123);
      expect(result).toEqual({ commitSha: 'sha-value' });
    });

    it('should throw error if repository name does not match expected name', async () => {
      mockGitService.checkGitRepo.mockResolvedValue(true);
      mockGitService.getRemoteUrl.mockResolvedValue(
        'https://dev.azure.com/org/proj/_git/mismatched-repo',
      );
      mockCodeReviewProvider.parseRemoteUrl.mockReturnValue({
        org: 'org',
        project: 'proj',
        repoName: 'mismatched-repo',
      });

      await expect(
        prReviewerService.checkoutAndDiff('/mock/repo', 123, 'expected-repo'),
      ).rejects.toThrow('does not match the Pull Request repository');
    });
    it('should create a worktree if git worktree settings are enabled', async () => {
      mockGitService.checkGitRepo.mockResolvedValue(true);
      mockGitService.fetchPR.mockResolvedValue('worktree-sha');
      mockGitService.addWorktree.mockResolvedValue(undefined);
      mockGitService.removeWorktree.mockResolvedValue(undefined);
      vi.spyOn(fs, 'existsSync').mockReturnValue(false);

      const settings = {
        gitWorktreeEnabled: true,
        gitWorktreeBaseDir: '/mock/worktrees',
      };

      const result = await prReviewerService.checkoutAndDiff(
        '/mock/repo',
        123,
        'repo-name',
        settings,
      );
      expect(result).toEqual({ commitSha: 'worktree-sha' });

      expect(mockGitService.fetchPR).toHaveBeenCalledWith('/mock/repo', 123);
      expect(mockGitService.addWorktree).toHaveBeenCalledWith(
        '/mock/repo',
        expect.stringContaining('repo-name_pr_123'),
        'worktree-sha',
      );
      expect(prReviewerService.getEffectiveRepoPath('/mock/repo')).toContain(
        'repo-name_pr_123',
      );
    });
  });

  describe('getProjectPRs', () => {
    const settings = {
      connectors: {
        azureDevOps: {
          org: 'conf-org',
          project: 'conf-proj',
          pat: 'conf-pat',
        },
      },
    };

    it('should query pull requests delegating to CodeReviewProvider', async () => {
      const mockPRs = [
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
      ] as PRMetadata[];
      mockCodeReviewProvider.getProjectPRs.mockResolvedValue(mockPRs);

      const result = await prReviewerService.getProjectPRs('all', settings);
      expect(result).toEqual(mockPRs);
      expect(mockCodeReviewProvider.getProjectPRs).toHaveBeenCalledWith('all');
    });
  });

  describe('reviewPR', () => {
    const settings = {
      copilotToken: 'mock-token',
      copilotModel: 'mock-model',
    };

    beforeEach(() => {
      vi.spyOn(prReviewerService, 'loadPhasesFromDisk').mockResolvedValue([
        {
          id: '010-definition-of-done.md',
          title: 'Definition of Done',
          body: 'Review guidelines',
        },
      ]);
    });

    it('should launch copilot with repo path and stream review results', async () => {
      const mockFiles = [
        { path: 'src/index.ts', status: 'modified' },
        { path: 'src/utils.ts', status: 'added' },
      ];
      mockGitService.getDiffFiles.mockResolvedValue(mockFiles);

      const mockSession = {
        disconnect: vi.fn().mockResolvedValue(undefined),
      };
      const mockClient = {
        stop: vi.fn().mockResolvedValue(undefined),
      };
      mockCopilotService.createClientAndSession.mockResolvedValue({
        client: mockClient,
        session: mockSession,
      });
      mockCopilotService.sendAndCollectStream.mockResolvedValue(
        '{"type":"general","comment":"LGTM"}',
      );

      const onLineCallback = vi.fn();
      const result = await prReviewerService.reviewPR(
        '/mock/repo',
        'main',
        settings,
        {
          modelOverride: 'gpt-4',
          customInstructions: 'Please focus on security.',
          enabledPhaseIds: ['010-definition-of-done.md'],
          onLine: onLineCallback,
        },
      );

      expect(mockGitService.getDiffFiles).toHaveBeenCalledWith(
        '/mock/repo',
        'main',
      );
      expect(mockCopilotService.createClientAndSession).toHaveBeenCalledWith(
        'mock-token',
        'gpt-4',
        { workingDirectory: '/mock/repo' },
      );

      const expectedPrompt = buildPhaseReviewPrompt(
        mockFiles,
        'Definition of Done',
        'Review guidelines',
        'Please focus on security.',
      );
      expect(mockCopilotService.sendAndCollectStream).toHaveBeenCalledWith(
        mockSession,
        expectedPrompt,
        expect.any(Function),
      );

      expect(mockSession.disconnect).toHaveBeenCalled();
      expect(mockClient.stop).toHaveBeenCalled();
      expect(result).toEqual({
        result:
          '\n--- Phase Definition of Done Result ---\n{"type":"general","comment":"LGTM"}',
        usage: {
          inputTokens: 0,
          outputTokens: 0,
          cacheReadTokens: 0,
          cost: 0,
          phases: [
            {
              phaseTitle: 'Definition of Done',
              model: 'gpt-4',
              inputTokens: 0,
              outputTokens: 0,
              cacheReadTokens: 0,
              cost: 0,
              multiplier: 0,
            },
          ],
        },
      });
    });

    it('should cleanly stop client and session even when review throws an error', async () => {
      mockGitService.getDiffFiles.mockResolvedValue([
        { path: 'src/index.ts', status: 'modified' },
      ]);

      const mockSession = {
        disconnect: vi.fn().mockResolvedValue(undefined),
      };
      const mockClient = {
        stop: vi.fn().mockResolvedValue(undefined),
      };
      mockCopilotService.createClientAndSession.mockResolvedValue({
        client: mockClient,
        session: mockSession,
      });
      mockCopilotService.sendAndCollectStream.mockRejectedValue(
        new Error('Copilot Error'),
      );

      await expect(
        prReviewerService.reviewPR('/mock/repo', 'main', settings, {
          enabledPhaseIds: ['010-definition-of-done.md'],
        }),
      ).rejects.toThrow('Copilot Error');

      expect(mockSession.disconnect).toHaveBeenCalled();
      expect(mockClient.stop).toHaveBeenCalled();
    });

    it('should start powerSaveBlocker at the beginning and stop it at the end of review', async () => {
      mockGitService.getDiffFiles.mockResolvedValue([
        { path: 'src/index.ts', status: 'modified' },
      ]);

      const mockSession = {
        disconnect: vi.fn().mockResolvedValue(undefined),
      };
      const mockClient = {
        stop: vi.fn().mockResolvedValue(undefined),
      };
      mockCopilotService.createClientAndSession.mockResolvedValue({
        client: mockClient,
        session: mockSession,
      });
      mockCopilotService.sendAndCollectStream.mockResolvedValue(
        '{"type":"general","comment":"LGTM"}',
      );

      await prReviewerService.reviewPR('/mock/repo', 'main', settings, {
        enabledPhaseIds: ['010-definition-of-done.md'],
      });

      expect(mockPowerSaveBlockerStart).toHaveBeenCalledWith(
        'prevent-app-suspension',
      );
      expect(mockPowerSaveBlockerStop).toHaveBeenCalledWith(42);
    });

    it('should stop powerSaveBlocker even when review throws an error', async () => {
      mockGitService.getDiffFiles.mockResolvedValue([
        { path: 'src/index.ts', status: 'modified' },
      ]);

      const mockSession = {
        disconnect: vi.fn().mockResolvedValue(undefined),
      };
      const mockClient = {
        stop: vi.fn().mockResolvedValue(undefined),
      };
      mockCopilotService.createClientAndSession.mockResolvedValue({
        client: mockClient,
        session: mockSession,
      });
      mockCopilotService.sendAndCollectStream.mockRejectedValue(
        new Error('Copilot Error'),
      );

      await expect(
        prReviewerService.reviewPR('/mock/repo', 'main', settings, {
          enabledPhaseIds: ['010-definition-of-done.md'],
        }),
      ).rejects.toThrow('Copilot Error');

      expect(mockPowerSaveBlockerStart).toHaveBeenCalledWith(
        'prevent-app-suspension',
      );
      expect(mockPowerSaveBlockerStop).toHaveBeenCalledWith(42);
    });

    it('should wrap onLine callback and inject codeLines when type is line', async () => {
      mockGitService.getDiffFiles.mockResolvedValue([
        { path: 'src/index.ts', status: 'modified' },
      ]);

      const mockSession = {
        disconnect: vi.fn().mockResolvedValue(undefined),
      };
      const mockClient = {
        stop: vi.fn().mockResolvedValue(undefined),
      };
      mockCopilotService.createClientAndSession.mockResolvedValue({
        client: mockClient,
        session: mockSession,
      });

      const mockExistsSync = vi
        .spyOn(fs, 'existsSync')
        .mockImplementation((filePath: any) => {
          return !filePath.toString().endsWith('config.json');
        });
      const mockReadFileSync = vi
        .spyOn(fs, 'readFileSync')
        .mockReturnValue('const a = 1;\nconst b = 2;\nconst c = 3;');

      let capturedCallback: any;
      mockCopilotService.sendAndCollectStream.mockImplementation(
        async (
          _session: any,
          _prompt: string,
          onLine?: (line: string) => void,
        ) => {
          capturedCallback = onLine;
          return 'done';
        },
      );

      const onLineCallback = vi.fn();
      await prReviewerService.reviewPR('/mock/repo', 'main', settings, {
        onLine: onLineCallback,
        enabledPhaseIds: ['010-definition-of-done.md'],
      });

      expect(capturedCallback).toBeDefined();

      // Trigger line comment
      capturedCallback(
        '{"type":"line","file":"src/index.ts","line":2,"context":1,"comment":"Review"}',
      );

      // The wrapped callback should parse, inject codeLines, and serialize it back
      expect(onLineCallback).toHaveBeenCalledWith(
        JSON.stringify({
          type: 'line',
          file: 'src/index.ts',
          line: 2,
          context: 1,
          comment: 'Review',
          phase: 'Definition of Done',
          phaseId: '010-definition-of-done.md',
          codeLines: [
            { line: 1, text: 'const a = 1;', isTarget: false },
            { line: 2, text: 'const b = 2;', isTarget: true },
            { line: 3, text: 'const c = 3;', isTarget: false },
          ],
        }),
      );

      mockExistsSync.mockRestore();
      mockReadFileSync.mockRestore();
    });

    it('should wrap onLine callback and tag status message when type is status', async () => {
      mockGitService.getDiffFiles.mockResolvedValue([
        { path: 'src/index.ts', status: 'modified' },
      ]);

      const mockSession = {
        disconnect: vi.fn().mockResolvedValue(undefined),
      };
      const mockClient = {
        stop: vi.fn().mockResolvedValue(undefined),
      };
      mockCopilotService.createClientAndSession.mockResolvedValue({
        client: mockClient,
        session: mockSession,
      });

      let capturedCallback: any;
      mockCopilotService.sendAndCollectStream.mockImplementation(
        async (
          _session: any,
          _prompt: string,
          onLine?: (line: string) => void,
        ) => {
          capturedCallback = onLine;
          return 'done';
        },
      );

      const onLineCallback = vi.fn();
      await prReviewerService.reviewPR('/mock/repo', 'main', settings, {
        onLine: onLineCallback,
        enabledPhaseIds: ['010-definition-of-done.md'],
      });

      expect(capturedCallback).toBeDefined();

      // Trigger status comment
      capturedCallback('{"type":"status","status":"Checking index.ts"}');

      expect(onLineCallback).toHaveBeenCalledWith(
        JSON.stringify({
          type: 'status',
          status: 'Checking index.ts',
          phase: 'Definition of Done',
          phaseId: '010-definition-of-done.md',
        }),
      );
    });

    it('should throw an error if no review phases are selected', async () => {
      await expect(
        prReviewerService.reviewPR('/mock/repo', 'main', settings, {
          enabledPhaseIds: [],
        }),
      ).rejects.toThrow(
        'No review phases selected. Please select at least one phase to start the review.',
      );
    });

    it('should throw an error if no review phases are found on disk', async () => {
      vi.spyOn(prReviewerService, 'loadPhasesFromDisk').mockResolvedValue([]);
      await expect(
        prReviewerService.reviewPR('/mock/repo', 'main', settings, {
          enabledPhaseIds: ['some-phase.md'],
        }),
      ).rejects.toThrow(
        'No custom review phases found on disk. Please configure them in ~/.stitch/pr-reviewer/phases',
      );
    });

    it('should throw an error if an enabled phase has a templateError', async () => {
      vi.spyOn(prReviewerService, 'loadPhasesFromDisk').mockResolvedValue([
        {
          id: '010-templated.md',
          title: 'Templated Phase',
          body: 'My phase content',
          template: 'missing-template.md',
          templateError: 'Template file not found: missing-template.md',
        },
      ]);

      await expect(
        prReviewerService.reviewPR('/mock/repo', 'main', settings, {
          enabledPhaseIds: ['010-templated.md'],
        }),
      ).rejects.toThrow('Template file not found: missing-template.md');
    });

    it('should fetch and attach linked Azure DevOps stories, resolve doc links, and register the request_documentation tool when phase requires Story', async () => {
      const mockFiles = [{ path: 'src/index.ts', status: 'modified' }];
      mockGitService.getDiffFiles.mockResolvedValue(mockFiles);

      const mockSession = {
        disconnect: vi.fn().mockResolvedValue(undefined),
      };
      const mockClient = {
        stop: vi.fn().mockResolvedValue(undefined),
      };
      mockCopilotService.createClientAndSession.mockResolvedValue({
        client: mockClient,
        session: mockSession,
      });
      mockCopilotService.sendAndCollectStream.mockResolvedValue(
        '{"type":"general","comment":"Reviewed story"}',
      );

      const mockIssueTracker = {
        fetchTicket: vi.fn().mockResolvedValue({
          id: 'story-123',
          title: 'My Story Title',
          description:
            'Please read https://confluence.com/page/456 for details.',
          acceptanceCriteria: 'Criteria content',
        }),
      };
      const mockDocProvider = {
        isDocPageUrl: vi.fn().mockReturnValue(true),
        extractPageId: vi.fn().mockReturnValue('page-456'),
        fetchPage: vi.fn().mockResolvedValue({
          id: 'page-456',
          title: 'My Confluence Doc',
          body: 'Confluence content',
        }),
      };

      mockCodeReviewProvider.getLinkedTickets.mockResolvedValue(['story-123']);

      const customPRReviewerService = new PRReviewerService(
        mockGitService,
        mockCopilotService,
        async () => mockIssueTracker as any,
        async () => mockDocProvider as any,
        async () => mockCodeReviewProvider as any,
      );

      vi.spyOn(customPRReviewerService, 'loadPhasesFromDisk').mockResolvedValue(
        [
          {
            id: '020-story-phase.md',
            title: 'Story Phase',
            body: 'Phase body contents',
            attach: 'Story',
          },
        ],
      );

      const localSettings = {
        copilotToken: 'mock-token',
        copilotModel: 'mock-model',
        connectors: {
          azureDevOps: {
            org: 'conf-org',
            project: 'conf-proj',
            pat: 'conf-pat',
          },
        },
      };

      const onLineCallback = vi.fn();
      await customPRReviewerService.reviewPR(
        '/mock/repo',
        'main',
        localSettings,
        {
          enabledPhaseIds: ['020-story-phase.md'],
          prId: '123',
          onLine: onLineCallback,
        },
      );

      expect(mockCodeReviewProvider.getLinkedTickets).toHaveBeenCalledWith(
        '123',
        'repo-123',
      );
      expect(mockIssueTracker.fetchTicket).toHaveBeenCalledWith('story-123');

      expect(mockCopilotService.createClientAndSession).toHaveBeenCalledWith(
        'mock-token',
        undefined,
        expect.objectContaining({
          workingDirectory: '/mock/repo',
          tools: expect.any(Array),
        }),
      );

      const expectedPrompt = buildPhaseReviewPrompt(
        mockFiles,
        'Story Phase',
        'Phase body contents',
        '',
        undefined,
        'Ticket ID: story-123\nTitle: My Story Title\nDescription: Please read https://confluence.com/page/456 for details.\nAcceptance Criteria: Criteria content',
        [{ id: 'page-456', title: 'My Confluence Doc' }],
      );

      expect(mockCopilotService.sendAndCollectStream).toHaveBeenCalledWith(
        mockSession,
        expectedPrompt,
        expect.any(Function),
        expect.any(Function),
      );
    });

    it('should skip the phase if attach is Story but no stories are linked to the PR', async () => {
      const mockFiles = [{ path: 'src/index.ts', status: 'modified' }];
      mockGitService.getDiffFiles.mockResolvedValue(mockFiles);

      mockCodeReviewProvider.getLinkedTickets.mockResolvedValue([]);

      const mockIssueTracker = { fetchTicket: vi.fn() };
      const mockDocProvider = { fetchPage: vi.fn() };

      const customPRReviewerService = new PRReviewerService(
        mockGitService,
        mockCopilotService,
        async () => mockIssueTracker as any,
        async () => mockDocProvider as any,
        async () => mockCodeReviewProvider as any,
      );

      vi.spyOn(customPRReviewerService, 'loadPhasesFromDisk').mockResolvedValue(
        [
          {
            id: '020-story-phase.md',
            title: 'Story Phase',
            body: 'Phase body contents',
            attach: 'Story',
          },
        ],
      );

      const localSettings = {
        copilotToken: 'mock-token',
        copilotModel: 'mock-model',
        connectors: {
          azureDevOps: {
            org: 'conf-org',
            project: 'conf-proj',
            pat: 'conf-pat',
          },
        },
      };

      const onLineCallback = vi.fn();
      await customPRReviewerService.reviewPR(
        '/mock/repo',
        'main',
        localSettings,
        {
          enabledPhaseIds: ['020-story-phase.md'],
          prId: '123',
          onLine: onLineCallback,
        },
      );

      expect(onLineCallback).toHaveBeenCalledWith(
        JSON.stringify({
          type: 'phase-skip',
          phaseId: '020-story-phase.md',
          phaseTitle: 'Story Phase',
          reason: 'No linked stories found for this Pull Request',
        }),
      );
      expect(mockCopilotService.createClientAndSession).not.toHaveBeenCalled();
    });

    it('should use model override configured on phase rather than review-wide modelOverride', async () => {
      vi.spyOn(prReviewerService, 'loadPhasesFromDisk').mockResolvedValue([
        {
          id: '020-phase-with-model.md',
          title: 'Custom Model Phase',
          body: 'Custom model guidelines',
          model: 'gemini-2.0-flash',
        },
      ]);

      const mockFiles = [{ path: 'src/index.ts', status: 'modified' }];
      mockGitService.getDiffFiles.mockResolvedValue(mockFiles);

      const mockSession = {
        disconnect: vi.fn().mockResolvedValue(undefined),
      };
      const mockClient = {
        stop: vi.fn().mockResolvedValue(undefined),
      };
      mockCopilotService.createClientAndSession.mockResolvedValue({
        client: mockClient,
        session: mockSession,
      });
      mockCopilotService.sendAndCollectStream.mockResolvedValue(
        '{"type":"general","comment":"LGTM"}',
      );

      await prReviewerService.reviewPR('/mock/repo', 'main', settings, {
        modelOverride: 'gpt-4',
        enabledPhaseIds: ['020-phase-with-model.md'],
      });

      expect(mockCopilotService.createClientAndSession).toHaveBeenCalledWith(
        'mock-token',
        'gemini-2.0-flash',
        { workingDirectory: '/mock/repo' },
      );
    });
  });

  describe('extractFileContextSync', () => {
    it('should return null for directory traversal attempts', () => {
      const result = extractFileContextSync(
        '/mock/repo',
        '../outside.ts',
        10,
        2,
      );
      expect(result).toBeNull();
    });

    it('should return slice of file contents', () => {
      const mockExistsSync = vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      const mockReadFileSync = vi
        .spyOn(fs, 'readFileSync')
        .mockReturnValue('line1\nline2\nline3\nline4\nline5');

      const result = extractFileContextSync('/mock/repo', 'src/index.ts', 3, 1);
      expect(result).toEqual([
        { line: 2, text: 'line2', isTarget: false },
        { line: 3, text: 'line3', isTarget: true },
        { line: 4, text: 'line4', isTarget: false },
      ]);

      mockExistsSync.mockRestore();
      mockReadFileSync.mockRestore();
    });

    it('should handle boundaries gracefully', () => {
      const mockExistsSync = vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      const mockReadFileSync = vi
        .spyOn(fs, 'readFileSync')
        .mockReturnValue('line1\nline2');

      const result = extractFileContextSync('/mock/repo', 'src/index.ts', 1, 5);
      expect(result).toEqual([
        { line: 1, text: 'line1', isTarget: true },
        { line: 2, text: 'line2', isTarget: false },
      ]);

      mockExistsSync.mockRestore();
      mockReadFileSync.mockRestore();
    });
  });

  describe('postPRComment', () => {
    const settings = {
      connectors: {
        azureDevOps: {
          org: 'mock-org',
          project: 'mock-project',
          pat: 'mock-token',
        },
      },
      promptComplexity: 'normal',
    };

    it('should successfully post a comment delegating to CodeReviewProvider', async () => {
      mockCodeReviewProvider.postPRComment.mockResolvedValue(undefined);
      mockGitService.getRemoteUrl.mockResolvedValue(
        'https://dev.azure.com/mock-org/mock-project/_git/my-repo',
      );

      const comment = {
        type: 'general' as const,
        comment: 'This is a general comment',
      };

      await prReviewerService.postPRComment(
        '/mock/repo',
        '123',
        comment,
        settings,
      );

      expect(mockCodeReviewProvider.postPRComment).toHaveBeenCalledWith(
        '/mock/repo',
        '123',
        comment,
        'https://dev.azure.com/mock-org/mock-project/_git/my-repo',
      );
    });
  });

  describe('parseFrontmatter', () => {
    it('should parse valid frontmatter and extract body', () => {
      const content =
        '---\ntitle: test-phase\ngroup: dotnet\ninclude: "**/*.cs"\n---\nbody-content';
      const result = parseFrontmatter(content);
      expect(result).toEqual({
        frontmatter: {
          title: 'test-phase',
          group: 'dotnet',
          include: '**/*.cs',
        },
        body: 'body-content',
      });
    });

    it('should handle carriage returns and quotes in values', () => {
      const content =
        '---\r\ntitle: \'test-phase\'\r\ninclude: "**/abc/*"\r\n---\r\nbody-content-2';
      const result = parseFrontmatter(content);
      expect(result).toEqual({
        frontmatter: {
          title: 'test-phase',
          include: '**/abc/*',
        },
        body: 'body-content-2',
      });
    });

    it('should parse array format using JSON-like arrays', () => {
      const content =
        '---\ntitle: test-phase\ninclude: ["*.ts", "*.js"]\nexclude: [\'*.spec.ts\', \'*.test.ts\']\n---\nbody-content';
      const result = parseFrontmatter(content);
      expect(result).toEqual({
        frontmatter: {
          title: 'test-phase',
          include: ['*.ts', '*.js'],
          exclude: ['*.spec.ts', '*.test.ts'],
        },
        body: 'body-content',
      });
    });

    it('should parse array format using YAML lists', () => {
      const content =
        '---\ntitle: test-phase\ninclude:\n  - "*.ts"\n  - \'*.js\'\nexclude:\n  - "*.spec.ts"\n  - "*.test.ts"\n---\nbody-content';
      const result = parseFrontmatter(content);
      expect(result).toEqual({
        frontmatter: {
          title: 'test-phase',
          include: ['*.ts', '*.js'],
          exclude: ['*.spec.ts', '*.test.ts'],
        },
        body: 'body-content',
      });
    });

    it('should parse array with glob comma braces correctly', () => {
      const content =
        '---\ntitle: test-phase\ninclude: ["{a,b}.ts", "c.js"]\n---\nbody';
      const result = parseFrontmatter(content);
      expect(result).toEqual({
        frontmatter: {
          title: 'test-phase',
          include: ['{a,b}.ts', 'c.js'],
        },
        body: 'body',
      });
    });

    it('should parse empty arrays correctly', () => {
      const content = '---\ntitle: test-phase\ninclude: []\n---\nbody';
      const result = parseFrontmatter(content);
      expect(result).toEqual({
        frontmatter: {
          title: 'test-phase',
          include: [],
        },
        body: 'body',
      });
    });
  });

  describe('loadPhasesFromDisk', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('should return empty array if phases directory does not exist', async () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(false);
      const result = await prReviewerService.loadPhasesFromDisk();
      expect(result).toEqual([]);
    });

    it('should scaffold phases and templates directories if they do not exist', async () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(false);
      const mockMkdirSync = vi
        .spyOn(fs, 'mkdirSync')
        .mockImplementation(() => undefined as any);

      const result = await prReviewerService.loadPhasesFromDisk();

      expect(result).toEqual([]);
      expect(mockMkdirSync).toHaveBeenCalledTimes(2);
      const homeDir = os.homedir();
      expect(mockMkdirSync).toHaveBeenCalledWith(
        path.join(homeDir, '.stitch', 'pr-reviewer', 'phases'),
        { recursive: true },
      );
      expect(mockMkdirSync).toHaveBeenCalledWith(
        path.join(homeDir, '.stitch', 'pr-reviewer', 'templates'),
        { recursive: true },
      );
    });

    it('should load phases, assign default Ungrouped group, and sort correctly', async () => {
      vi.spyOn(fs, 'existsSync').mockImplementation((filePath: any) => {
        return !filePath.toString().endsWith('config.json');
      });
      vi.spyOn(fs, 'readdirSync').mockReturnValue([
        '030-python.md',
        '010-definition-of-done.md',
        '020-dotnet.md',
        '040-js.md',
      ] as any);

      const filesContent: Record<string, string> = {
        '010-definition-of-done.md':
          '---\ntitle: DoD\ngroup: Security\n---\nDoD body',
        '020-dotnet.md': '---\ntitle: .NET\n---\nDotnet body',
        '030-python.md':
          '---\ntitle: Python\ngroup: Security\n---\nPython body',
        '040-js.md': '---\ntitle: JS\ngroup: Analytics\n---\nJS body',
      };

      vi.spyOn(fs, 'readFileSync').mockImplementation((filePath: any) => {
        const basename = path.basename(filePath);
        return filesContent[basename] || '';
      });

      const result = await prReviewerService.loadPhasesFromDisk();

      expect(result).toHaveLength(4);

      // Verify exact order:
      // 1. Ungrouped first: '020-dotnet.md'
      // 2. Alphabetically by group: 'Analytics' ('040-js.md') then 'Security'
      // 3. Within 'Security', alphabetically by filename: '010-definition-of-done.md' then '030-python.md'
      expect(result[0].id).toBe('020-dotnet.md');
      expect(result[0].group).toBe('Ungrouped');

      expect(result[1].id).toBe('040-js.md');
      expect(result[1].group).toBe('Analytics');

      expect(result[2].id).toBe('010-definition-of-done.md');
      expect(result[2].group).toBe('Security');

      expect(result[3].id).toBe('030-python.md');
      expect(result[3].group).toBe('Security');
    });

    it('should successfully load a template and interpolate body', async () => {
      vi.spyOn(fs, 'existsSync').mockImplementation((filePath: any) => {
        return !filePath.toString().endsWith('config.json');
      });
      vi.spyOn(fs, 'readdirSync').mockReturnValue(['010-templated.md'] as any);

      vi.spyOn(fs, 'readFileSync').mockImplementation((filePath: any) => {
        const normalized = filePath.replace(/\\/g, '/');
        if (normalized.includes('pr-reviewer/phases/010-templated.md')) {
          return '---\ntitle: Templated Phase\ntemplate: my-template.md\n---\nMy phase content';
        }
        if (normalized.includes('pr-reviewer/templates/my-template.md')) {
          return 'Template header\n<%content%>\nTemplate footer';
        }
        return '';
      });

      const result = await prReviewerService.loadPhasesFromDisk();

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('010-templated.md');
      expect(result[0].title).toBe('Templated Phase');
      expect(result[0].template).toBe('my-template.md');
      expect(result[0].body).toBe(
        'Template header\nMy phase content\nTemplate footer',
      );
    });

    it('should load phase with templateError set if template file is missing', async () => {
      vi.spyOn(fs, 'existsSync').mockImplementation((filePath: any) => {
        const normalized = filePath.replace(/\\/g, '/');
        if (normalized.includes('pr-reviewer/templates/missing-template.md')) {
          return false;
        }
        if (normalized.includes('config.json')) {
          return false;
        }
        return true;
      });
      vi.spyOn(fs, 'readdirSync').mockReturnValue(['010-templated.md'] as any);

      vi.spyOn(fs, 'readFileSync').mockImplementation((filePath: any) => {
        const normalized = filePath.replace(/\\/g, '/');
        if (normalized.includes('pr-reviewer/phases/010-templated.md')) {
          return '---\ntitle: Templated Phase\ntemplate: missing-template.md\n---\nMy phase content';
        }
        return '';
      });

      const result = await prReviewerService.loadPhasesFromDisk();

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('010-templated.md');
      expect(result[0].templateError).toContain('Template file not found:');
      expect(result[0].templateError).toContain('missing-template.md');
    });

    it('should block template directory traversal and set templateError', async () => {
      vi.spyOn(fs, 'existsSync').mockImplementation((filePath: any) => {
        return !filePath.toString().endsWith('config.json');
      });
      vi.spyOn(fs, 'readdirSync').mockReturnValue(['010-templated.md'] as any);

      vi.spyOn(fs, 'readFileSync').mockImplementation((filePath: any) => {
        const normalized = filePath.replace(/\\/g, '/');
        if (normalized.includes('pr-reviewer/phases/010-templated.md')) {
          return '---\ntitle: Traversal Phase\ntemplate: ../../passwd\n---\nMy phase content';
        }
        return '';
      });

      const result = await prReviewerService.loadPhasesFromDisk();

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('010-templated.md');
      expect(result[0].templateError).toContain(
        'Directory traversal detected in template path: ../../passwd',
      );
    });

    it('should load phase with templateError set if template does not contain <%content%> placeholder', async () => {
      vi.spyOn(fs, 'existsSync').mockImplementation((filePath: any) => {
        return !filePath.toString().endsWith('config.json');
      });
      vi.spyOn(fs, 'readdirSync').mockReturnValue(['010-templated.md'] as any);

      vi.spyOn(fs, 'readFileSync').mockImplementation((filePath: any) => {
        const normalized = filePath.replace(/\\/g, '/');
        if (normalized.includes('pr-reviewer/phases/010-templated.md')) {
          return '---\ntitle: Templated Phase\ntemplate: my-template.md\n---\nMy phase content';
        }
        if (normalized.includes('pr-reviewer/templates/my-template.md')) {
          return 'Template header but no placeholder';
        }
        return '';
      });

      const result = await prReviewerService.loadPhasesFromDisk();

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('010-templated.md');
      expect(result[0].templateError).toContain(
        'Template "my-template.md" is missing the required <%content%> placeholder.',
      );
    });

    it('should sort groups according to config.json when available', async () => {
      vi.spyOn(fs, 'existsSync').mockImplementation((filePath: any) => {
        const normalized = filePath.replace(/\\/g, '/');
        if (normalized.includes('pr-reviewer/config.json')) {
          return true;
        }
        return true;
      });

      vi.spyOn(fs, 'readdirSync').mockReturnValue([
        '030-python.md',
        '010-definition-of-done.md',
        '020-dotnet.md',
        '040-js.md',
      ] as any);

      const filesContent: Record<string, string> = {
        'config.json': JSON.stringify({
          groups: ['Security', 'Analytics'],
        }),
        '010-definition-of-done.md':
          '---\ntitle: DoD\ngroup: Security\n---\nDoD body',
        '020-dotnet.md': '---\ntitle: .NET\n---\nDotnet body',
        '030-python.md':
          '---\ntitle: Python\ngroup: Security\n---\nPython body',
        '040-js.md': '---\ntitle: JS\ngroup: Analytics\n---\nJS body',
      };

      vi.spyOn(fs, 'readFileSync').mockImplementation((filePath: any) => {
        const basename = path.basename(filePath);
        return filesContent[basename] || '';
      });

      const result = await prReviewerService.loadPhasesFromDisk();

      expect(result).toHaveLength(4);

      // Verify custom sorting order:
      // 1. Ungrouped first: '020-dotnet.md'
      // 2. 'Security' ('010-definition-of-done.md', '030-python.md') - sorted first in config.json groups
      // 3. 'Analytics' ('040-js.md') - sorted second in config.json groups
      expect(result[0].id).toBe('020-dotnet.md');
      expect(result[0].group).toBe('Ungrouped');

      expect(result[1].id).toBe('010-definition-of-done.md');
      expect(result[1].group).toBe('Security');

      expect(result[2].id).toBe('030-python.md');
      expect(result[2].group).toBe('Security');

      expect(result[3].id).toBe('040-js.md');
      expect(result[3].group).toBe('Analytics');
    });

    it('should sort fallback groups (not in config.json) last and alphabetically', async () => {
      vi.spyOn(fs, 'existsSync').mockImplementation((filePath: any) => {
        const normalized = filePath.replace(/\\/g, '/');
        if (normalized.includes('pr-reviewer/config.json')) {
          return true;
        }
        return true;
      });

      vi.spyOn(fs, 'readdirSync').mockReturnValue([
        '010-definition-of-done.md',
        '020-dotnet.md',
        '030-python.md',
        '040-js.md',
        '050-perf.md',
      ] as any);

      const filesContent: Record<string, string> = {
        'config.json': JSON.stringify({
          groups: ['Analytics'],
        }),
        '010-definition-of-done.md':
          '---\ntitle: DoD\ngroup: Security\n---\nDoD body',
        '020-dotnet.md': '---\ntitle: .NET\n---\nDotnet body',
        '030-python.md':
          '---\ntitle: Python\ngroup: Security\n---\nPython body',
        '040-js.md': '---\ntitle: JS\ngroup: Analytics\n---\nJS body',
        '050-perf.md': '---\ntitle: Perf\ngroup: Performance\n---\nPerf body',
      };

      vi.spyOn(fs, 'readFileSync').mockImplementation((filePath: any) => {
        const basename = path.basename(filePath);
        return filesContent[basename] || '';
      });

      const result = await prReviewerService.loadPhasesFromDisk();

      expect(result).toHaveLength(5);

      // Verify custom/fallback sorting:
      // 1. Ungrouped first: '020-dotnet.md'
      // 2. Specified group: 'Analytics' ('040-js.md')
      // 3. Fallback groups sorted alphabetically: 'Performance' ('050-perf.md') then 'Security' ('010-definition-of-done.md', '030-python.md')
      expect(result[0].id).toBe('020-dotnet.md');
      expect(result[1].id).toBe('040-js.md');
      expect(result[2].id).toBe('050-perf.md');
      expect(result[3].id).toBe('010-definition-of-done.md');
      expect(result[4].id).toBe('030-python.md');
    });

    it('should ignore invalid config.json or missing groups and sort alphabetically', async () => {
      vi.spyOn(fs, 'existsSync').mockImplementation((filePath: any) => {
        const normalized = filePath.replace(/\\/g, '/');
        if (normalized.includes('pr-reviewer/config.json')) {
          return true;
        }
        return true;
      });

      vi.spyOn(fs, 'readdirSync').mockReturnValue([
        '030-python.md',
        '010-definition-of-done.md',
        '020-dotnet.md',
        '040-js.md',
      ] as any);

      const filesContent: Record<string, string> = {
        'config.json': 'invalid-json',
        '010-definition-of-done.md':
          '---\ntitle: DoD\ngroup: Security\n---\nDoD body',
        '020-dotnet.md': '---\ntitle: .NET\n---\nDotnet body',
        '030-python.md':
          '---\ntitle: Python\ngroup: Security\n---\nPython body',
        '040-js.md': '---\ntitle: JS\ngroup: Analytics\n---\nJS body',
      };

      vi.spyOn(fs, 'readFileSync').mockImplementation((filePath: any) => {
        const basename = path.basename(filePath);
        return filesContent[basename] || '';
      });

      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      const result = await prReviewerService.loadPhasesFromDisk();

      // Alphabetical sorting fallback:
      // 1. Ungrouped: '020-dotnet.md'
      // 2. Analytics: '040-js.md'
      // 3. Security: '010-definition-of-done.md', '030-python.md'
      expect(result[0].id).toBe('020-dotnet.md');
      expect(result[1].id).toBe('040-js.md');
      expect(result[2].id).toBe('010-definition-of-done.md');
      expect(result[3].id).toBe('030-python.md');

      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('should load phase and extract Model frontmatter if specified', async () => {
      vi.spyOn(fs, 'existsSync').mockImplementation((filePath: any) => {
        return !filePath.toString().endsWith('config.json');
      });
      vi.spyOn(fs, 'readdirSync').mockReturnValue([
        '010-model-override.md',
      ] as any);

      vi.spyOn(fs, 'readFileSync').mockImplementation(() => {
        return '---\ntitle: Model Override Phase\nmodel: gpt-4o\n---\nSome body';
      });

      const result = await prReviewerService.loadPhasesFromDisk();

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('010-model-override.md');
      expect(result[0].model).toBe('gpt-4o');
    });
  });

  describe('reviewPR multi-phase', () => {
    const settings = {
      copilotToken: 'mock-token',
      copilotModel: 'mock-model',
    };

    it('should execute review phases sequentially and filter by globs', async () => {
      const mockFiles = [
        { path: 'src/Program.cs', status: 'modified' },
        { path: 'src/index.js', status: 'added' },
      ];
      mockGitService.getDiffFiles.mockResolvedValue(mockFiles);

      const mockPhases = [
        {
          id: '010-dotnet.md',
          title: '.NET Review',
          include: '**/*.cs',
          body: 'Check dotnet code style',
        },
        {
          id: '020-js.md',
          title: 'JS Review',
          include: '**/*.js',
          body: 'Check js code style',
        },
        {
          id: '030-python.md',
          title: 'Python Review',
          include: '**/*.py',
          body: 'Check python code style',
        },
      ];
      vi.spyOn(prReviewerService, 'loadPhasesFromDisk').mockResolvedValue(
        mockPhases,
      );

      const mockSession = {
        disconnect: vi.fn().mockResolvedValue(undefined),
      };
      const mockClient = {
        stop: vi.fn().mockResolvedValue(undefined),
      };
      mockCopilotService.createClientAndSession.mockResolvedValue({
        client: mockClient,
        session: mockSession,
      });
      mockCopilotService.sendAndCollectStream.mockResolvedValue(
        '{"type":"general","comment":"Comment"}',
      );

      const onLineCallback = vi.fn();
      await prReviewerService.reviewPR('/mock/repo', 'main', settings, {
        enabledPhaseIds: ['010-dotnet.md', '020-js.md', '030-python.md'],
        onLine: onLineCallback,
      });

      expect(onLineCallback).toHaveBeenCalledWith(
        JSON.stringify({
          type: 'phase-start',
          phaseId: '010-dotnet.md',
          phaseTitle: '.NET Review',
        }),
      );

      expect(onLineCallback).toHaveBeenCalledWith(
        JSON.stringify({
          type: 'phase-start',
          phaseId: '020-js.md',
          phaseTitle: 'JS Review',
        }),
      );

      expect(onLineCallback).toHaveBeenCalledWith(
        JSON.stringify({
          type: 'phase-skip',
          phaseId: '030-python.md',
          phaseTitle: 'Python Review',
          reason: 'No matching files found',
        }),
      );

      expect(mockCopilotService.createClientAndSession).toHaveBeenCalledTimes(
        2,
      );
      expect(mockSession.disconnect).toHaveBeenCalledTimes(2);
      expect(mockClient.stop).toHaveBeenCalledTimes(2);
    });

    it('should execute review phases matching file changes using array include and exclude filters', async () => {
      const mockFiles = [
        { path: 'src/Program.cs', status: 'modified' },
        { path: 'src/index.js', status: 'added' },
        { path: 'src/main.test.ts', status: 'added' },
      ];
      mockGitService.getDiffFiles.mockResolvedValue(mockFiles);

      const mockPhases = [
        {
          id: '010-src.md',
          title: 'Source Review',
          include: ['**/*.cs', '**/*.js'],
          body: 'Check source code style',
        },
        {
          id: '020-tests.md',
          title: 'Test Review',
          include: ['**/*.test.ts', '**/*.spec.ts'],
          exclude: ['**/*.js'],
          body: 'Check test style',
        },
        {
          id: '030-ignored.md',
          title: 'Ignored Review',
          include: ['**/*.py'],
          body: 'Check python style',
        },
        {
          id: '040-excluded.md',
          title: 'Excluded Review',
          include: ['**/*.cs', '**/*.js'],
          exclude: ['**/*.cs', '**/*.js'],
          body: 'Check excluded style',
        },
      ];
      vi.spyOn(prReviewerService, 'loadPhasesFromDisk').mockResolvedValue(
        mockPhases,
      );

      const mockSession = {
        disconnect: vi.fn().mockResolvedValue(undefined),
      };
      const mockClient = {
        stop: vi.fn().mockResolvedValue(undefined),
      };
      mockCopilotService.createClientAndSession.mockResolvedValue({
        client: mockClient,
        session: mockSession,
      });
      mockCopilotService.sendAndCollectStream.mockResolvedValue(
        '{"type":"general","comment":"Comment"}',
      );

      const onLineCallback = vi.fn();
      await prReviewerService.reviewPR('/mock/repo', 'main', settings, {
        enabledPhaseIds: [
          '010-src.md',
          '020-tests.md',
          '030-ignored.md',
          '040-excluded.md',
        ],
        onLine: onLineCallback,
      });

      expect(onLineCallback).toHaveBeenCalledWith(
        JSON.stringify({
          type: 'phase-start',
          phaseId: '010-src.md',
          phaseTitle: 'Source Review',
        }),
      );

      expect(onLineCallback).toHaveBeenCalledWith(
        JSON.stringify({
          type: 'phase-start',
          phaseId: '020-tests.md',
          phaseTitle: 'Test Review',
        }),
      );

      expect(onLineCallback).toHaveBeenCalledWith(
        JSON.stringify({
          type: 'phase-skip',
          phaseId: '030-ignored.md',
          phaseTitle: 'Ignored Review',
          reason: 'No matching files found',
        }),
      );

      expect(onLineCallback).toHaveBeenCalledWith(
        JSON.stringify({
          type: 'phase-skip',
          phaseId: '040-excluded.md',
          phaseTitle: 'Excluded Review',
          reason: 'No matching files found',
        }),
      );

      expect(mockCopilotService.createClientAndSession).toHaveBeenCalledTimes(
        2,
      );
      expect(mockSession.disconnect).toHaveBeenCalledTimes(2);
      expect(mockClient.stop).toHaveBeenCalledTimes(2);
    });

    it('should attach PR description when phase configuration requires it', async () => {
      const mockFiles = [{ path: 'src/Program.cs', status: 'modified' }];
      mockGitService.getDiffFiles.mockResolvedValue(mockFiles);

      const mockPhases = [
        {
          id: '010-dod.md',
          title: 'DoD Review',
          attach: "['description']",
          body: 'Check requirements',
        },
      ];
      vi.spyOn(prReviewerService, 'loadPhasesFromDisk').mockResolvedValue(
        mockPhases,
      );

      const mockSession = {
        disconnect: vi.fn().mockResolvedValue(undefined),
      };
      const mockClient = {
        stop: vi.fn().mockResolvedValue(undefined),
      };
      mockCopilotService.createClientAndSession.mockResolvedValue({
        client: mockClient,
        session: mockSession,
      });
      mockCopilotService.sendAndCollectStream.mockResolvedValue(
        '{"type":"general","comment":"Comment"}',
      );

      await prReviewerService.reviewPR('/mock/repo', 'main', settings, {
        enabledPhaseIds: ['010-dod.md'],
        prDescription: 'This is the description of the PR.',
        onLine: vi.fn(),
      });

      const expectedPrompt = buildPhaseReviewPrompt(
        mockFiles,
        'DoD Review',
        'Check requirements',
        '',
        'This is the description of the PR.',
      );

      expect(mockCopilotService.sendAndCollectStream).toHaveBeenCalledWith(
        mockSession,
        expectedPrompt,
        expect.any(Function),
      );
    });

    it('should fetch PR description dynamically using getPRDetails if prId is provided', async () => {
      const mockFiles = [{ path: 'src/Program.cs', status: 'modified' }];
      mockGitService.getDiffFiles.mockResolvedValue(mockFiles);

      const mockPhases = [
        {
          id: '010-dod.md',
          title: 'DoD Review',
          attach: "['description']",
          body: 'Check requirements',
        },
      ];
      vi.spyOn(prReviewerService, 'loadPhasesFromDisk').mockResolvedValue(
        mockPhases,
      );

      const getPRDetailsSpy = vi
        .spyOn(prReviewerService, 'getPRDetails')
        .mockResolvedValue({
          id: '123',
          title: 'Title',
          description: 'Dynamically fetched full description of the PR.',
          sourceBranch: 'feature',
          targetBranch: 'main',
          author: 'John Author',
          repositoryName: 'repo',
          hostType: 'azure',
        });

      const mockSession = {
        disconnect: vi.fn().mockResolvedValue(undefined),
      };
      const mockClient = {
        stop: vi.fn().mockResolvedValue(undefined),
      };
      mockCopilotService.createClientAndSession.mockResolvedValue({
        client: mockClient,
        session: mockSession,
      });
      mockCopilotService.sendAndCollectStream.mockResolvedValue(
        '{"type":"general","comment":"Comment"}',
      );

      await prReviewerService.reviewPR('/mock/repo', 'main', settings, {
        enabledPhaseIds: ['010-dod.md'],
        prId: '123',
        prDescription: 'Truncated description...',
        onLine: vi.fn(),
      });

      const expectedPrompt = buildPhaseReviewPrompt(
        mockFiles,
        'DoD Review',
        'Check requirements',
        '',
        'Dynamically fetched full description of the PR.',
      );

      expect(getPRDetailsSpy).toHaveBeenCalledWith(
        '/mock/repo',
        '123',
        settings,
      );
      expect(mockCopilotService.sendAndCollectStream).toHaveBeenCalledWith(
        mockSession,
        expectedPrompt,
        expect.any(Function),
      );
    });
  });

  describe('checkoutAndDiff with original state tracking', () => {
    beforeEach(() => {
      mockGitService.getCurrentRef = vi
        .fn()
        .mockResolvedValue('original-branch-ref');
      mockGitService.restoreRef = vi.fn().mockResolvedValue(undefined);
    });

    it('should capture original ref and check out PR', async () => {
      mockGitService.checkGitRepo.mockResolvedValue(true);
      mockGitService.hasUncommittedChanges.mockResolvedValue(false);
      mockGitService.fetchAndCheckoutPR.mockResolvedValue('pr-sha');

      const result = await prReviewerService.checkoutAndDiff('/mock/repo', 123);
      expect(result).toEqual({ commitSha: 'pr-sha' });
      expect(mockGitService.getCurrentRef).toHaveBeenCalledWith('/mock/repo');
    });

    it('should restore previous checkout first if checking out again on the same repo', async () => {
      mockGitService.checkGitRepo.mockResolvedValue(true);
      mockGitService.hasUncommittedChanges.mockResolvedValue(false);
      mockGitService.fetchAndCheckoutPR.mockResolvedValue('pr-sha');

      // First checkout
      await prReviewerService.checkoutAndDiff('/mock/repo', 123);
      expect(mockGitService.restoreRef).not.toHaveBeenCalled();

      // Second checkout on same repo
      await prReviewerService.checkoutAndDiff('/mock/repo', 456);
      expect(mockGitService.restoreRef).toHaveBeenCalledWith(
        '/mock/repo',
        'original-branch-ref',
      );
    });
  });

  describe('reviewPR with automatic restoration', () => {
    const settings = {
      copilotToken: 'mock-token',
      copilotModel: 'mock-model',
    };

    beforeEach(() => {
      mockGitService.getCurrentRef = vi
        .fn()
        .mockResolvedValue('original-branch-ref');
      mockGitService.restoreRef = vi.fn().mockResolvedValue(undefined);
      vi.spyOn(prReviewerService, 'loadPhasesFromDisk').mockResolvedValue([
        {
          id: '010-dod.md',
          title: 'DoD Review',
          body: 'Check requirements',
        },
      ]);
    });

    it('should automatically restore repository to original ref in finally block', async () => {
      mockGitService.checkGitRepo.mockResolvedValue(true);
      mockGitService.hasUncommittedChanges.mockResolvedValue(false);
      mockGitService.fetchAndCheckoutPR.mockResolvedValue('pr-sha');

      // Checkout PR (captures original-branch-ref)
      await prReviewerService.checkoutAndDiff('/mock/repo', 123);

      mockGitService.getDiffFiles.mockResolvedValue([
        { path: 'src/index.ts', status: 'modified' },
      ]);
      const mockSession = { disconnect: vi.fn().mockResolvedValue(undefined) };
      const mockClient = { stop: vi.fn().mockResolvedValue(undefined) };
      mockCopilotService.createClientAndSession.mockResolvedValue({
        client: mockClient,
        session: mockSession,
      });
      mockCopilotService.sendAndCollectStream.mockResolvedValue('done');

      // Run review
      await prReviewerService.reviewPR('/mock/repo', 'main', settings, {
        enabledPhaseIds: ['010-dod.md'],
      });

      // Verify restoreRef was called with original-branch-ref
      expect(mockGitService.restoreRef).toHaveBeenCalledWith(
        '/mock/repo',
        'original-branch-ref',
      );
    });

    it('should aggregate Copilot session usage across workers and log them', async () => {
      mockGitService.checkGitRepo.mockResolvedValue(true);
      mockGitService.hasUncommittedChanges.mockResolvedValue(false);
      mockGitService.fetchAndCheckoutPR.mockResolvedValue('pr-sha');
      mockGitService.getDiffFiles.mockResolvedValue([
        { path: 'src/index.ts', status: 'modified' },
      ]);

      vi.spyOn(prReviewerService, 'loadPhasesFromDisk').mockResolvedValue([
        {
          id: '010-dod.md',
          title: 'DoD Review',
          body: 'Check requirements',
        },
        {
          id: '020-security.md',
          title: 'Security Review',
          body: 'Check vulnerabilities',
        },
      ]);

      const mockSession1 = {
        disconnect: vi.fn().mockResolvedValue(undefined),
        usage: {
          inputTokens: 100,
          outputTokens: 50,
          cacheReadTokens: 10,
          cost: 0.1,
        },
      };

      const mockSession2 = {
        disconnect: vi.fn().mockResolvedValue(undefined),
        usage: {
          inputTokens: 200,
          outputTokens: 75,
          cacheReadTokens: 20,
          cost: 0.25,
        },
      };

      const mockClient = { stop: vi.fn().mockResolvedValue(undefined) };

      let sessionCount = 0;
      mockCopilotService.createClientAndSession.mockImplementation(async () => {
        sessionCount++;
        return {
          client: mockClient,
          session: sessionCount === 1 ? mockSession1 : mockSession2,
        };
      });

      mockCopilotService.sendAndCollectStream.mockResolvedValue('done');

      // Run review
      const res = await prReviewerService.reviewPR(
        '/mock/repo',
        'main',
        settings,
        {
          enabledPhaseIds: ['010-dod.md', '020-security.md'],
          maxParallelism: 2,
        },
      );

      // Verify aggregated usage was returned correctly
      expect(res.usage).toEqual({
        inputTokens: 300,
        outputTokens: 125,
        cacheReadTokens: 30,
        cost: 0.35,
        phases: [
          {
            phaseTitle: 'DoD Review',
            model: 'Unknown',
            inputTokens: 100,
            outputTokens: 50,
            cacheReadTokens: 10,
            cost: 0.1,
            multiplier: 0.1,
          },
          {
            phaseTitle: 'Security Review',
            model: 'Unknown',
            inputTokens: 200,
            outputTokens: 75,
            cacheReadTokens: 20,
            cost: 0.25,
            multiplier: 0.25,
          },
        ],
      });

      // Verify sessions had isPrReviewer attached
      expect((mockSession1 as any).isPrReviewer).toBe(true);
      expect((mockSession2 as any).isPrReviewer).toBe(true);
    });

    it('should map model IDs to display names if available and fall back to raw ID', async () => {
      mockGitService.getDiffFiles.mockResolvedValue([
        { path: 'file.ts', status: 'modified' },
      ]);
      vi.spyOn(prReviewerService, 'loadPhasesFromDisk').mockResolvedValue([
        {
          id: '010-definition-of-done.md',
          title: 'Definition of Done',
          body: 'Review guidelines',
        },
      ]);
      mockCopilotService.getCachedModels.mockReturnValue([
        {
          id: 'claude-3.5-sonnet',
          name: 'Claude 3.5 Sonnet',
          billing: { multiplier: 1.5 },
        },
      ]);

      const mockSession = {
        disconnect: vi.fn().mockResolvedValue(undefined),
        usage: {
          inputTokens: 100,
          outputTokens: 50,
          cacheReadTokens: 10,
          cost: 1.5,
          model: 'claude-3.5-sonnet',
        },
      };

      const mockClient = { stop: vi.fn().mockResolvedValue(undefined) };
      mockCopilotService.createClientAndSession.mockResolvedValue({
        client: mockClient,
        session: mockSession,
      });

      mockCopilotService.sendAndCollectStream.mockResolvedValue('done');

      const res = await prReviewerService.reviewPR(
        '/mock/repo',
        'main',
        settings,
        {
          enabledPhaseIds: ['010-definition-of-done.md'],
        },
      );

      expect(res.usage.phases?.[0].model).toBe('Claude 3.5 Sonnet');
    });
  });

  describe('checkWorktrees', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('should return hasWorktrees false and count 0 if path does not exist', async () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(false);
      const res = await prReviewerService.checkWorktrees(
        path.resolve('/nonexistent/base'),
      );
      expect(res).toEqual({ hasWorktrees: false, worktreeCount: 0 });
    });

    it('should return count of directories found in base path', async () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
      vi.spyOn(fs, 'statSync').mockImplementation((p: any) => {
        const resolvedP = path.resolve(p);
        if (resolvedP === path.resolve('/mock/base')) {
          return { isDirectory: () => true } as any;
        }
        if (
          resolvedP === path.resolve('/mock/base/dir1') ||
          resolvedP === path.resolve('/mock/base/dir2')
        ) {
          return { isDirectory: () => true } as any;
        }
        return { isDirectory: () => false } as any;
      });
      vi.spyOn(fs, 'readdirSync').mockReturnValue([
        'dir1',
        'dir2',
        'file1',
      ] as any);

      const res = await prReviewerService.checkWorktrees(
        path.resolve('/mock/base'),
      );
      expect(res).toEqual({ hasWorktrees: true, worktreeCount: 2 });
    });
  });

  describe('cleanWorktrees', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('should successfully clean up worktrees using git service where possible and fallback to force remove', async () => {
      vi.spyOn(fs, 'existsSync').mockImplementation((p: any) => {
        const resolvedP = path.resolve(p);
        if (resolvedP === path.resolve('/mock/base')) return true;
        if (resolvedP === path.resolve('/mock/base/wt1')) return true;
        if (resolvedP === path.resolve('/mock/base/wt2')) return true;
        if (resolvedP === path.resolve('/mock/base/wt1', '.git')) return true;
        if (resolvedP === path.resolve('/mock/base/wt2', '.git')) return false;
        if (resolvedP === path.resolve('/mock/main-repo')) return true;
        return false;
      });
      vi.spyOn(fs, 'statSync').mockImplementation((p: any) => {
        const resolvedP = path.resolve(p);
        if (resolvedP === path.resolve('/mock/base'))
          return { isDirectory: () => true } as any;
        if (resolvedP === path.resolve('/mock/base/wt1'))
          return { isDirectory: () => true } as any;
        if (resolvedP === path.resolve('/mock/base/wt2'))
          return { isDirectory: () => true } as any;
        if (resolvedP === path.resolve('/mock/base/wt1', '.git'))
          return { isFile: () => true } as any;
        return { isDirectory: () => false } as any;
      });
      vi.spyOn(fs, 'readdirSync').mockReturnValue(['wt1', 'wt2'] as any);
      vi.spyOn(fs, 'readFileSync').mockImplementation((p: any) => {
        const resolvedP = path.resolve(p);
        if (resolvedP === path.resolve('/mock/base/wt1', '.git')) {
          return (
            'gitdir: ' + path.resolve('/mock/main-repo/.git/worktrees/wt1')
          );
        }
        throw new Error('Not found');
      });
      const rmSyncMock = vi
        .spyOn(fs, 'rmSync')
        .mockImplementation(() => undefined);

      const res = await prReviewerService.cleanWorktrees(
        path.resolve('/mock/base'),
      );

      expect(res).toEqual({ success: true, cleanedCount: 2, errors: [] });
      expect(mockGitService.removeWorktree).toHaveBeenCalledWith(
        path.resolve('/mock/main-repo'),
        path.resolve('/mock/base/wt1'),
      );
      expect(rmSyncMock).toHaveBeenCalledWith(path.resolve('/mock/base/wt2'), {
        recursive: true,
        force: true,
      });
    });
  });

  describe('Persona integration', () => {
    it('buildPhaseReviewPrompt should inject persona guidelines correctly into the prompt', () => {
      const prompt = buildPhaseReviewPrompt(
        [],
        'My Phase',
        'Phase Guidelines',
        'Custom instructions',
        '',
        '',
        [],
        'Focus on secure coding patterns.',
      );
      expect(prompt).toContain(
        'For this review, you must adhere to the following specific focus guidelines:',
      );
      expect(prompt).toContain(
        '- Guidelines: Focus on secure coding patterns.',
      );
    });

    it('reviewPR should fetch the selected persona guidelines and pass them to the prompt', async () => {
      const settingsWithPersonas = {
        copilotToken: 'mock-token',
        copilotModel: 'mock-model',
        prReviewer: {
          personas: [
            {
              name: 'Security Auditor',
              content: 'Focus on secure coding patterns.',
            },
          ],
        },
      };

      const mockFiles = [{ path: 'src/file.ts', status: 'modified' }];
      mockGitService.getDiffFiles.mockResolvedValueOnce(mockFiles);

      const mockPhases = [
        {
          id: 'p1',
          title: 'DoD',
          body: 'DoD rules',
          enabled: true,
        },
      ];
      vi.spyOn(prReviewerService, 'loadPhasesFromDisk').mockResolvedValueOnce(
        mockPhases,
      );

      const mockClient = { stop: vi.fn() };
      const mockSession = {
        sendAndCollectStream: vi
          .fn()
          .mockImplementation((session, prompt, onLine) => {
            onLine('{"type":"general","comment":"Ok"}');
            return Promise.resolve({
              result: 'Ok',
              usage: {
                inputTokens: 0,
                outputTokens: 0,
                cacheReadTokens: 0,
                cost: 0,
              },
            });
          }),
        disconnect: vi.fn(),
      };
      mockCopilotService.createClientAndSession.mockResolvedValueOnce({
        client: mockClient,
        session: mockSession,
      });

      await prReviewerService.reviewPR(
        '/mock/repo',
        'main',
        settingsWithPersonas,
        {
          enabledPhaseIds: ['p1'],
          persona: 'Security Auditor',
        },
      );

      const expectedPrompt = buildPhaseReviewPrompt(
        mockFiles,
        'DoD',
        'DoD rules',
        '',
        undefined,
        undefined,
        undefined,
        'Focus on secure coding patterns.',
      );

      expect(mockCopilotService.sendAndCollectStream).toHaveBeenCalledWith(
        mockSession,
        expectedPrompt,
        undefined,
      );
    });
  });

  describe('Critic Phase (buildCriticPrompt & critiqueComments)', () => {
    it('should build a formatted critic prompt with comments and PR description', () => {
      const mockComments = [
        { type: 'general' as const, comment: 'Comment 1', phase: 'Phase 1' },
        {
          type: 'line' as const,
          file: 'src/app.ts',
          line: 10,
          comment: 'Comment 2',
          phase: 'Phase 2',
        },
      ];
      const prompt = buildCriticPrompt(mockComments, 'Fix bug in auth');
      expect(prompt).toContain('Comment #1 (GENERAL)');
      expect(prompt).toContain('Comment #2 (LINE) File: src/app.ts Line: 10');
      expect(prompt).toContain('Fix bug in auth');
      expect(prompt).toContain('APPROVE');
      expect(prompt).toContain('REJECT');
      expect(prompt).toContain('EDIT');
      expect(prompt).toContain('MERGE');
    });

    it('should return empty result if no comments provided to critiqueComments', async () => {
      const result = await prReviewerService.critiqueComments([], {
        copilotModel: 'gpt-4',
      });
      expect(result.result).toEqual([]);
      expect(result.usage.inputTokens).toBe(0);
    });

    it('should process approve, edit, reject, and merge critic decisions', async () => {
      const mockComments = [
        { type: 'general' as const, comment: 'Good overall architecture' },
        {
          type: 'line' as const,
          file: 'src/main.ts',
          line: 15,
          comment: 'Typo in variable name',
        },
        {
          type: 'line' as const,
          file: 'src/main.ts',
          line: 20,
          comment: 'Out of scope suggestion',
        },
        {
          type: 'line' as const,
          file: 'src/main.ts',
          line: 25,
          comment: 'Duplicate comment A',
        },
        {
          type: 'line' as const,
          file: 'src/main.ts',
          line: 26,
          comment: 'Duplicate comment B',
        },
      ];

      const mockClient = { stop: vi.fn().mockResolvedValue(undefined) };
      const mockSession = {
        usage: {
          inputTokens: 100,
          outputTokens: 50,
          cacheReadTokens: 0,
          cost: 0.01,
          model: 'gpt-4o',
        },
        disconnect: vi.fn().mockResolvedValue(undefined),
      };

      const criticStreamOutput = [
        JSON.stringify({ action: 'approve', commentIndex: 1 }),
        JSON.stringify({
          action: 'edit',
          commentIndex: 2,
          comment: 'Typo in variable name `foo`',
        }),
        JSON.stringify({
          action: 'reject',
          commentIndex: 3,
          reason: 'Out of scope',
        }),
        JSON.stringify({
          action: 'merge',
          commentIndices: [4, 5],
          type: 'line',
          file: 'src/main.ts',
          line: 25,
          comment: 'Merged duplicate comment',
        }),
      ].join('\n');

      mockCopilotService.createClientAndSession.mockResolvedValueOnce({
        client: mockClient,
        session: mockSession,
      });
      mockCopilotService.sendAndCollectStream.mockResolvedValueOnce(
        criticStreamOutput,
      );
      mockCopilotService.getCachedModels.mockReturnValue([
        { id: 'gpt-4o', name: 'GPT-4o' },
      ]);

      const res = await prReviewerService.critiqueComments(
        mockComments,
        { copilotToken: 'test-token', copilotModel: 'gpt-4o' },
        { prDescription: 'Test PR' },
      );

      expect(res.result).toHaveLength(4);
      expect(res.result[0].status).toBe('approved');
      expect(res.result[1].status).toBe('edited');
      expect(res.result[1].comment).toBe('Typo in variable name `foo`');
      expect(res.result[2].status).toBe('rejected');
      expect(res.result[2].reason).toBe('Out of scope');
      expect(res.result[3].status).toBe('merged');
      expect(res.result[3].comment).toBe('Merged duplicate comment');
      expect(res.result[3].mergedFromIndices).toEqual([3, 4]);

      expect(res.usage.phases?.[0].phaseTitle).toBe('Critic');
    });

    it('should support modifying file and line on edit and merge', async () => {
      const mockComments = [
        {
          type: 'line' as const,
          file: 'src/old.ts',
          line: 10,
          comment: 'Poorly placed comment',
        },
        {
          type: 'line' as const,
          file: 'src/a.ts',
          line: 5,
          comment: 'Issue A',
        },
        {
          type: 'line' as const,
          file: 'src/b.ts',
          line: 8,
          comment: 'Issue B',
        },
      ];

      const mockClient = { stop: vi.fn().mockResolvedValue(undefined) };
      const mockSession = {
        usage: {
          inputTokens: 50,
          outputTokens: 20,
          cacheReadTokens: 0,
          cost: 0.005,
          model: 'gpt-4o',
        },
        disconnect: vi.fn().mockResolvedValue(undefined),
      };

      const criticStreamOutput = [
        JSON.stringify({
          action: 'edit',
          commentIndex: 1,
          comment: 'Better placed on method signature',
          file: 'src/new.ts',
          line: 42,
        }),
        JSON.stringify({
          action: 'merge',
          commentIndices: [2, 3],
          type: 'line',
          file: 'src/shared.ts',
          line: 100,
          comment: 'Combined issue placed on shared interface',
        }),
      ].join('\n');

      mockCopilotService.createClientAndSession.mockResolvedValueOnce({
        client: mockClient,
        session: mockSession,
      });
      mockCopilotService.sendAndCollectStream.mockResolvedValueOnce(
        criticStreamOutput,
      );
      mockCopilotService.getCachedModels.mockReturnValue([
        { id: 'gpt-4o', name: 'GPT-4o' },
      ]);

      const res = await prReviewerService.critiqueComments(
        mockComments,
        { copilotToken: 'test-token', copilotModel: 'gpt-4o' },
        { prDescription: 'Test PR', repoPath: '/mock/repo' },
      );

      expect(res.result).toHaveLength(2);
      expect(res.result[0].status).toBe('edited');
      expect(res.result[0].file).toBe('src/new.ts');
      expect(res.result[0].line).toBe(42);
      expect(res.result[0].comment).toBe('Better placed on method signature');

      expect(res.result[1].status).toBe('merged');
      expect(res.result[1].file).toBe('src/shared.ts');
      expect(res.result[1].line).toBe(100);
      expect(res.result[1].comment).toBe(
        'Combined issue placed on shared interface',
      );
    });

    it('should support converting line comments to general comments on edit and merge', async () => {
      const mockComments = [
        {
          type: 'line' as const,
          file: 'src/a.ts',
          line: 10,
          comment: 'Line issue A',
        },
        {
          type: 'line' as const,
          file: 'src/b.ts',
          line: 20,
          comment: 'Line issue B',
        },
        {
          type: 'line' as const,
          file: 'src/c.ts',
          line: 30,
          comment: 'Line issue C',
        },
      ];

      const mockClient = { stop: vi.fn().mockResolvedValue(undefined) };
      const mockSession = {
        usage: {
          inputTokens: 50,
          outputTokens: 20,
          cacheReadTokens: 0,
          cost: 0.005,
          model: 'gpt-4o',
        },
        disconnect: vi.fn().mockResolvedValue(undefined),
      };

      const criticStreamOutput = [
        JSON.stringify({
          action: 'edit',
          commentIndex: 1,
          type: 'general',
          comment: 'Converted to general comment for entire PR',
        }),
        JSON.stringify({
          action: 'merge',
          commentIndices: [2, 3],
          type: 'general',
          comment: 'Merged into general PR feedback',
        }),
      ].join('\n');

      mockCopilotService.createClientAndSession.mockResolvedValueOnce({
        client: mockClient,
        session: mockSession,
      });
      mockCopilotService.sendAndCollectStream.mockResolvedValueOnce(
        criticStreamOutput,
      );
      mockCopilotService.getCachedModels.mockReturnValue([
        { id: 'gpt-4o', name: 'GPT-4o' },
      ]);

      const res = await prReviewerService.critiqueComments(
        mockComments,
        { copilotToken: 'test-token', copilotModel: 'gpt-4o' },
        { prDescription: 'Test PR' },
      );

      expect(res.result).toHaveLength(2);
      expect(res.result[0].type).toBe('general');
      expect(res.result[0].file).toBeUndefined();
      expect(res.result[0].line).toBeUndefined();
      expect(res.result[0].comment).toBe(
        'Converted to general comment for entire PR',
      );

      expect(res.result[1].type).toBe('general');
      expect(res.result[1].file).toBeUndefined();
      expect(res.result[1].line).toBeUndefined();
      expect(res.result[1].comment).toBe('Merged into general PR feedback');
    });
  });
});
