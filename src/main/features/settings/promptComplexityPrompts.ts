export function buildPromptComplexityCheckPrompt(
  promptToCheck: string,
  customInputs: Record<string, string>,
): string {
  const activeInputsList = Object.entries(customInputs)
    .filter(([_, val]) => typeof val === 'string' && val.trim() !== '')
    .map(([key, val]) => `[Customized Field: ${key}]\n${val.trim()}`)
    .join('\n\n');

  return `
You are an expert AI prompt engineer and validator.
Review the following complete prompt template (which is intended to guide an AI to generate JSON Lines (JSONL) output), focusing SPECIFICALLY on the user-customized statements listed at the end.

Your task is to identify if there is anything in the user-customized statements that is likely to confuse the LLM or cause it to violate the requirements specified in the overall template (such as the requirement to produce valid JSONL).

CRITICAL INSTRUCTIONS:
1. ONLY evaluate and flag issues present in the user-customized statements listed in the "USER-CUSTOMIZED STATEMENTS TO EVALUATE" section below.
2. DO NOT flag or invent issues for the fixed, default parts of the template.
3. Assess the user-customized statements in relation to the rules and structure of the overall prompt template. Specifically check if any custom inputs might encourage code blocks, markdown fences, unescaped double quotes, or raw newlines inside JSON properties.
4. Avoid being unnecessarily pessimistic. If the user-customized statements are clear and safe, DO NOT invent potential issues.

Explain any issues detected in the user-customized statements clearly and suggest action-oriented improvements, or respond with a confirmation that the prompt template looks perfectly safe and compliant. Keep your response brief, clear, and formatted nicely as markdown.

OVERALL PROMPT TEMPLATE CONTEXT:
"""
${promptToCheck.trim()}
"""

USER-CUSTOMIZED STATEMENTS TO EVALUATE:
"""
${activeInputsList || 'No custom prompt statements entered.'}
"""
  `;
}
