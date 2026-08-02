import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  initializeDatabase,
  closeDatabase,
  getHistory,
  createSession,
  addLlmUsage,
  updateSessionAiOutput,
  recordPush,
  incrementPushedCommentCount,
  incrementPushedStoryCount,
  clearHistory,
} from '../databaseService';

describe('databaseService', () => {
  beforeEach(() => {
    // Initialize in-memory database for testing
    initializeDatabase(':memory:');
  });

  afterEach(() => {
    // Clean up and close connection
    closeDatabase();
  });

  it('should initialize and create tables', () => {
    const history = getHistory();
    expect(history).toBeDefined();
    expect(history).toBeInstanceOf(Array);
    expect(history.length).toBe(0);
  });

  it('should create and retrieve a session', () => {
    const sessionId = createSession(
      'PR Reviewer',
      'PR - 12345',
      '7 PR comments',
    );
    expect(sessionId).toBe(1);

    const history = getHistory();
    expect(history.length).toBe(1);
    expect(history[0].toolName).toBe('PR Reviewer');
    expect(history[0].contextReference).toBe('PR - 12345');
    expect(history[0].aiOutput).toBe('7 PR comments');
    expect(history[0].pushed).toBeNull();
    expect(history[0].timestamp).toBeGreaterThan(0);
    expect(history[0].llmUsages).toEqual([]);
  });

  it('should support adding LLM usages and retrieve them with the session', () => {
    const sessionId = createSession('Test Case Writer', 'Ticket - 999');

    addLlmUsage(
      sessionId,
      'Test Case Generation',
      'gpt-4o',
      100,
      50,
      10,
      0.0015,
      2.0,
    );

    const history = getHistory();
    expect(history.length).toBe(1);
    expect(history[0].llmUsages).toBeDefined();
    expect(history[0].llmUsages!.length).toBe(1);

    const usage = history[0].llmUsages![0];
    expect(usage.label).toBe('Test Case Generation');
    expect(usage.model).toBe('gpt-4o');
    expect(usage.inputTokens).toBe(100);
    expect(usage.outputTokens).toBe(50);
    expect(usage.cacheReadTokens).toBe(10);
    expect(usage.cost).toBe(0.0015);
    expect(usage.multiplier).toBe(2.0);
  });

  it('should support updating AI output', () => {
    const sessionId = createSession('Story Writer', 'Confluence - 555');
    updateSessionAiOutput(sessionId, '5 stories');

    const history = getHistory();
    expect(history[0].aiOutput).toBe('5 stories');
  });

  it('should support recording pushed text', () => {
    const sessionId = createSession('Story Elaborator', 'Ticket - 111');
    recordPush(sessionId, '1 comment');

    const history = getHistory();
    expect(history[0].pushed).toBe('1 comment');
  });

  it('should support incrementing pushed comment count', () => {
    const sessionId = createSession('PR Reviewer', 'PR - 5');

    incrementPushedCommentCount(sessionId);
    let history = getHistory();
    expect(history[0].pushed).toBe('1 PR comment');

    incrementPushedCommentCount(sessionId);
    history = getHistory();
    expect(history[0].pushed).toBe('2 PR comments');
  });

  it('should support incrementing pushed story count', () => {
    const sessionId = createSession('Story Writer', 'Confluence - 100');

    incrementPushedStoryCount(sessionId);
    let history = getHistory();
    expect(history[0].pushed).toBe('1 story');

    incrementPushedStoryCount(sessionId);
    history = getHistory();
    expect(history[0].pushed).toBe('2 stories');
  });

  it('should support clearing history and cascade deleting LLM usages', () => {
    const sessionId = createSession('Test Case Writer', 'Ticket - 123');
    addLlmUsage(sessionId, 'Generation', 'gpt-4o', 10, 10, 0, 0);

    expect(getHistory().length).toBe(1);

    clearHistory();
    expect(getHistory().length).toBe(0);
  });
});
