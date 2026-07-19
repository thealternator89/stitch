<p align="center">
  <img src="assets/logo-full.png" alt="Stitch Logo" width="600" />
</p>

Stitch is an AI-powered desktop assistant designed for senior engineers, along
with technical business analysts and product owners. It bridges the gap between
your local codebase, Azure DevOps / GitHub, Confluence documentation, and GitHub Copilot
to automate tedious project tasks, plan implementation paths, and perform deep,
context-aware code reviews.

By combining your issue tracking, documentation, and local repository, Stitch
enables you to write better requirements, generate thorough test coverage, and
automate reviews without losing focus or context.

## Key Benefits

- **Stop Context Switching**: Search and pull tickets from Azure DevOps or GitHub, fetch
  page context from Confluence, and read/write implementation details directly
  from/to your local git repository—all from a single, unified interface.
- **AI-Powered Code Reviews on Your Terms**: Automate your code review process
  locally. Define your own guidelines, group them by phases, target them to
  specific file types, and review code before publishing to remote pipelines.
- **Deep Code-Aware Ticket Elaborations**: Run interactive, stateful Q&A
  sessions with Copilot that can inspect your local workspace, retrieve linked
  confluence documentation, and write detailed implementation plans directly
  into your repo.
- **Accelerate Planning and Testing**: Generate comprehensive user stories and
  test cases from tickets in seconds, then instantly push them back to Azure
  DevOps or GitHub as stories or child tasks/sub-issues.

## Core Features

- **PR Reviewer (Automated local reviews)**:
  - Automatically conducts code reviews divided into customizable, isolated
    review phases.
  - **Parallel Review Execution**: Run review phases in parallel using an
    asynchronous worker pool, with configurable worker counts via a UI slider.
  - **Git Worktree Isolation**: Reviews can run in a separate git worktree
    directory instead of directly on your active working directory, avoiding any
    disruption to your current staging area/unstaged changes. Includes a cleanup
    utility to prune stale worktree directories.
  - Features **Git Workspace Safety**: requires zero uncommitted changes (when
    running directly in the repository), captures original branch reference,
    checks out the PR branch, and safely restores your original branch state.
  - Dynamically filters eligible phases based on modified file paths using glob
    patterns (e.g., only run C# analysis on `.cs` files).
  - Employs shared templates to enforce consistent roles, instructions, or
    response formats across phases.
  - Optionally attaches full pull request descriptions for richer target and
    requirement context.
  - **Linked Work Item & Documentation Context**: Optionally attaches linked
    Azure DevOps or GitHub user stories/issues. This automatically extracts Confluence
    documentation links and equips the Copilot session with a custom
    `request_documentation` tool to fetch and read their contents.
  - Displays real-time streaming status logs, phase success indicators, general
    review feedback, and line-specific comments enriched with local code
    context.
  - Publishes review feedback directly to Azure DevOps or GitHub as active, line-anchored
    discussion threads/comments.
  - For configuration details, see
    [docs/pr-reviewer/README.md](./docs/pr-reviewer/README.md).
- **Story Elaborator (Interactive planning)**:
  - Interactive, multi-turn dialog with GitHub Copilot to analyze an Azure
    DevOps or GitHub ticket and elaborate it into a detailed markdown implementation
    plan.
  - **Git Worktree Isolation & Branch Selection**: Automatically fetches the
    latest target branch reference from origin and spins up an isolated git
    worktree for elaboration sessions, allowing the AI to safely perform code
    analysis and write the plan to the filesystem without interrupting your
    working directory.
  - **Dual Operating Modes**:
    - _With Repository_: Initializes the Copilot session using the local
      directory (or the isolated worktree path) as the workspace context,
      allowing the model to use built-in tools (reading files, browsing
      directories) to analyze code and write the final implementation plan file.
    - _Without Repository_: Disables LLM filesystem tools and runs entirely
      context-free, building the plan solely from ticket details and user
      replies.
  - **Context-Aware Documentation Retrieval**: In either operating mode, if the
    ticket details contain Confluence page links, the Story Elaborator
    automatically identifies them, fetches their titles, and provides the custom
    `request_documentation` tool to the Copilot session so that the AI can fetch
    and read their contents to enrich the implementation plan.
  - Interactive Q&A chat interface with quick-select suggested answer pill
    buttons.
  - Streams real-time logging status updates from the Copilot session.
  - Option to post the final plan as an Azure DevOps or GitHub comment.
- **Test Case Writer (Automatic test case generation)**:
  - Integration with **Azure DevOps / GitHub Search** via an autocomplete dropdown,
    supporting debounced queries to search work items/issues by matching title or ID
    text, with automatic prioritized exact-ID fetching.
  - **Basic Test Case Editing**: Includes a drag-and-drop table for reordering
    generated rows, a visual indicator during generation, and the ability to
    delete and restore test cases directly inside the application.
  - Ability to seamlessly write generated test cases back to Azure DevOps or GitHub as
    **Comments** or new **Child Tasks / Sub-issues** (created as linked 'Task' or sub-issue items with an
    AI disclaimer).
  - Integration with **GitHub Copilot SDK** to automatically generate
    comprehensive test cases based on ticket context, with the ability to
    **select specific models** (e.g., GPT-4o, Claude 3.5 Sonnet).
  - Markdown support with GFM (tables, lists, etc.) for rendered results.
- **Story Writer (Requirements generator)**:
  - **Card-Based UI**: Modernized card layout for navigating and configuring
    user story generation.
  - Integration with **Confluence Page Search** via an autocomplete dropdown,
    supporting debounced queries to search space pages by matching title or Page
    ID.
  - **Feature ID Autocomplete Search**: Quickly search Azure DevOps or GitHub Features with
    automatic project/type/label filtering, moving configuration to Settings.
  - Prompts **GitHub Copilot SDK** to generate structured JSON containing user
    stories with Titles, Descriptions, and Acceptance Criteria, using your
    **chosen AI model**.
  - Ability to selectively choose generated stories and write them back to Azure
    DevOps or GitHub as new **Stories / Issues** linked under a specific
    Feature.
- **Persistent Settings & Prompt Customization**:
  - **Prompt Customization**: Fine-tune the base and detail prompt templates
    used by the **Test Case Writer**, **Story Writer**, and **Story
    Elaborator**. Includes an integrated **Prompt Complexity Check** powered by
    Copilot to validate templates, estimate token complexity, detect rule
    contradictions, and catch safety issues.
  - Securely store Azure DevOps or GitHub credentials, Confluence tokens, and project
    configurations locally. Select a default Copilot model and actively check
    the status of local GitHub Copilot CLI authentication.
  - **Copilot CLI Authentication Status Checks**: Monitors GitHub Copilot connection
    on startup, alerts the user with an interactive setup and troubleshooting
    overlay if credentials are not found, and displays a clickable connection
    status icon in the application footer for quick status verification.
  - Features a fixed top panel for quick access to save and back actions.

## Tech Stack

- **Framework:** [Electron](https://www.electronjs.org/) (via
  [Electron Forge](https://www.electronforge.io/))
- **Frontend:** [React](https://reactjs.org/) +
  [TypeScript](https://www.typescriptlang.org/)
- **Styling:** [Bootstrap 5](https://getbootstrap.com/) +
  [FontAwesome 6](https://fontawesome.com/)
- **Navigation:** [React Router Dom](https://reactrouter.com/)
- **APIs & Integration**:
  - **Azure DevOps & GitHub REST APIs**: `azure-devops-node-api` for Azure DevOps, and native `fetch` calls for GitHub.
  - `@github/copilot-sdk`: For AI-powered generation via GitHub Copilot.
  - **Confluence REST API**: Utilizing internal fetches for reading Atlassian
    Cloud content via Basic Auth using API Tokens.
- **Storage**: `electron-store` for persistent configuration.
- **Markdown**: `react-markdown` + `remark-gfm` for rich text rendering.

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v22 or above recommended)
- **GitHub Copilot CLI**: You must be authenticated via the Copilot CLI on your
  machine (e.g. using `copilot auth signin` or `gh auth login`).
  - **Note**: Stitch requires Node.js v22+ to run the Copilot CLI. On launch,
    Stitch will check if the `@github/copilot` CLI is installed locally in the
    application's user data directory. If it is missing or outdated, an
    interactive setup wizard will install it automatically using your system's
    Node and NPM. If an active authentication session is missing, an interactive
    modal will guide you through authentication commands.
- **Azure DevOps / GitHub PAT**: A Personal Access Token (PAT) with read/write access to work items/issues and pull requests.
- **Confluence API Token**: An Atlassian API Token generated from your profile
  settings (to be paired with your login email) for basic authentication.

### Installation

```bash
npm install
```

> **Note:** Running `npm install` automatically configures
> [Husky](https://typicode.github.io/husky/) to set up a git pre-commit hook.

### Running the Application (Development)

```bash
npm start
```

### Development

#### Code Formatting

This project uses **Prettier** for consistent code style.

- **Automatic**: A pre-commit hook (via `husky` and `lint-staged`) automatically
  formats your staged files before each commit.
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

## Privacy Policy

Stitch runs entirely locally on your machine and stores all configurations and credentials locally. For details, see [PRIVACY.md](./PRIVACY.md).

## License

MIT
