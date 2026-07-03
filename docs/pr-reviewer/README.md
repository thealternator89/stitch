# PR Reviewer

The PR Reviewer of Stitch is a multi-phase agentic code review process.

By splitting the review into multiple phases we achieve the following benefits
over a single-phase approach;

- Targeting each review phase to specific files, greatly reducing the chance of
  hallucination and over-applied rules, allowing phases to be hyper-focused
  without risking cross-contamination of rules between phases
- Skipping review phases if no relevant files are edited in the PR, saving time
  and tokens

Because this tool runs locally, each user can configure the rules relevant to
them and get the agent to write comments in their preferred style, rather than
needing to agree global rules and a common voice for the agent to use, which is
common with hosted solutions.

## Configuration

The PR Reviewer allows you to configure automated, multi-phase code reviews. You
can set up custom code review guidelines, group them into specific review
phases, control which files they apply to, and use templates to maintain
consistency.

All configuration files for the PR Reviewer are stored locally on your machine
in the `~/.stitch/pr-reviewer` directory.

---

## Directory Structure

To configure the PR Reviewer, you should set up the following directory
structure in your home directory:

```text
~/.stitch/
└── pr-reviewer/
    ├── config.json
    ├── phases/
    │   ├── 010-definition-of-done.md
    │   ├── 020-security.md
    │   └── 030-dotnet-style.md
    └── templates/
        └── standard-header.md
```

- **`config.json`**: Global configuration file (e.g., defines the display order
  of phase groups). See [Configuration](configuration.md) for details.
- **`phases/`**: Directory containing markdown files for each review phase.
  Every `.md` file in this directory represents a distinct phase. See
  [Phases](phases.md) for details.
- **`templates/`**: Directory containing layout/template files used to wrap the
  guidelines of multiple phases. See [Templates](templates.md) for details.

---

## Next Steps

Select one of the guides below to learn how to configure the feature:

- [Writing Review Phases](phases.md)
- [Using Templates](templates.md)
- [Global Configuration and Sorting](configuration.md)
