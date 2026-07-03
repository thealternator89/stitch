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
      service = new StoryElaboratorService(
        mockCopilotService,
        async () => null,
      );
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
        expect.objectContaining({
          availableTools: ['custom:request_documentation'],
          tools: expect.arrayContaining([
            expect.objectContaining({
              name: 'request_documentation',
            }),
          ]),
        }),
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

  describe('StoryElaboratorService with Documentation Retrieval', () => {
    let mockCopilotService: any;
    let mockDocProvider: any;
    let service: StoryElaboratorService;
    const mockClient = { stop: vi.fn() };
    const mockSession = { disconnect: vi.fn() };

    beforeEach(() => {
      mockDocProvider = {
        isDocPageUrl: vi.fn((url) => url.includes('confluence.com')),
        extractPageId: vi.fn((url) => {
          const match = url.match(/pages\/(\d+)/);
          return match ? match[1] : null;
        }),
        fetchPage: vi.fn((id) =>
          Promise.resolve({
            id,
            title: `Doc ${id}`,
            body: `Content of Doc ${id}`,
          }),
        ),
      };

      mockCopilotService = {
        createClientAndSession: vi
          .fn()
          .mockResolvedValue({ client: mockClient, session: mockSession }),
        sendAndCollectStream: vi.fn(),
      };

      service = new StoryElaboratorService(
        mockCopilotService,
        async () => mockDocProvider,
      );
    });

    it('should find Confluence links in description/acceptance criteria, fetch metadata, and pass to prompt', async () => {
      const ticket: TicketData = {
        id: 'US-100',
        title: 'Need info from doc',
        description: 'See https://confluence.com/pages/11111 for details.',
        acceptanceCriteria: 'Must adhere to https://confluence.com/pages/22222',
      };

      mockCopilotService.sendAndCollectStream.mockResolvedValueOnce(
        JSON.stringify({ type: 'status', text: 'Elaborating...' }),
      );

      await service.startStoryElaboration(
        ticket,
        null,
        '',
        'gpt-4',
        defaultSettings,
      );

      // Verify page metadata was fetched
      expect(mockDocProvider.fetchPage).toHaveBeenCalledWith('11111');
      expect(mockDocProvider.fetchPage).toHaveBeenCalledWith('22222');

      // Verify the prompt passed to copilot contained the known docs list
      expect(mockCopilotService.sendAndCollectStream).toHaveBeenCalledWith(
        mockSession,
        expect.stringContaining('- "Doc 11111" (ID: 11111)'),
        undefined,
        expect.any(Function),
      );
    });

    it('should register request_documentation tool and fetch page content when called', async () => {
      const ticket: TicketData = {
        id: 'US-200',
        title: 'Story 200',
        description: 'No links here',
      };

      mockCopilotService.sendAndCollectStream.mockResolvedValueOnce(
        JSON.stringify({ type: 'status', text: 'Elaborating...' }),
      );

      await service.startStoryElaboration(
        ticket,
        null,
        '',
        'gpt-4',
        defaultSettings,
      );

      // Verify createClientAndSession was called with the tool
      expect(mockCopilotService.createClientAndSession).toHaveBeenCalledWith(
        undefined,
        'gpt-4',
        expect.objectContaining({
          tools: expect.arrayContaining([
            expect.objectContaining({
              name: 'request_documentation',
            }),
          ]),
        }),
      );

      // Retrieve the registered tool
      const createCallArgs =
        mockCopilotService.createClientAndSession.mock.calls[0][2];
      const tool = createCallArgs.tools.find(
        (t: any) => t.name === 'request_documentation',
      );
      expect(tool).toBeDefined();

      // Call the handler
      const result = await tool.handler({ documentId: '123' });

      expect(mockDocProvider.fetchPage).toHaveBeenCalledWith('123');
      expect(result).toContain('Title: Doc 123');
      expect(result).toContain('ID: 123');
      expect(result).toContain('Content:\nContent of Doc 123');
    });

    it('should refuse to fetch a duplicate document in request_documentation handler', async () => {
      const ticket: TicketData = {
        id: 'US-300',
        title: 'Story 300',
        description: 'No links',
      };

      mockCopilotService.sendAndCollectStream.mockResolvedValueOnce(
        JSON.stringify({ type: 'status', text: 'Elaborating...' }),
      );

      const onLineSpy = vi.fn();

      await service.startStoryElaboration(
        ticket,
        null,
        '',
        'gpt-4',
        defaultSettings,
        onLineSpy,
      );

      const createCallArgs =
        mockCopilotService.createClientAndSession.mock.calls[0][2];
      const tool = createCallArgs.tools.find(
        (t: any) => t.name === 'request_documentation',
      );

      // Fetch once
      const result1 = await tool.handler({ documentId: '999' });
      expect(result1).not.toContain('Error:');

      // Fetch again (duplicate)
      const result2 = await tool.handler({ documentId: '999' });
      expect(result2).toContain(
        'Error: Document with ID 999 has already been provided to you',
      );

      // Doc fetch only called once
      expect(mockDocProvider.fetchPage).toHaveBeenCalledTimes(1);

      // Verify status updates were streamed via onLineSpy
      expect(onLineSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          '"type":"status","text":"Agent viewed document: Doc 999"',
        ),
      );
      expect(onLineSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          '"type":"status","text":"Agent requested duplicate document ID: 999 (declined)"',
        ),
      );
    });
  });
});
