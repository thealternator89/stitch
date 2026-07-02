<p align="center">
  <img src="assets/logo-full.png" alt="Stitch Logo" width="600" />
</p>

An Electron-based desktop application for DevOps workflows, built with React and
TypeScript using Electron Forge.

## Features

- **Menu Dashboard**: A central hub for all DevOps tools using a clean
  Bootstrap-based UI.
- **Unified Navigation**: All tools feature a consistent, **fixed, edge-to-edge
  header** with a back button and page title for better usability on long forms.
- **Test Case Writer**:
  - Integration with **Azure DevOps Search** via an autocomplete dropdown, supporting debounced queries to search work items by matching title or ID text, with automatic prioritized exact-ID fetching.
  - Ability to seamlessly write generated test cases back to Azure DevOps as
    **Comments** or new **Child Tasks** (created as linked 'Task' items with an
    AI disclaimer).
  - Integration with **GitHub Copilot SDK** to automatically generate
    comprehensive test cases based on ticket context, with the ability to
    **select specific models** (e.g., GPT-4o, Claude 3.5 Sonnet).
  - Markdown support with GFM (tables, lists, etc.) for rendered results.
- **Story Writer**:
  - Integration with **Confluence Page Search** via an autocomplete dropdown, supporting debounced queries to search space pages by matching title or Page ID (utilizing Confluence Query Language and direct Page ID prioritization).
  - Prompts **GitHub Copilot SDK** to generate structured JSON containing user
    stories with Titles, Descriptions, and Acceptance Criteria, using your
    **chosen AI model**.
  - Ability to selectively choose generated stories and write them back to Azure
    DevOps as new **Product Backlog Items (PBIs)** linked under a specific
    Feature.
- **Story Elaborator**:
  - Interactive, multi-turn dialog with GitHub Copilot to analyze an Azure DevOps work item and elaborate it into a detailed markdown implementation plan.
  - **Dual Operating Modes**:
    - _With Repository_: Initializes the Copilot session using the local directory as the workspace context, allowing the model to use built-in tools (reading files, browsing directories) to analyze code and write the final implementation plan file directly to the workspace.
    - _Without Repository_: Disables LLM filesystem tools and runs entirely context-free, building the plan solely from ticket details and user replies.
  - Interactive Q&A chat interface with quick-select suggested answer pill buttons.
  - Streams real-time logging status updates from the Copilot session.
  - Option to post the final plan as an Azure DevOps comment.
- **PR Reviewer**:
  - Automatically conducts code reviews divided into customizable, isolated review phases.
  - Dynamically filters eligible phases based on modified file paths using glob patterns (e.g., only run C# analysis on `.cs` files).
  - Employs shared templates to enforce consistent roles, instructions, or response formats.
  - Optionally attaches full pull request descriptions for richer target and requirement context.
  - For configuration details, see [docs/pr-reviewer/README.md](./docs/pr-reviewer/README.md).
- **Persistent Settings**: Securely store Azure DevOps credentials, Confluence
  tokens, and project configuration locally, select a **default Copilot model**,
  and actively **check the status** of local GitHub Copilot CLI authentication.
  The settings page features a **fixed top panel** for quick access to save and
  back actions.

## Tech Stack

- **Framework:** [Electron](https://www.electronjs.org/) (via
  [Electron Forge](https://www.electronforge.io/))
- **Frontend:** [React](https://reactjs.org/) +
  [TypeScript](https://www.typescriptlang.org/)
- **Styling:** [Bootstrap 5](https://getbootstrap.com/) +
  [FontAwesome 6](https://fontawesome.com/)
- **Navigation:** [React Router Dom](https://reactrouter.com/)
- **APIs & Integration**:
  - `azure-devops-node-api`: For interacting with Azure DevOps REST APIs.
  - `@github/copilot-sdk`: For AI-powered generation via GitHub Copilot.
  - **Confluence REST API**: Utilizing internal fetches for reading Atlassian
    Cloud content via Basic Auth using API Tokens.
- **Storage**: `electron-store` for persistent configuration.
- **Markdown**: `react-markdown` + `remark-gfm` for rich text rendering.

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v22 or above recommended)
- **GitHub Copilot CLI**: You must be authenticated via the Copilot CLI on your
  machine (launch `copilot`, enter `/login` and follow the prompts).
  - **Note**: Stitch requires Node.js v22+ to run the Copilot CLI. On launch, Stitch will check if the `@github/copilot` CLI is installed locally in the application's user data directory. If it is missing or outdated, an interactive setup wizard will install it automatically using your system's Node and NPM.
- **Azure DevOps PAT**: A Personal Access Token with "Work Items: Read & Write"
  permissions.
- **Confluence API Token**: An Atlassian API Token generated from your profile
  settings (to be paired with your login email) for basic authentication.

### Installation

```bash
npm install
```

> **Note:** Running `npm install` automatically configures [Husky](https://typicode.github.io/husky/) to set up a git pre-commit hook.

### Running the Application (Development)

```bash
npm start
```

### Development

#### Code Formatting

This project uses **Prettier** for consistent code style.

- **Automatic**: A pre-commit hook (via `husky` and `lint-staged`) automatically formats your staged files before each commit.
- **Manual**: You can format all supported files manually by running:
  ```bash
  npm run format
  ```

#### Linting

To check for code quality and style issues:

```bash
npm run lint
```

### Packaging for Distribution

```bash
npm run package
# or
npm run make
```

## Project Structure

```text
.
├── assets/             # Static assets (logos, icons)
├── docs/               # Technical documentation
├── src/
│   ├── main/           # Main process logic (Node.js environment)
│   │   ├── index.ts    # Main process entry point & IPC Handlers
│   │   ├── preload.ts  # Preload script for IPC and secure bridge
│   │   ├── infrastructure/ # Low-level shared infrastructure (Azure, Confluence, Copilot SDK lifecycle)
│   │   └── features/       # Self-contained main-side backend feature slices (story-writer, test-case-writer, story-elaborator, pr-reviewer)
│   └── renderer/       # Renderer process (React environment)
│       ├── components/ # Shared React UI components
│       ├── hooks/      # Shared React hooks (e.g., useCopilotModels)
│       ├── context/    # Shared React context (e.g., TimeoutContext)
│       ├── features/   # Symmetrical front-end feature slices (menu, settings, story-writer, test-case-writer, story-elaborator)
│       ├── App.tsx     # Main React component with Routing
│       ├── index.css   # Global styles & Markdown overrides
│       ├── index.html  # Main HTML template
│       └── renderer.tsx # Renderer entry point (React mount)
├── forge.config.ts     # Electron Forge configuration
├── tsconfig.json       # TypeScript configuration
├── webpack.main.config.ts     # Webpack config for main process
└── webpack.renderer.config.ts # Webpack config for renderer process
```

## Architecture

For a detailed explanation of the process model, configuration management, and
AI integration, see [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md).

## License

MIT
