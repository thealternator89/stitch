/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StoryElaboratorService } from '../storyElaboratorService';
import { buildStoryElaboratorPrompt } from '../storyElaboratorPrompts';
import { AppSettings, TicketData } from '../../../../types';

describe('StoryElaborator feature', () => {
  const defaultSettings: AppSettings = {
    prompts: {},
  };

  describe('buildStoryElaboratorPrompt', () => {
    const ticketData: TicketData = {
      id: 'US-99',
      title: 'Implement feature X',
      description: 'We need to implement X.',
      acceptanceCriteria: 'AC 1 should pass.',
    };

    it('should generate elaborator prompt when hasRepo is true', () => {
      const prompt = buildStoryElaboratorPrompt(
        ticketData,
        'Additional context here',
        defaultSettings,
        true,
      );

      expect(prompt).toContain('US-99');
      expect(prompt).toContain('Implement feature X');
      expect(prompt).toContain('We need to implement X.');
      expect(prompt).toContain('AC 1 should pass.');
      expect(prompt).toContain('Additional context here');
      expect(prompt).toContain('You have access to the local codebase');
      expect(prompt).not.toContain(
        'You DO NOT have access to a local codebase',
      );
    });

    it('should generate elaborator prompt when hasRepo is false', () => {
      const prompt = buildStoryElaboratorPrompt(
        ticketData,
        'Additional context here',
        defaultSettings,
        false,
      );

      expect(prompt).toContain('You DO NOT have access to a local codebase');
      expect(prompt).toContain(
        'Base all your questions, architectural assumptions',
      );
      expect(prompt).not.toContain('You have access to the local codebase');
    });

    it('should include custom general guidelines in elaborator prompt', () => {
      const customSettings: AppSettings = {
        prompts: {
          storyElaborator: {
            general: 'Follow strict Clean Architecture principles.',
          },
        },
      };

      const prompt = buildStoryElaboratorPrompt(
        ticketData,
        '',
        customSettings,
        true,
      );

      expect(prompt).toContain('Follow strict Clean Architecture principles.');
    });
  });

  describe('StoryElaboratorService', () => {
    let mockCopilotService: any;
    let service: StoryElaboratorService;
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
      service = new StoryElaboratorService(mockCopilotService);
    });

    it('should start story elaboration and store session in active map', async () => {
      const ticket: TicketData = {
        id: 'US-1',
        title: 'Story 1',
        description: 'desc 1',
      };

      const result = await service.startStoryElaboration(
        ticket,
        null,
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
        expect.stringContaining('Story 1'),
        undefined,
        expect.any(Function),
      );

      // Now send an answer to the stored session
      const answerResult = await service.sendElaborationAnswer(
        'US-1',
        'My answer',
      );
      expect(answerResult).toBe('Mocked response');
      expect(mockCopilotService.sendAndCollectStream).toHaveBeenLastCalledWith(
        mockSession,
        'My answer',
        undefined,
        expect.any(Function),
      );

      // Stop story elaboration
      await service.stopStoryElaboration('US-1');
      expect(mockSession.disconnect).toHaveBeenCalled();
      expect(mockClient.stop).toHaveBeenCalled();
    });
  });
});
