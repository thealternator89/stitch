# Stitch Project Rules

- **Verification after changes**: Always run the linter and the tests after making any modifications to the codebase.
  - Run the linter using `npm run lint`.
  - Run the build using `npx tsc --noEmit`
  - Run tests using `npm run test:run` (non-watch mode).
  - Ensure all checks pass before concluding a task or prompting the user for approval.
  - Exception: Documentation-only changes (such as edits to Markdown files like `README.md`, or comment-only changes that do not affect code logic) do not require running the linter, build, or tests.

- **Committing changes**: Always commit changes using conventional commits after any change (e.g., `feat: ...`, `fix: ...`, `docs: ...`, `refactor: ...`, `chore: ...`).
  - Write a clear, concise commit message following the conventional commits format.

- **Documentation Updates**: After making any functional or structural change to the codebase, always check if relevant documentation (such as `README.md`, `docs/ARCHITECTURE.md`, or other guidelines in the `docs/` folder) needs to be updated to keep it accurate and synchronized with the code.
