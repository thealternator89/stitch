# PR Reviewer Configuration

The PR Reviewer feature in Stitch allows you to configure automated, multi-phase code reviews. You can set up custom code review guidelines, group them into specific review phases, control which files they apply to, and use templates to maintain consistency.

All configuration files for the PR Reviewer are stored locally on your machine in the `~/.stitch/pr-reviewer` directory.

---

## Directory Structure

To configure the PR Reviewer, you should set up the following directory structure in your home directory:

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

- **`config.json`**: Global configuration file (e.g., defines the display order of phase groups). See [Configuration](configuration.md) for details.
- **`phases/`**: Directory containing markdown files for each review phase. Every `.md` file in this directory represents a distinct phase. See [Phases](phases.md) for details.
- **`templates/`**: Directory containing layout/template files used to wrap the guidelines of multiple phases. See [Templates](templates.md) for details.

---

## Next Steps

Select one of the guides below to learn how to configure the feature:

- [Writing Review Phases](phases.md)
- [Using Templates](templates.md)
- [Global Configuration and Sorting](configuration.md)
