/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StoryWriterService } from '../storyWriterService';
import { buildStoryPrompt } from '../storyWriterPrompts';
import { AppSettings, DocPageData } from '../../../../types';

describe('StoryWriter feature', () => {
  const defaultSettings: AppSettings = {
    prompts: {},
  };

  describe('buildStoryPrompt', () => {
    it('should generate story prompt with default settings', () => {
      const prompt = buildStoryPrompt(
        'My Confluence Page',
        'This is the content of the page.',
        'No other context',
        defaultSettings,
      );

      expect(prompt).toContain('My Confluence Page');
      expect(prompt).toContain('This is the content of the page.');
      expect(prompt).toContain('No other context');
      expect(prompt).toContain('The title of the story');
    });

    it('should generate story prompt with custom overrides', () => {
      const customSettings: AppSettings = {
        prompts: {
          storyWriter: {
            general: 'Custom General Rules',
            title: 'Custom Title instructions',
            description: 'Custom Description instructions',
            acceptanceCriteria: 'Custom AC instructions',
            notes: 'Custom Notes instructions',
          },
        },
      };

      const prompt = buildStoryPrompt(
        'My Page',
        'Content',
        'Context',
        customSettings,
      );

      expect(prompt).toContain('Custom General Rules');
      expect(prompt).toContain('Custom Title instructions');
      expect(prompt).toContain('Custom Description instructions');
      expect(prompt).toContain('Custom AC instructions');
      expect(prompt).toContain('Custom Notes instructions');
    });
  });

  describe('StoryWriterService', () => {
    let mockCopilotService: any;
    let service: StoryWriterService;
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
      service = new StoryWriterService(mockCopilotService);
    });

    it('should successfully run generateStories and call copilotService', async () => {
      const pageData: DocPageData = {
        id: '123',
        title: 'Requirements',
        body: 'Create a login page',
      };

      const result = await service.generateStories(
        pageData,
        'Context',
        'gpt-4',
        defaultSettings,
      );
      expect(result).toEqual({
        result: 'Mocked response',
        usage: undefined,
      });
      expect(mockCopilotService.createClientAndSession).toHaveBeenCalledWith(
        undefined,
        'gpt-4',
        { availableTools: [] },
      );
      expect(mockCopilotService.sendAndCollectStream).toHaveBeenCalledWith(
        mockSession,
        expect.stringContaining('Requirements'),
        undefined,
      );
      expect(mockSession.disconnect).toHaveBeenCalled();
      expect(mockClient.stop).toHaveBeenCalled();
    });
  });
});
