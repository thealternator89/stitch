export type AppSettings = {
  azureOrg?: string;
  azureProject?: string;
  azurePat?: string;
  copilotToken?: string;
  copilotModel?: string;
  confluenceUrl?: string;
  confluenceUser?: string;
  confluenceToken?: string;
  theme?: 'auto' | 'light' | 'dark';
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
