# Architecture Overview

This project follows Electron's recommended security practices by separating the
main (Node.js) process from the renderer (Chromium) process.

## Process Model

- **Main Process (`src/main/index.ts`):**
  - Manages application lifecycle and implements a custom, hidden title bar for
    better native integration across OS platforms.
  - Handles sensitive API integrations (Azure DevOps, GitHub, GitHub Copilot).
  - Manages persistent state using `electron-store`.
  - Ensures proper resource cleanup (e.g., Copilot sessions) on application
    quit.
- **Preload Script (`src/main/preload.ts`):**
  - Exposes a secure `electronAPI` bridge to the renderer.
  - Provides methods for settings management and tool-specific backend actions.
- **Renderer Process (`src/renderer/renderer.tsx`):**
  - Built with React and TypeScript.
  - Uses `HashRouter` for navigation between tools.
  - Renders Markdown results using `react-markdown`.
  - **UI Architecture**: Features a shared `PageLayout` component that
    standardizes navigation with consistent, **sticky, edge-to-edge headers**.
    The global content area padding has been moved from the root layout to
    individual pages and the `PageLayout` component to allow for truly fixed
    headers that fill the viewport.
  - **Landing Page & Navigation Menu**: The main menu page is structured into four distinct lifecycle columns: **Ideation** (T-Shirt Size Estimator), **Solution Design** (Story Writer, Test Case Writer), **Build** (Story Elaborator), and **Review** (PR Reviewer). This aligns features with standard software development stages and uses consistent visual treatments and header icons.

## Configuration Management

We use `electron-store` to persist user settings (like Azure DevOps or GitHub PATs)
locally on the machine.

- **Encryption:** Sensitive credentials (`azurePat`, `githubToken`, `copilotToken`, `confluenceToken`) are encrypted using Electron's native `safeStorage` API before being written to disk. They are decrypted on-the-fly when read by the main process. If `safeStorage` is unavailable (e.g., in headless or testing environments), it falls back gracefully to plain-text storage.
- **IPC Access:** The renderer fetches and saves settings through the
  `get-settings` and `save-settings` IPC handlers.

## Usage History & Local Database

We use a local SQLite database (`better-sqlite3`) to persist the usage history of the application.

- **Storage Location:** The database file (`history.db`) is stored in the application's user data directory (retrieved via `app.getPath('userData')`). During automated testing, it falls back to an in-memory database to prevent side effects.
- **Retention & Cleanup:** To manage local disk space, a non-blocking database cleanup job runs 2 seconds after application startup, pruning any usage sessions and linked LLM usage records older than 30 days.
- **Build Requirements:** Because `better-sqlite3` is a native C++ Node addon, it must be rebuilt for the Electron ABI on install. To ensure build tool compatibility in the CI pipeline, the GitHub Actions configuration runs on `windows-2022` to maintain C++ compiler and Python toolchain compatibility.
- **Database Schema:**
  - `usage_sessions`: Records the overall usage session, tracking the tool name, external context reference (e.g., `"PR - 123"`, `"Ticket - 456"`), AI output summary, pushed items status, and completion timestamp.
  - `llm_usages`: Records phase-by-phase or turn-by-turn LLM usage (linked to `usage_sessions` via a foreign key with cascade deletion), tracking the specific model used, input tokens, output tokens, cached tokens, and multiplier.
- **IPC Access:** The renderer queries history logs through `get-history` and deletes records via `clear-history`. When external tools push comment or ticket changes to remote repositories (Azure DevOps or GitHub), the frontend updates the associated database session using the `dbSessionId` key.

## External Integrations

### Azure DevOps

- **Library:** `azure-devops-node-api`
- **Method:** Uses Personal Access Tokens (PAT) via the Work Item Tracking API (for work items) and Git API (for pull requests via `CodeReviewProvider`).
- **Scope:**
  - Fetches work item details (ID, Title, Description, Acceptance Criteria) and supports real-time text-based and ID-based work item searching using WIQL and exact-match prioritization.
  - Pushes AI-generated content as **Comments** (updating `System.History`) and manages pull request review threads.
  - Creates new **Tasks** linked to a parent ID via `Hierarchy-Reverse`
    relationships.
  - Creates new user stories/work items (e.g. Product Backlog Items) linked to a parent Feature ID using customizable work item type settings.
  - Fetches details of a specific Pull Request (`gitApi.getPullRequestById`) or lists active pull requests for the project (`gitApi.getPullRequestsByProject`).
  - Fetches work item references linked to a Pull Request (`gitApi.getPullRequestWorkItemRefs`) to attach user stories as additional code review context.
  - Posts code review findings (both general and line-specific comments) to the PR as new active comment threads (`gitApi.createThread`) targeting precise file paths and line offsets with an AI disclaimer.

### GitHub

- **Library:** Uses native `fetch` calling GitHub REST API (v3).
- **Method:** Uses Personal Access Tokens (PAT).
- **Scope:**
  - Fetches issue details (number, title, body) and supports owner-level issue searching via Search API, including exact ID match and label filtering.
  - Pushes AI-generated content as comments on issues and pull requests.
  - Creates new child issues in the same repository as the parent issue, automatically linking them as sub-issues.
  - Fetches details of pull requests and active pull requests across the configured owner/org.
  - Extracts linked issue references from PR descriptions to attach them as additional review context.
  - Posts general and line-anchored review comments directly to the pull request.

### Confluence

- **Service:** `ConfluenceService`
- **Integration:** Directly interacts with the Confluence Cloud REST API using
  internal `fetch` calls.
- **Authentication:** Supports Basic Auth (Email/API Token) or Bearer Auth.
- **Usage:**
  - Fetches `body.storage` for a specific Page ID to provide context for story generation.
  - Supports real-time text-based and ID-based page searching using Confluence Query Language (CQL) with `expand=body.storage` and exact-match prioritization.

### GitHub Copilot

- **Library:** `@github/copilot-sdk`
- **Authentication:** Relies on the machine's local GitHub CLI authentication.
  The application checks the connection and authentication status via the SDK. On launch, if
  no active authentication is detected, Stitch displays a startup overlay warning modal with
  instructions to run `copilot auth signin` or `gh auth login`. Additionally, a clickable status
  indicator is present in the application footer to dynamically re-check and display the auth state.
- **Self-Managed Copilot CLI Installer:**
  - To prevent cross-platform execution issues in packaged environments (e.g., on Windows where system Node spawned as a child process cannot access files inside Electron's read-only `app.asar` package), Stitch manages `@github/copilot` (Copilot CLI) locally in a dedicated directory inside the application's user data path (`<userData>/copilot-cli`).
  - On launch, Stitch verifies that Node.js v22+ is installed, checks for the existence of `@github/copilot` in the managed directory, and matches the installed version against the required version range declared by `@github/copilot-sdk`.
  - If the CLI dependency is missing or outdated, an automated setup wizard displays in the UI to perform the installation seamlessly in the background via NPM.
  - To minimize bundle size and prevent ASAR packaging/execution conflicts, the Electron Forge packaging process is configured (via `forge.config.ts`) to strip all Copilot CLI executables and platform-specific packages (`@github/copilot` and `@github/copilot-*` except `@github/copilot-sdk`) from `node_modules` before generating the final application archive.
- **Model Selection:** Supports listing available models (e.g., GPT-4o, Claude
  3.5 Sonnet) and allowing users to choose a model for each generation session.
- **Generation & Multi-turn Sessions:**
  - For single-shot operations (Test Case Writer, Story Writer), it uses a transient session.
  - For the **PR Reviewer**, it starts a new transient session per active review phase, executing them in parallel using an asynchronous worker pool (rather than sequentially) to enforce phase isolation.
  - For the **Story Elaborator**, `StoryElaboratorService` maintains a stateful in-memory registry (`activeElaborations = new Map<string, { client: any, session: any }>()`) that keeps the same session alive across multiple user turns/answers.
  - For the **T-Shirt Size Estimator**, `TShirtEstimatorService` manages stateful Copilot sessions registered by a unique `sessionId` in `activeEstimations = new Map<string, { client: any, session: any, ... }>()` to allow iterative file inspections and stream progress updates until the final estimate is generated.
- **Session Labels (Telemetry and Tracking):**
  - To improve diagnostic capabilities and auditability, all Copilot sessions are configured with a descriptive `session.label` (e.g., `'Story Elaborator'`, `'T-Shirt Size Estimator'`, or `'PR Reviewer Phase: <phase>'`). This label is passed to the `@github/copilot-sdk` backend during session creation to tag all telemetry and API requests.
- **Real-time Streaming & JSONL Protocol:**
  - Does not use a blocking request-response model. Instead, the main process streams generated data progressively to the renderer.
  - For single-shot tools, lines are pushed via `test-case-line` and `story-line` IPC events.
  - For the **PR Reviewer**, review comments and status outputs are parsed as JSONL lines (`type: "status"`, `type: "general"`, or `type: "line"`). When a `line` comment is parsed, the backend dynamically resolves context lines using `extractFileContextSync` and enriches the JSON object before pushing it to the UI.
  - For the **Story Elaborator**, lines are emitted via `elaboration-line`. The communication uses a strict JSON Lines (JSONL) protocol, streaming objects of type `status` (thoughts and directory search updates), `question` (with suggested answers for the user), or `plan` (the finalized implementation plan).
  - For the **T-Shirt Size Estimator**, lines are emitted via `tshirt-estimation-line`. The communication uses a strict JSON Lines (JSONL) protocol, streaming objects of type `status` (thoughts and tool progress updates) or `estimate` (the final effort estimate with size and reasoning).
  - Inside `sendAndCollectStream`, a newline buffer fallback processes block-delivered responses when incremental token deltas are skipped during tool executions, ensuring smooth UI status tracking.
- **Tool Call Status Updates & Report Intent:**
  - Copilot tool executions (like `grep`, `view`, `bash`, `powershell`) and agent status updates are intercepted by the main process and formatted via `formatToolStatus` to construct clean, user-friendly logging text (e.g., `'grep (pattern)'` or `'view (filename)'`).
  - Agents communicate their current status, intent, or progress using a custom `report_intent` tool. Tool invocations are captured on execution start and immediately formatted as status logs, which are streamed as JSON objects of `type: "status"` to keep UI status tracking accurate and lightweight.
- **Usage Metrics Tracking**:
  - For each Copilot session, `CopilotService` listens to the `assistant.usage` event emitted by the Copilot agent.
  - The service tracks token usage metrics, including input tokens (`inputTokens`), output tokens (`outputTokens`), cached tokens (`cacheReadTokens`), model name (`model`), and model multiplier/cost (`cost`), falling back to default values if any metric is missing.
  - The accumulated usage metrics are returned to the renderer process upon task completion via IPC.
  - For parallelized tasks like the **PR Reviewer**, individual phase sessions propagate their stats to the reviewer service, which aggregates the total usage stats and attaches per-phase usage details (`phases`) returned to the frontend for detailed inspection via the model usage toast modal.
- **`request_documentation` Custom Tool**:
  - Exposed to the Copilot session during both **PR Reviewer** (when attaching linked stories) and **Story Elaborator** tasks.
  - The custom tool (`createRequestDocumentationTool` from `src/main/infrastructure/copilot/tools/documentationTool.ts`) takes a `documentId` (e.g., Confluence Page ID) and queries `ConfluenceService` to retrieve the page title and storage body layout.
  - Features an internal request deduplication map to prevent the agent from repeatedly querying the same documentation ID in a single session.
- **Workspace Tool Integration (Local Repositories & Git Safety)**:
  - If a repository directory path is provided to the Story Elaborator, the Copilot session is created with `workingDirectory` set to that directory, giving the model first-party tool capability (e.g., browsing files, reading code, searching with grep). The model is instructed to write the plan to a file in the workspace (e.g. `implementation_plan.md`) using its tools.
  - If no repository directory is provided, the session is created with `availableTools: []` (empty array) and without workspace bounds, confining the model's operation to the ticket's text context only.
  - **PR Reviewer Parallelism & Worker Pool**:
    - Review phases run in parallel using an asynchronous worker pool. The `maxWorkers` count is configured by a slider in the PR Reviewer Settings (bounded by the CPU count) or defaults to `Math.max(1, Math.floor(numCPUs / 2))`.
    - **Crucial Dependency**: Parallel review execution requires Git Worktree Support to be enabled. Without worktree isolation, concurrent checkouts and file operations in a single repository would create race conditions and git conflicts. Parallelism is automatically locked to 1 if Git Worktree is disabled.
  - **Git Worktree Isolation**:
    - When Git Worktree Support is enabled, Stitch creates separate, temporary git worktree checkouts under a user-configured base directory (`gitWorktreeBaseDir`).
    - For the **PR Reviewer**, it creates an isolated worktree formatted as `<repo_name>_pr_<prNumber>` checkout at the target commit SHA, performing diffs and reviews there without touching the user's active workspace.
    - For the **Story Elaborator**, it fetches the remote target branch from origin, parses its `FETCH_HEAD` SHA, and creates an isolated worktree formatted as `<repo_name>_ticket_<ticketId>` checkout at that commit. This lets the elaborator analyze code and write its implementation plan safely.
    - For the **T-Shirt Size Estimator**, it fetches the remote target branch and creates an isolated worktree formatted as `<repo_name>_tshirt_<sessionId>` to inspect code files and construct the estimate without modifying workspace files.
    - **Cleanup and Pruning**: Active worktrees are removed (`git worktree remove --force`) and pruned (`git worktree prune`) on completion, cancellation, or error. Settings also exposes a manual worktree scanner and cleanup button to safely purge orphaned worktree folders.
  - **PR Reviewer Git Lifecycle & Session Safety (when Worktrees are Disabled):**
    - To prevent systems from sleeping during multi-phase reviews, Stitch starts an Electron `powerSaveBlocker` during execution.
    - To prevent loss of work, the PR Reviewer throws an error if there are uncommitted changes in the repository.
    - It captures the current branch ref and stores it in an active checkouts map (`activeCheckouts = new Map<string, string>()`) to guarantee that the repository is restored back to the user's original checkout state when the review completes, is cancelled, or fails.
    - Files are checked out and diffed against the target branch, then filtered per phase using `picomatch` based on `include` and `exclude` glob patterns defined in the phase frontmatter. If no files match, the phase is safely skipped.

## Technical Decisions

### Vertical Slice Architecture & Prompt Management

To prevent tool-specific logic, UI files, prompts, and backend coordination from spreading across technical layers, the project follows a **Vertical Slice Architecture**:

1. **Symmetrical Feature Slices**: Feature directories under `src/main/features/` and `src/renderer/features/` encapsulate domain-specific code (e.g. `story-writer`, `test-case-writer`, `story-elaborator`, `tshirt-estimator`, `pr-reviewer`, `settings`, `menu`).
2. **Containment of Prompts**: Rather than using a single centralized prompt file, prompts are contained inside their respective main process feature slices (e.g., `storyWriterPrompts.ts`). The prompt validation logic (`checkPromptComplexity`) is centralized inside the `settings` feature slice (`promptComplexityService.ts`) which imports prompt templates from the individual slices to validate complexity.
3. **Decoupled Infrastructure**: Shared, low-level integration services (like `AzureDevOpsService`, `GitHubService`, `ConfluenceService`, `CodeReviewProvider` implementations, and `CopilotService` connection lifecycle management) reside inside `src/main/infrastructure/`. Feature services leverage these services via constructor dependency injection, keeping tool logic fully decoupled from infrastructure.

### Hybrid ESM/CommonJS Approach

The project is configured as CommonJS (`"type": "commonjs"`) to maintain
compatibility with standard Electron Forge/Webpack templates. However, to
support modern ESM-only libraries like `electron-store` and
`@github/copilot-sdk`, we use:

1. **Dynamic `import()`**: For `electron-store` to load the module
   asynchronously.
2. **`eval('import(...)')` Workaround**: For `@github/copilot-sdk` to bypass
   Webpack's static analysis, ensuring the library is loaded as a native ESM
   module by Node.js at runtime.

## Inter-Process Communication (IPC) Handlers

- `get-settings`: Returns the current application configuration.
- `save-settings`: Updates and persists configuration.
- `get-version-status`: Returns the application version update status, used to display the "Updated" toast notification.
- `open-external`: Opens a URL in the default browser.
- `fetch-ticket`: Retrieves work item / issue data from Azure DevOps or GitHub.
- `fetch-confluence-page`: Retrieves documentation content from Confluence.
- `search-tickets`: Queries work items on Azure DevOps or issues on GitHub by ID or title text. Supports work item type / label filtering.
- `search-confluence-pages`: Queries pages on Confluence by ID or title text using CQL.
- `generate-test-cases`: Interfaces with Copilot to produce Markdown test
  plans. Streams output line-by-line via `test-case-line` IPC events and resolves once concluded. Supports `modelOverride`.
- `generate-stories`: Interfaces with Copilot to produce structured JSON
  stories. Streams output line-by-line via `story-line` IPC events and resolves once concluded. Supports `modelOverride`.
- `check-copilot-auth`: Checks Copilot CLI authentication and connection status.
- `check-environment`: Validates the environment by checking that Node.js is present (v22+) and checking the local `@github/copilot` installation version.
- `install-copilot-cli`: Performs the automated local installation of `@github/copilot` in the application data directory.
- `list-copilot-models`: Retrieves available GitHub Copilot models.
- `check-prompt-complexity`: Runs Copilot-based complexity and safety validation on user-customized prompt templates.
- `add-comment`: Pushes text as a comment onto an Azure DevOps work item or GitHub issue.
- `create-ticket`: Creates a new work item (Story or Task) in Azure DevOps or issue in GitHub linked to a parent.
- `select-directory`: Triggers Electron's native `dialog.showOpenDialog` to allow user directory selection.
- `start-story-elaboration`: Spawns a stateful `@github/copilot-sdk` session for the Story Elaborator, configured with ticket details, branch selection, and workspace context. Streams lines via `elaboration-line`.
- `send-elaboration-answer`: Sends subsequent replies/responses to the ongoing story elaboration session.
- `stop-story-elaboration`: Cleans up and destroys an active story elaboration session.
- `start-tshirt-estimation`: Spawns a stateful `@github/copilot-sdk` session for the T-Shirt Size Estimator, configured with change description and workspace context. Streams lines via `tshirt-estimation-line`.
- `stop-tshirt-estimation`: Cleans up and destroys an active T-Shirt size estimation session, pruning its temporary git worktree.
- `pr-reviewer:get-details`: Fetches PR metadata, target/source branch references, and linked work item references via `CodeReviewProvider`.
- `pr-reviewer:checkout`: Sanitizes repository state, checks out the PR branch (with worktree support if configured), and returns comparison details.
- `pr-reviewer:get-diff-files`: Lists all modified files in the repository between HEAD and the target branch.
- `pr-reviewer:get-file-diff`: Retrieves the git diff for a specific file compared to the target branch.
- `pr-reviewer:search-prs`: Queries the code review host for active PRs matching user search criteria.
- `pr-reviewer:get-phases`: Reads, parses, and sorts frontmatter metadata from review phase files in `~/.stitch/pr-reviewer/phases/`.
- `pr-reviewer:open-directory`: Opens the local `~/.stitch/pr-reviewer/` configuration folder using the OS shell.
- `pr-reviewer:check-worktrees`: Scans the configured base directory for active/orphaned git worktrees and returns their status and count.
- `pr-reviewer:clean-worktrees`: Force-cleans and prunes worktrees and directories in the configured base directory.
- `get-cpu-count`: Retrieves the CPU cores count from the operating system to establish worker pool boundaries.
- `pr-reviewer:review`: Triggers a sequential or parallel multi-phase PR review, streaming real-time status and line-anchored code feedback to the UI.
- `pr-reviewer:post-comment`: Submits a code review comment (general or line-anchored code block thread) back to the PR via `CodeReviewProvider`.
- `pr-reviewer:get-repo-path-history` / `pr-reviewer:save-repo-path-history`: Stores the last used local filesystem clone path mapping for a given repository.
- `pr-reviewer:verify-repo-path`: Asserts if a path represents a git repository, resolving its root directory if necessary.
- `show-notification`: Displays a system notification using the native `Notification` API.
- `set-window-progress`: Configures or clears the progress state on the native window taskbar or dock.
