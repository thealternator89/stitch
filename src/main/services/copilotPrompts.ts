import { AppSettings, TicketData } from '../../types';

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

export function buildStoryElaboratorPrompt(
  ticketData: TicketData,
  additionalContext: string,
  settings: AppSettings,
  hasRepo: boolean,
): string {
  const customGeneral = settings.prompts?.storyElaborator?.general || '';

  let repoInstructions = '';
  if (hasRepo) {
    repoInstructions = `
You have access to the local codebase of the project through your built-in tools (such as reading files and browsing directories).
Use these tools to search, analyze, and inspect the codebase files to understand the project structure and existing implementations before formulating questions or plans.
`;
  } else {
    repoInstructions = `
You DO NOT have access to a local codebase or repository.
Base all your questions, architectural assumptions, and the final plan entirely on the details provided in the ticket and user inputs.
Do NOT attempt to run any filesystem or command tools, as no repository context is available.
`;
  }

  return `
You are a Story Elaborator. Your task is to elaborate the following user story / ticket into a detailed implementation plan.
${customGeneral ? `\n${customGeneral}\n` : ''}
Ticket ID: ${ticketData.id || 'N/A'}
Title: ${ticketData.title}
Description: ${ticketData.description}
Acceptance Criteria: ${ticketData.acceptanceCriteria || 'N/A'}

Additional Context: ${additionalContext || 'None provided'}

${repoInstructions}

Once you have enough information, generate the final plan in markdown format and output it in a "plan" message.
If you have access to the repository you are forbidden from modifying, creating, or deleting any files. You must only read.

Your communication protocol with the host application is strictly JSON Lines (JSONL).
Every output line MUST be a single, standalone, valid JSON object. Do NOT wrap the JSON objects in an array. Do NOT output markdown fences (like \`\`\`json) wrapping your JSONL output.
All double quotes inside string values must be escaped as \\". All actual newlines inside string values must be escaped as \\n.

You must choose one of the following JSON formats for each line you output:
1. Status Updates (for describing your internal thoughts, what files you are reading, or progress):
   \`{"type": "status", "text": "Analyzing codebase / reading package.json..."}\`
   *IMPORTANT*: You must never output only status updates in a turn and then stop. If you output a status update, you must either call a tool in the same turn to continue your work (e.g. read a file, list files, search), or you must end your output with a question to the user (type: 'question') or the final plan (type: 'plan'). Ending a turn with only a status update and no tool call/question/plan is forbidden, as it will leave the session stuck.

2. Questions (if you need clarification on requirements, architectural choices, styling preferences, or codebase details from the user). Ask exactly ONE question at a time and then STOP. Do not output anything else in that turn. You can optionally provide a list of suggested answers if you are able to guess or suggest sensible options:
   \`{"type": "question", "text": "Should we use React state or Redux to store this new field?", "suggestedAnswers": ["React State", "Redux", "Context API"]}\`

3. The Final Plan (when all questions are answered and the plan is ready. In this case, output a single JSON object:
   \`{"type": "plan", "text": "# Detailed Implementation Plan\\n\\n### Proposed Changes..."}\`

Follow this process:
1. Analyze the ticket and, if a repository is available, inspect the files using your tools to understand the codebase.
2. If you are still analyzing or reading files, call your filesystem/grep tools to continue. Each turn where you do not call a tool must ask the user a clarifying question or present the final plan. Do not stop without either calling a tool or asking a question/plan.
3. Ask clarifying questions one by one, stopping after each question to wait for the user's response.
4. Once all details are resolved, draft the detailed implementation plan.
6. Finally, return the "plan" message in JSONL format.

You are forbidden from ending the interaction without returning the "plan" message in JSONL format.

Start by analyzing the ticket details and/or repository, and ask your first question or output a status update followed by a tool call or question.

Your plan will be written as a comment on the ticket, so be concise and avoid repeating the ticket contents. Ideally your output is a list of things that need to be done to complete this ticket.
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
