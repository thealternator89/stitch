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

CRITICAL FORMATTING REQUIREMENT:
You MUST start your response with either "PASS:", "FAIL:", or no prefix at all.
- Start with "PASS:" (followed by a space and then your feedback/confirmation) if, on balance, the custom prompt statements are likely to work correctly without causing issues. Be lenient; do not fail prompts for minor style preferences or low-risk phrasing.
- Start with "FAIL:" (followed by a space and then your feedback/issues list) ONLY if there are significant, high-probability risks to the output format (such as violating the requirement to produce valid JSONL, causing unescaped quotes, or breaking JSON syntax).
- Start with NO prefix (e.g., start directly with your markdown text feedback) if you are uncertain, or if there are mild issues that do not justify a full FAIL but aren't a clean PASS. An uncertain or mild issue is better off without a prefix than an overzealous FAIL.

Example PASS response:
PASS: The custom prompt statements are clear and fully compliant.

Example FAIL response:
FAIL: The customized statements contain formatting risks.
- **general**: Avoid requesting raw newlines as it may break JSONL structures.

Keep your response brief, clear, and formatted nicely as markdown.

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
