# Architecture Overview

This project follows Electron's recommended security practices by separating the
main (Node.js) process from the renderer (Chromium) process.

## Process Model

- **Main Process (`src/main/index.ts`):**
  - Manages application lifecycle and implements a custom, hidden title bar for
    better native integration across OS platforms.
  - Handles sensitive API integrations (Azure DevOps, GitHub Copilot).
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

## Configuration Management

We use `electron-store` to persist user settings (like Azure DevOps PATs)
locally on the machine.

- **Encryption:** Settings are stored in the default Electron user data path.
- **IPC Access:** The renderer fetches and saves settings through the
  `get-settings` and `save-settings` IPC handlers.

## External Integrations

### Azure DevOps

- **Library:** `azure-devops-node-api`
- **Method:** Uses Personal Access Tokens (PAT) via the Work Item Tracking API.
- **Scope:**
  - Fetches work item details (ID, Title, Description, Acceptance Criteria) and supports real-time text-based and ID-based work item searching using WIQL and exact-match prioritization.
  - Pushes AI-generated content as **Comments** (updating `System.History`).
  - Creates new **Tasks** linked to a parent ID via `Hierarchy-Reverse`
    relationships.
  - Creates new **Product Backlog Items (PBIs)** linked to a Feature ID.

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
- **Authentication:** Relies on the machine's local GitHub CLI authentication
  (`gh auth login`). The application checks the active connection and auth
  status via the SDK.
- **Self-Managed Copilot CLI Installer:**
  - To prevent cross-platform execution issues in packaged environments (e.g., on Windows where system Node spawned as a child process cannot access files inside Electron's read-only `app.asar` package), Stitch manages `@github/copilot` (Copilot CLI) locally in a dedicated directory inside the application's user data path (`<userData>/copilot-cli`).
  - On launch, Stitch verifies that Node.js v22+ is installed, checks for the existence of `@github/copilot` in the managed directory, and matches the installed version against the required version range declared by `@github/copilot-sdk`.
  - If the CLI dependency is missing or outdated, an automated setup wizard displays in the UI to perform the installation seamlessly in the background via NPM.
- **Model Selection:** Supports listing available models (e.g., GPT-4o, Claude
  3.5 Sonnet) and allowing users to choose a model for each generation session.
- **Generation & Multi-turn Sessions:**
  - For single-shot operations (Test Case Writer, Story Writer), it uses a transient session.
  - For the interactive **Story Elaborator**, `StoryElaboratorService` maintains a stateful in-memory registry (`activeElaborations = new Map<string, { client: any, session: any }>()`) that keeps the same session alive across multiple user turns/answers.
- **Real-time Streaming & JSONL Protocol:**
  - Does not use a blocking request-response model. Instead, the main process streams generated data progressively to the renderer.
  - For single-shot tools, lines are pushed via `test-case-line` and `story-line` IPC events.
  - For the **Story Elaborator**, lines are emitted via `elaboration-line`. The communication uses a strict JSON Lines (JSONL) protocol, streaming objects of type `status` (thoughts and directory search updates), `question` (with suggested answers for the user), or `plan` (the finalized implementation plan).
  - Inside `sendAndCollectStream`, a newline buffer fallback processes block-delivered responses when incremental token deltas are skipped during tool executions, ensuring smooth UI status tracking.
- **Workspace Tool Integration (Local Repositories)**:
  - If a repository directory path is provided to the Story Elaborator, the Copilot session is created with `workingDirectory` set to that directory, giving the model first-party tool capability (e.g., browsing files, reading code, searching with grep). The model is instructed to write the plan to a file in the workspace (e.g. `implementation_plan.md`) using its tools.
  - If no repository directory is provided, the session is created with `availableTools: []` (empty array) and without workspace bounds, confining the model's operation to the ticket's text context only.

## Technical Decisions

### Vertical Slice Architecture & Prompt Management

To prevent tool-specific logic, UI files, prompts, and backend coordination from spreading across technical layers, the project follows a **Vertical Slice Architecture**:

1. **Symmetrical Feature Slices**: Feature directories under `src/main/features/` and `src/renderer/features/` encapsulate domain-specific code (e.g. `story-writer`, `test-case-writer`, `story-elaborator`, `settings`, `menu`).
2. **Containment of Prompts**: Rather than using a single centralized prompt file, prompts are contained inside their respective main process feature slices (e.g., `storyWriterPrompts.ts`). The prompt validation logic (`checkPromptComplexity`) is centralized inside the `settings` feature slice (`promptComplexityService.ts`) which imports prompt templates from the individual slices to validate complexity.
3. **Decoupled Infrastructure**: Shared, low-level integration services (like `AzureDevOpsService`, `ConfluenceService`, and `CopilotService` connection lifecycle management) reside inside `src/main/infrastructure/`. Feature services leverage these services via constructor dependency injection, keeping tool logic fully decoupled from infrastructure.

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
- `get-version`: Returns the application version.
- `open-external`: Opens a URL in the default browser.
- `fetch-ticket`: Retrieves work item data from Azure DevOps.
- `fetch-confluence-page`: Retrieves documentation content from Confluence.
- `search-tickets`: Queries work items on Azure DevOps by ID or title text.
- `search-confluence-pages`: Queries pages on Confluence by ID or title text using CQL.
- `generate-test-cases`: Interfaces with Copilot to produce Markdown test
  plans. Streams output line-by-line via `test-case-line` IPC events and resolves once concluded. Supports `modelOverride`.
- `generate-stories`: Interfaces with Copilot to produce structured JSON
  stories. Streams output line-by-line via `story-line` IPC events and resolves once concluded. Supports `modelOverride`.
- `check-copilot-auth`: Checks Copilot CLI authentication and connection status.
- `check-environment`: Validates the environment by checking that Node.js is present (v22+) and checking the local `@github/copilot` installation version.
- `install-copilot-cli`: Performs the automated local installation of `@github/copilot` in the application data directory.
- `list-copilot-models`: Retrieves available GitHub Copilot models.
- `add-comment`: Pushes text as a comment onto an Azure DevOps work item.
- `create-ticket`: Creates a new work item (PBI or Task) in Azure DevOps linked to a parent.
- `select-directory`: Triggers Electron's native `dialog.showOpenDialog` to allow user directory selection.
- `start-story-elaboration`: Spawns a stateful `@github/copilot-sdk` session for the Story Elaborator, set with the ticket info and workspace path context. Streams lines to the renderer via `elaboration-line`.
- `send-elaboration-answer`: Sends subsequent replies/responses to the ongoing story elaboration session.
- `stop-story-elaboration`: Cleans up and destroys an active story elaboration session.
