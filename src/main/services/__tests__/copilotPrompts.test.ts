import { describe, it, expect } from 'vitest';
import { AppSettings, TicketData } from '../../../types';
import {
  buildStoryPrompt,
  buildTestCasePrompt,
  buildStoryElaboratorPrompt,
  buildPromptComplexityCheckPrompt,
} from '../copilotPrompts';

describe('copilotPrompts', () => {
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
      expect(prompt).toContain('As a... I want to... So that...');
    });

    it('should generate story prompt with custom settings overrides', () => {
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
        'My Confluence Page',
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

    it('should generate test case prompt with custom settings overrides', () => {
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
      expect(prompt).toContain('write the final plan to a markdown file');
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
});
