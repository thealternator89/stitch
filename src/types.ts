export type AppSettings = {
  version?: number;
  featureType?: string;
  storyType?: string;
  azureOrg?: string;
  azureProject?: string;
  azurePat?: string;
  copilotToken?: string;
  copilotModel?: string;
  confluenceUrl?: string;
  confluenceUser?: string;
  confluenceToken?: string;
  theme?: 'auto' | 'light' | 'dark';
  gitWorktreeEnabled?: boolean;
  gitWorktreeBaseDir?: string;
  maxParallelism?: number;
  prompts?: {
    storyWriter?: {
      general?: string;
      title?: string;
      description?: string;
      acceptanceCriteria?: string;
      notes?: string;
    };
    testCaseWriter?: {
      general?: string;
      id?: string;
      description?: string;
      preConditions?: string;
      steps?: string;
      expectedResult?: string;
    };
    storyElaborator?: {
      general?: string;
    };
  };
};

export interface TicketData {
  id?: string;
  title: string;
  description: string;
  acceptanceCriteria?: string;
}

export interface DocPageData {
  id: string;
  title: string;
  body: string;
}

export interface StoryData {
  title: string;
  description: string;
  acceptanceCriteria: string;
  notes?: string;
}

export interface CopilotAuth {
  authStatus?: {
    isAuthenticated: boolean;
    login: string;
    authType: string;
    statusMessage: string;
  };
  status?: {
    version: string;
    protocolVersion: string;
  };
  error: string;
}

export interface CopilotModel {
  id: string;
  name: string;
  billing: { multiplier: number };
}

export interface UpdateStatus {
  isUpdated: boolean;
  previousVersion?: string;
  currentVersion: string;
}

export interface EnvironmentCheckResult {
  success: boolean;
  nodePath: string | null;
  nodeVersion: string | null;
  minRequiredVersion: number;
  errorType:
    | 'NODE_NOT_FOUND'
    | 'NODE_VERSION_TOO_LOW'
    | 'COPILOT_CLI_MISSING'
    | 'COPILOT_CLI_OUTDATED'
    | null;
  message: string | null;
  requiredCopilotVersion?: string;
  installedCopilotVersion?: string;
}

export interface PRMetadata {
  id: string;
  title: string;
  description: string;
  sourceBranch: string;
  targetBranch: string;
  author?: string;
  repositoryName: string;
  repositoryId?: string;
  hostType: 'azure' | 'unknown';
  url?: string;
}

export interface PRDiffFile {
  path: string;
  status:
    'added' | 'modified' | 'deleted' | 'renamed' | 'type_changed' | 'unknown';
}

export interface PRCheckoutResult {
  success: boolean;
  commitSha?: string;
  targetBranch: string;
  sourceBranch: string;
  error?: string;
}

export interface ReviewPhase {
  id: string;
  title: string;
  group?: string;
  include?: string | string[];
  exclude?: string | string[];
  attach?: string;
  body: string;
  template?: string;
  templateError?: string;
}
