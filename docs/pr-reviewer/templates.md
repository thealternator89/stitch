# Using Templates

Templates allow you to wrap phase-specific guidelines in a consistent set of instructions, headers, or footers. This is useful for enforcing common rules, prompt formats, or roles across multiple review phases without duplicating them in every phase file.

Templates are stored in the `~/.stitch/pr-reviewer/templates/` directory.

---

## Template Syntax

A template is a text file that must contain the literal `<%content%>` placeholder. When a phase references a template, Stitch reads the template file and replaces `<%content%>` with the markdown body of the phase.

### Example Template

Create a template at `~/.stitch/pr-reviewer/templates/standard-phase.md`:

```markdown
# Phase Instructions

You are acting as a strict quality reviewer. Please review the following code changes for compliance with our core team policies.

## Guidelines to Check

<%content%>

## Output Format

Ensure you only report clear violations. If no violations are found, do not output any comments.
```

If a phase uses this template:

```markdown
---
title: Security Check
template: standard-phase.md
---

1. Never commit secrets, API keys, or raw credentials.
2. Validate and sanitize all user-controlled input.
```

The resulting guidelines prompt sent to the LLM will be:

```markdown
# Phase Instructions

You are acting as a strict quality reviewer. Please review the following code changes for compliance with our core team policies.

## Guidelines to Check

1. Never commit secrets, API keys, or raw credentials.
2. Validate and sanitize all user-controlled input.

## Output Format

Ensure you only report clear violations. If no violations are found, do not output any comments.
```

---

## Validation and Safety Rules

To prevent issues and ensure secure execution, Stitch enforces several validation rules on templates:

1. **Required Placeholder**: A template must contain the literal `<%content%>` placeholder. If it is missing, the phase will load with a `templateError` stating:
   `Template "<templateName>" is missing the required <%content%> placeholder.`
2. **Directory Traversal Prevention**: Templates must reside strictly within the `~/.stitch/pr-reviewer/templates/` directory. Attempting to use path traversal (such as `template: ../../etc/passwd` or absolute paths) will trigger a `templateError`:
   `Directory traversal detected in template path: <templateName>`
3. **Missing Templates**: If the template file specified in the phase's frontmatter does not exist, a `templateError` is raised:
   `Template file not found: <templatePath>`

---

## Error Handling

If any phase selected for a PR review contains a `templateError`, Stitch will prevent the review from starting and throw a validation error. You must fix the template references or the template content before beginning the review.
