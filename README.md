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
- **Rapid T-Shirt Effort Estimation**: Automatically estimate the size (XS, S, M, L, XL)
  and complexity of a proposed change by letting Copilot inspect the files in your
  repository safely via isolated git worktrees.

## Core Features

Stitch's features are organized into columns on the landing page representing key stages of the software development lifecycle:

### Ideation

- **T-Shirt Size Estimator (Complexity & Effort Estimator)**:
  - Automatically estimates the effort size (XS, S, M, L, XL) and complexity of a proposed change.
  - Leverages GitHub Copilot SDK with local repository access to search, analyze, and inspect the codebase structure and existing implementations before formulating the estimate.
  - Uses **Git Worktree Isolation** to fetch the remote target branch and spin up an isolated, temporary worktree to inspect code files and construct the estimate without modifying your workspace files.
  - Streams real-time streaming status updates via a custom status protocol, detailing LLM tool execution steps and intermediate thoughts.

### Solution Design

- **Story Writer (Requirements generator)**:
  - **Card-Based UI**: Modernized card layout for navigating and configuring user story generation.
  - Integration with **Confluence Page Search** via an autocomplete dropdown, supporting CQL query searches to retrieve page content for rich ticket context.
  - **Feature ID Autocomplete Search**: Quickly search Azure DevOps or GitHub Features with automatic project/type/label filtering.
  - Prompts GitHub Copilot SDK to generate structured JSON containing user stories (Titles, Descriptions, Acceptance Criteria) using your **chosen AI model**.
  - Ability to selectively choose generated stories and write them back to Azure DevOps or GitHub as new stories or issues linked under the Feature.
- **Test Case Writer (Automatic test case generation)**:
  - Search Azure DevOps work items or GitHub issues to use as context via autocomplete dropdowns.
  - Automatically generates comprehensive test cases based on ticket context using selectable models (e.g., GPT-4o, Claude 3.5 Sonnet).
  - **Basic Test Case Editing**: Includes a drag-and-drop table for reordering generated rows, deleting, and restoring test cases.
  - Write test cases back to Azure DevOps/GitHub as comments or new child tasks/sub-issues.

### Build

- **Story Elaborator (Interactive planning)**:
  - Interactive, multi-turn chat with Copilot to analyze tickets and elaborate them into detailed markdown implementation plans.
  - **Git Worktree Isolation & Branch Selection**: Spins up isolated git worktrees at the latest branch target to analyze code and write plans to the repository without interrupting your working directory.
  - **Dual Operating Modes**: Can run with full repository file access (utilizing LLM filesystem tools to read files and find files) or without repository (text context only).
  - Retrieve Confluence pages automatically if referenced in ticket links to enrich the implementation planning.
  - Option to save the plan directly to the repository (e.g., `implementation_plan.md`) and/or post it as a comment on the ticket.

### Review

- **PR Reviewer (Automated local reviews)**:
  - Conducts automated multi-phase reviews based on local guidelines (`~/.stitch/pr-reviewer`).
  - **Parallel Review Execution**: Run review phases concurrently using an asynchronous worker pool, speeding up execution.
  - **Git Worktree Isolation**: Run reviews in temporary worktrees to prevent changes or dirty workdirs from interfering.
  - **Git Workspace Safety**: Restores the repository to your original checkout state when done.
  - Dynamic file filtering per phase using include/exclude glob patterns.
  - **Critic Phase**: Evaluation pass allowing users to approve, edit, or reject AI comments before posting.
  - Streams real-time feedback and line-anchored comments directly back to Azure DevOps/GitHub.
  - For configuration details, see [docs/pr-reviewer/README.md](./docs/pr-reviewer/README.md).

### Settings & Customization

- **Persistent Settings & Prompt Customization**:
  - Securely store Azure DevOps/GitHub PATs, Confluence tokens, and project configurations locally.
  - Customise base prompts and check prompt complexity using Copilot check tool.
  - Local Copilot CLI dependency wizard to automatically manage CLI installations.
  - Monitors GitHub Copilot connection on startup, alerts the user with an interactive setup and troubleshooting overlay if credentials are not found, and displays a clickable connection status icon in the application footer.

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
