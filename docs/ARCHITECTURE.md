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
  - Fetches work item details (ID, Title, Description, Acceptance Criteria).
  - Pushes AI-generated content as **Comments** (updating `System.History`).
  - Creates new **Tasks** linked to a parent ID via `Hierarchy-Reverse`
    relationships.
  - Creates new **Product Backlog Items (PBIs)** linked to a Feature ID.

### Confluence

- **Service:** `ConfluenceService`
- **Integration:** Directly interacts with the Confluence Cloud REST API using
  internal `fetch` calls.
- **Authentication:** Supports Basic Auth (Email/API Token) or Bearer Auth.
- **Usage:** Fetches `body.storage` for a specific Page ID to provide context
  for story generation.

### GitHub Copilot

- **Library:** `@github/copilot-sdk`
- **Authentication:** Relies on the machine's local GitHub CLI authentication
  (`gh auth login`). The application checks the active connection and auth
  status via the SDK.
- **Model Selection:** Supports listing available models (e.g., GPT-4o, Claude
  3.5 Sonnet) and allowing users to choose a model for each generation session.
- **Generation:** Uses a conversation session to pass context (Azure tickets or
  Confluence requirements) and custom prompts to generate structured output.

## Technical Decisions

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
- `generate-test-cases`: Interfaces with Copilot to produce Markdown test
  plans. Supports `modelOverride`.
- `generate-stories`: Interfaces with Copilot to produce structured JSON
  stories. Supports `modelOverride`.
- `check-copilot-auth`: Checks Copilot CLI authentication and connection status.
- `list-copilot-models`: Retrieves available GitHub Copilot models.
- `add-comment`: Pushes text as a comment onto an Azure DevOps work item.
- `add-child-task`: Creates a new linked Task in Azure DevOps.
- `create-pbi`: Creates a new linked PBI in Azure DevOps.
