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
