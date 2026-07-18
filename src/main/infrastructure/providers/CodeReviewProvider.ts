import { PRMetadata } from '../../../types';

export interface CodeReviewProvider {
  parsePRUrl(url: string): {
    org: string;
    project: string;
    repoName: string;
    prNumber: number;
  } | null;

  parseRemoteUrl(url: string): {
    org: string;
    project: string;
    repoName: string;
  } | null;

  getPRDetails(
    repoPath: string,
    prUrlOrId: string,
    remoteUrl?: string | null,
  ): Promise<PRMetadata>;

  getProjectPRs(
    searchType: 'assigned' | 'created' | 'all',
  ): Promise<PRMetadata[]>;

  getLinkedTickets(prId: string, repositoryId?: string): Promise<string[]>;

  postPRComment(
    repoPath: string,
    prUrlOrId: string,
    comment: {
      type: 'general' | 'line';
      file?: string;
      line?: number;
      comment: string;
      edited?: boolean;
    },
    remoteUrl?: string | null,
  ): Promise<void>;
}
