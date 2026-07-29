/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TShirtEstimatorService } from '../tshirtEstimatorService';
import { buildTShirtEstimatorPrompt } from '../tshirtEstimatorPrompts';
import { AppSettings } from '../../../../types';
import fs from 'fs';

describe('TShirtEstimator feature', () => {
  const defaultSettings: AppSettings = {
    prompts: {},
  };

  describe('buildTShirtEstimatorPrompt', () => {
    it('should generate estimator prompt when hasRepo is true', () => {
      const prompt = buildTShirtEstimatorPrompt(
        'Implement feature X',
        defaultSettings,
        true,
      );

      expect(prompt).toContain('Implement feature X');
      expect(prompt).toContain('You have access to the local codebase');
      expect(prompt).not.toContain(
        'You DO NOT have access to a local codebase',
      );
    });

    it('should generate estimator prompt when hasRepo is false', () => {
      const prompt = buildTShirtEstimatorPrompt(
        'Implement feature X',
        defaultSettings,
        false,
      );

      expect(prompt).toContain('You DO NOT have access to a local codebase');
      expect(prompt).not.toContain('You have access to the local codebase');
    });
  });

  describe('TShirtEstimatorService', () => {
    let mockCopilotService: any;
    let mockGitService: any;
    let service: TShirtEstimatorService;
    const mockClient = { stop: vi.fn() };
    const mockSession = { disconnect: vi.fn() };

    beforeEach(() => {
      mockCopilotService = {
        createClientAndSession: vi
          .fn()
          .mockResolvedValue({ client: mockClient, session: mockSession }),
        sendAndCollectStream: vi.fn().mockResolvedValue('Mocked response'),
        getModel: vi.fn().mockReturnValue('auto'),
      };
      mockGitService = {
        checkGitRepo: vi.fn().mockResolvedValue(false),
        getRepoRoot: vi.fn().mockResolvedValue(null),
        addWorktree: vi.fn().mockResolvedValue(undefined),
        removeWorktree: vi.fn().mockResolvedValue(undefined),
        runCommand: vi.fn().mockImplementation((path, cmd) => {
          if (cmd.includes('git rev-parse FETCH_HEAD')) {
            return Promise.resolve('mocked-fetched-sha');
          }
          return Promise.resolve('');
        }),
      };
      service = new TShirtEstimatorService(mockCopilotService, mockGitService);

      vi.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined as any);
      vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('should start estimation and return session details', async () => {
      const result = await service.startTShirtEstimation(
        'Some change description',
        null,
        'gpt-4',
        defaultSettings,
      );

      const parsed = JSON.parse(result);
      expect(parsed.sessionId).toContain('tshirt_');
      expect(parsed.result).toBe('Mocked response');

      expect(mockCopilotService.createClientAndSession).toHaveBeenCalledWith(
        undefined,
        'gpt-4',
        expect.objectContaining({
          availableTools: [],
        }),
      );
    });

    it('should create worktree when repo path and worktree settings are enabled', async () => {
      mockGitService.checkGitRepo.mockResolvedValue(true);
      mockGitService.getRepoRoot.mockResolvedValue('/root');

      const settingsWithWorktree: AppSettings = {
        gitWorktreeEnabled: true,
        gitWorktreeBaseDir: '/wt-base',
      };

      const result = await service.startTShirtEstimation(
        'Some change',
        '/root/subdir',
        'gpt-4',
        settingsWithWorktree,
      );

      const parsed = JSON.parse(result);
      expect(parsed.sessionId).toBeDefined();
      expect(mockGitService.addWorktree).toHaveBeenCalledWith(
        '/root',
        expect.stringContaining('/wt-base'),
        'mocked-fetched-sha',
      );
    });

    it('should stop estimation and clean up sessions and worktrees', async () => {
      mockGitService.checkGitRepo.mockResolvedValue(true);
      mockGitService.getRepoRoot.mockResolvedValue('/root');

      const settingsWithWorktree: AppSettings = {
        gitWorktreeEnabled: true,
        gitWorktreeBaseDir: '/wt-base',
      };

      const result = await service.startTShirtEstimation(
        'Some change',
        '/root/subdir',
        'gpt-4',
        settingsWithWorktree,
      );

      const { sessionId } = JSON.parse(result);
      await service.stopTShirtEstimation(sessionId);

      expect(mockSession.disconnect).toHaveBeenCalled();
      expect(mockClient.stop).toHaveBeenCalled();
      expect(mockGitService.removeWorktree).toHaveBeenCalled();
    });
  });
});
