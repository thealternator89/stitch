/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TestCaseWriterService } from '../testCaseWriterService';
import { buildTestCasePrompt } from '../testCaseWriterPrompts';
import { AppSettings, TicketData } from '../../../../types';

describe('TestCaseWriter feature', () => {
  const defaultSettings: AppSettings = {
    prompts: {},
  };

  describe('buildTestCasePrompt', () => {
    it('should generate test case prompt with default settings', () => {
      const prompt = buildTestCasePrompt(
        'TC-123',
        'My Ticket Title',
        'My Ticket Description',
        'AC 1, AC 2',
        'Extra Context',
        defaultSettings,
      );

      expect(prompt).toContain('TC-123');
      expect(prompt).toContain('My Ticket Title');
      expect(prompt).toContain('My Ticket Description');
      expect(prompt).toContain('AC 1, AC 2');
      expect(prompt).toContain('Extra Context');
      expect(prompt).toContain('Test Case ID (e.g., "TC01")');
    });

    it('should generate test case prompt with custom overrides', () => {
      const customSettings: AppSettings = {
        prompts: {
          testCaseWriter: {
            general: 'Custom General Test Rules',
            id: 'Custom TC ID',
            description: 'Custom TC Description',
            preConditions: 'Custom TC Preconditions',
            steps: 'Custom TC Steps',
            expectedResult: 'Custom TC Expected Result',
          },
        },
      };

      const prompt = buildTestCasePrompt(
        'TC-123',
        'My Ticket Title',
        'My Ticket Description',
        'AC 1',
        'Context',
        customSettings,
      );

      expect(prompt).toContain('Custom General Test Rules');
      expect(prompt).toContain('Custom TC ID');
      expect(prompt).toContain('Custom TC Description');
      expect(prompt).toContain('Custom TC Preconditions');
      expect(prompt).toContain('Custom TC Steps');
      expect(prompt).toContain('Custom TC Expected Result');
    });
  });

  describe('TestCaseWriterService', () => {
    let mockCopilotService: any;
    let service: TestCaseWriterService;
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
      service = new TestCaseWriterService(mockCopilotService);
    });

    it('should successfully run generateTestCases and call copilotService', async () => {
      const ticketData: TicketData = {
        id: 'TC-123',
        title: 'Story title',
        description: 'Story desc',
      };

      const result = await service.generateTestCases(
        ticketData,
        'Context',
        'gpt-4',
        defaultSettings,
      );
      expect(result).toBe('Mocked response');
      expect(mockCopilotService.createClientAndSession).toHaveBeenCalledWith(
        undefined,
        'gpt-4',
        { availableTools: [] },
      );
      expect(mockCopilotService.sendAndCollectStream).toHaveBeenCalledWith(
        mockSession,
        expect.stringContaining('TC-123'),
        undefined,
      );
      expect(mockSession.disconnect).toHaveBeenCalled();
      expect(mockClient.stop).toHaveBeenCalled();
    });
  });
});
