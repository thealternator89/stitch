/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PromptComplexityService } from '../promptComplexityService';
import { buildPromptComplexityCheckPrompt } from '../promptComplexityPrompts';
import { AppSettings } from '../../../../types';

describe('PromptComplexity feature', () => {
  describe('buildPromptComplexityCheckPrompt', () => {
    it('should generate prompt complexity check prompt containing the prompt to check', () => {
      const testPrompt = 'This is a test prompt content';
      const prompt = buildPromptComplexityCheckPrompt(testPrompt);

      expect(prompt).toContain(
        'You are an expert AI prompt engineer and validator.',
      );
      expect(prompt).toContain('This is a test prompt content');
    });
  });

  describe('PromptComplexityService', () => {
    let mockCopilotService: any;
    let service: PromptComplexityService;
    const mockClient = { stop: vi.fn() };
    const mockSession = { disconnect: vi.fn() };

    beforeEach(() => {
      mockCopilotService = {
        createClientAndSession: vi
          .fn()
          .mockResolvedValue({ client: mockClient, session: mockSession }),
        sendAndCollectStream: vi
          .fn()
          .mockResolvedValue('Mocked complexity response'),
        getModel: vi.fn().mockReturnValue('auto'),
      };
      service = new PromptComplexityService(mockCopilotService);
    });

    it('should successfully run checkPromptComplexity for story', async () => {
      const settings: AppSettings = {
        prompts: {},
      };

      const result = await service.checkPromptComplexity('story', {}, settings);
      expect(result).toBe('Mocked complexity response');
      expect(mockCopilotService.createClientAndSession).toHaveBeenCalledWith(
        undefined,
        undefined,
        { availableTools: [], streaming: false },
      );
      expect(mockCopilotService.sendAndCollectStream).toHaveBeenCalledWith(
        mockSession,
        expect.stringContaining('Page Title Placeholder'),
      );
      expect(mockSession.disconnect).toHaveBeenCalled();
      expect(mockClient.stop).toHaveBeenCalled();
    });

    it('should successfully run checkPromptComplexity for testcase', async () => {
      const settings: AppSettings = {
        prompts: {},
      };

      const result = await service.checkPromptComplexity(
        'testcase',
        {},
        settings,
      );
      expect(result).toBe('Mocked complexity response');
      expect(mockCopilotService.createClientAndSession).toHaveBeenCalledWith(
        undefined,
        undefined,
        { availableTools: [], streaming: false },
      );
      expect(mockCopilotService.sendAndCollectStream).toHaveBeenCalledWith(
        mockSession,
        expect.stringContaining('Ticket ID Placeholder'),
      );
      expect(mockSession.disconnect).toHaveBeenCalled();
      expect(mockClient.stop).toHaveBeenCalled();
    });
  });
});
