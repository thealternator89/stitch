# Writing Review Phases

Review phases are individual, isolated review steps that check the PR against specific guidelines. They are represented by Markdown files (`.md`) inside the `~/.stitch/pr-reviewer/phases/` directory.

---

## File Format

Each phase file consists of a YAML frontmatter block at the top, enclosed in triple dashes (`---`), followed by the Markdown body.

Here is an example phase file (`~/.stitch/pr-reviewer/phases/010-definition-of-done.md`):

```markdown
---
title: Definition of Done
group: Quality
include: '**/*.{ts,tsx,js,jsx}'
exclude: '**/*.test.{ts,tsx}'
attach: description
template: standard-phase.md
---

Make sure all functions and components adhere to our team's core quality standards:

1. Every new component must have associated stories or test cases.
2. Ensure there are no unused imports, variables, or commented-out code.
3. Every file must export a single primary component or utility.
```

---

## Frontmatter Properties

The frontmatter properties customize how the phase is processed and displayed in Stitch:

| Property   | Type     | Description                                                                                               | Default                                      |
| :--------- | :------- | :-------------------------------------------------------------------------------------------------------- | :------------------------------------------- |
| `title`    | `string` | The display title of the review phase in the UI.                                                          | Filename (e.g., `010-definition-of-done.md`) |
| `group`    | `string` | Categorizes the phase under a group in the UI.                                                            | `"Ungrouped"`                                |
| `include`  | `string` | Glob pattern (parsed by `picomatch`) specifying which files must be in the PR diff for this phase to run. | None (runs on all files)                     |
| `exclude`  | `string` | Glob pattern specifying files that should be ignored during this phase.                                   | None                                         |
| `attach`   | `string` | Set to `description` to fetch the PR description from Azure DevOps and include it in the prompt context.  | None                                         |
| `template` | `string` | The filename of a template inside `~/.stitch/pr-reviewer/templates/` to wrap this phase's guidelines.     | None                                         |

---

## File Filtering (Include/Exclude)

Glob patterns are used to target phases to specific types of changes. This prevents the LLM from executing irrelevant review phases (e.g., running database migration rules on frontend React code).

- **`include: "**/\*.cs"`\*\*: Only run the phase if the PR has changes in C# files.
- **`exclude: "**/\*.test.ts"`\*\*: Do not include test files in the scope of changes reviewed by this phase.

If no files in the PR match the `include` glob (or if all matching files are filtered out by the `exclude` glob), the phase will be skipped entirely.

---

## Context Attachment (`attach`)

If your phase needs additional information from the pull request (such as checking if the code changes meet the PR requirements), you can configure `attach: description`.

When set, Stitch will fetch the full pull request description via the Azure DevOps API and append it to the reviewer's prompt context, allowing the LLM to compare the changes against the stated goals of the PR.

---

## The Markdown Body

The markdown body specifies the guidelines the LLM should check. Because Stitch performs multi-phase reviews, you should keep guidelines highly focused:

> [!IMPORTANT]
> Keep your guidelines narrow. Stitch instructs the LLM to ignore any issues that do not fall directly under the current phase guidelines. Doing so prevents duplicate, noisy comments from multiple phases.
