import { AppSettings } from '../../../types';

export function buildTestCasePrompt(
  ticketId: string,
  ticketTitle: string,
  ticketDescription: string,
  ticketAcceptanceCriteria: string,
  additionalContext: string,
  settings: AppSettings,
): string {
  const testCaseWriter = settings.prompts?.testCaseWriter || {};
  const generalPrompt = testCaseWriter.general || '';

  const idPrompt = testCaseWriter.id || 'Test Case ID (e.g., "TC01")';
  const descriptionPrompt =
    testCaseWriter.description || 'Brief description of the test scenario';
  const preConditionsPrompt =
    testCaseWriter.preConditions ||
    'Any preconditions required before running the test';
  const stepsPrompt =
    testCaseWriter.steps ||
    'Bullet-pointed or numbered steps to execute the test';
  const expectedResultPrompt =
    testCaseWriter.expectedResult || 'The expected result';

  return `
        Generate a set of comprehensive test cases for the following user story/ticket.
        ${generalPrompt ? `\n        ${generalPrompt}\n` : ''}
        Ticket ID: ${ticketId}
        Title: ${ticketTitle}
        Description: ${ticketDescription}
        Acceptance Criteria: ${ticketAcceptanceCriteria || 'N/A'}
        
        Additional Context: ${additionalContext || 'None provided'}
        
        Please format the output as JSON Lines (JSONL), where each line is a valid JSON object.
        Do NOT wrap the JSON objects inside a JSON array. Each line MUST be a standalone JSON object.

        Do NOT use markdown code blocks, fences, or any formatting other than plain JSON objects. All newlines within string values must be represented as \`\\n\` (double backslash-n), not as actual newlines.
        
        Each JSON object must have exactly the following keys:
        - "id": (string) ${idPrompt}
        - "description": (string) ${descriptionPrompt}
        - "preConditions": (string) ${preConditionsPrompt}
        - "steps": (string) ${stepsPrompt}
        - "expectedResult": (string) ${expectedResultPrompt}
        - "priority": (string) Priority of the test (e.g., "High", "Medium", "Low")

        For example:
        {"id": "", "description": "It works", "preConditions": "* One\\\\n* Two\\\\n* Three", "steps": "1. Step 1\\\\n2. Step 2\\\\n3. Step 3", "expectedResult": "Nothing", "priority": "High"}

        All double quotes inside string values must be escaped as \\".
        Do not use markdown formatting or syntax; only plain text is allowed.
        Do not use actual newlines inside string values; use \\n instead.
        Bullet points or numbers should be plain text only (e.g., "1. Step one\\\\n2. Step two").

        DO NOT create any files, directly output the test cases in your response here.
        DO NOT include any other text in your response (no explanation, no intro, no outro, no markdown fences).
  `;
}
