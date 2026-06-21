import { AppSettings } from '../../../types';

export function buildStoryPrompt(
  pageTitle: string,
  pageContent: string,
  additionalContext: string,
  settings: AppSettings,
): string {
  const storyWriter = settings.prompts?.storyWriter || {};
  const generalPrompt = storyWriter.general || '';

  const titlePrompt = storyWriter.title || 'The title of the story';
  const descriptionPrompt =
    storyWriter.description ||
    'Description. This should contain a statement in the format "As a... I want to... So that..." followed by 2 blank lines and then a longer description of the changes required for story.';
  const acceptanceCriteriaPrompt =
    storyWriter.acceptanceCriteria || 'Formatted as a markdown list.';
  const notesPrompt =
    storyWriter.notes ||
    'Any additional notes or assumptions (Optional, can be empty)';

  return `
        Generate a set of user stories based on the following functional requirements from a Confluence page.
        ${generalPrompt ? `\n        ${generalPrompt}\n` : ''}
        Page Title: ${pageTitle}
        Page Content: ${pageContent}
        
        Additional Context: ${additionalContext || 'None provided'}
        
        Please format the output as JSON Lines (JSONL), where each line is a valid JSON object.
        Do NOT wrap the JSON objects inside a JSON array. Each line MUST be a standalone JSON object.

        Do NOT use markdown code blocks, fences, or any formatting other than plain JSON objects. All newlines within string values must be represented as \`\\n\` (double backslash-n), not as actual newlines.
        
        Each JSON object must have exactly the following keys:
        - "title": (string) ${titlePrompt}
        - "description": (string) ${descriptionPrompt}
        - "acceptanceCriteria": (string) ${acceptanceCriteriaPrompt}
        - "notes": (string) ${notesPrompt}

        For any fields containing markdown, these MUST be formatted and escaped for JSON.

        For example:
        {"title": "Title text", "description": "First line\\\\n\\\\nSecond line", "acceptanceCriteria": "* AC 1\\\\n* AC 2\\\\n* AC 3", "notes": "First line\\\\nSecond Line\\\\nThird Line"}
        
        All double quotes inside string values must be escaped as \\".
        Do not use markdown formatting or syntax; only plain text is allowed.
        Do not use actual newlines inside string values; use \\n instead.
        Bullet points or numbers should be plain text only (e.g., "1. Step one\\n2. Step two").

        DO NOT create any files, directly output the user stories in your response here.
        DO NOT include any other text in your response (no explanation, no intro, no outro, no markdown fences).
  `;
}

export function buildPromptComplexityCheckPrompt(
  promptToCheck: string,
): string {
  return `
You are an expert AI prompt engineer and validator.
Review the following prompt template which is intended to guide an AI to generate JSON Lines (JSONL) output.
Is there anything in the instructions or fields that is likely to confuse you (or any other LLM) or cause you to violate the requirement to produce valid JSONL?
Specifically check if any of the custom descriptions might encourage code blocks, markdown fences, unescaped double quotes, or raw newlines inside JSON properties.

Avoid being unnecessarily pessimistic. If the prompt is sufficiently clear DO NOT invent potential issues.

Explain any issues detected clearly and suggest action-oriented improvements, or respond with a confirmation that the prompt template looks perfectly safe and compliant. Keep your response brief, clear, and formatted nicely as markdown.

PROMPT TEMPLATE TO REVIEW:
"""
${promptToCheck.trim()}
"""
  `;
}
