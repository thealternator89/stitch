# Stitch Project Rules

- **Verification after changes**: Always run the linter and the tests after making any modifications to the codebase.
  - Run the linter using `npm run lint`.
  - Run tests using `npm run test:run` (non-watch mode).
  - Ensure all checks pass before concluding a task or prompting the user for approval.
  - Exception: Documentation-only changes (such as edits to Markdown files like `README.md`, or comment-only changes that do not affect code logic) do not require running the linter or tests.

- **Committing changes**: Always commit changes using conventional commits after any change (e.g., `feat: ...`, `fix: ...`, `docs: ...`, `refactor: ...`, `chore: ...`).
  - Write a clear, concise commit message following the conventional commits format.
