import { exec } from 'child_process';
import { promisify } from 'util';
import { PRDiffFile } from '../../../types';

const execPromise = promisify(exec);

export class GitService {
  async runCommand(repoPath: string, command: string): Promise<string> {
    const { stdout } = await execPromise(command, { cwd: repoPath });
    return stdout.trim();
  }

  async checkGitRepo(repoPath: string): Promise<boolean> {
    try {
      const isInside = await this.runCommand(
        repoPath,
        'git rev-parse --is-inside-work-tree',
      );
      return isInside === 'true';
    } catch {
      return false;
    }
  }

  async getRepoRoot(repoPath: string): Promise<string | null> {
    try {
      return await this.runCommand(repoPath, 'git rev-parse --show-toplevel');
    } catch {
      return null;
    }
  }

  async getRemoteUrl(repoPath: string): Promise<string | null> {
    try {
      return await this.runCommand(
        repoPath,
        'git config --get remote.origin.url',
      );
    } catch {
      return null;
    }
  }

  async hasUncommittedChanges(repoPath: string): Promise<boolean> {
    try {
      const status = await this.runCommand(repoPath, 'git status --porcelain');
      return status.length > 0;
    } catch {
      return false;
    }
  }

  async fetchAndCheckoutPR(
    repoPath: string,
    prNumber: number,
  ): Promise<string> {
    // Fetch the pull request merge branch from refs/pull/{prNumber}/merge
    // Checkout to FETCH_HEAD (detached HEAD)
    try {
      await this.runCommand(
        repoPath,
        `git fetch origin refs/pull/${prNumber}/merge`,
      );
      await this.runCommand(repoPath, 'git checkout FETCH_HEAD');

      const commitSha = await this.runCommand(repoPath, 'git rev-parse HEAD');
      return commitSha;
    } catch (error: unknown) {
      // Fallback: Try refs/pull/{prNumber}/head or refs/heads/pull/{prNumber}/head depending on configuration
      try {
        await this.runCommand(
          repoPath,
          `git fetch origin refs/pull/${prNumber}/head`,
        );
        await this.runCommand(repoPath, 'git checkout FETCH_HEAD');
        const commitSha = await this.runCommand(repoPath, 'git rev-parse HEAD');
        return commitSha;
      } catch (_fallbackError: unknown) {
        const errMsg = error instanceof Error ? error.message : String(error);
        throw new Error(
          `Failed to fetch and checkout PR #${prNumber}: ${errMsg}`,
        );
      }
    }
  }

  async getDiffTarget(repoPath: string, targetBranch: string): Promise<string> {
    try {
      const parents = await this.runCommand(
        repoPath,
        'git log -1 --format="%P" HEAD',
      );
      const parentList = parents.trim().split(/\s+/).filter(Boolean);
      if (parentList.length > 1) {
        return 'HEAD~1';
      }
    } catch {
      // Fallback to targetBranch
    }
    return targetBranch;
  }

  async getDiffFiles(
    repoPath: string,
    targetBranch: string,
  ): Promise<PRDiffFile[]> {
    try {
      const diffTarget = await this.getDiffTarget(repoPath, targetBranch);
      const output = await this.runCommand(
        repoPath,
        `git diff --name-status ${diffTarget}...HEAD`,
      );
      if (!output) {
        return [];
      }

      const lines = output.split('\n');
      const files: PRDiffFile[] = [];

      for (const line of lines) {
        const parts = line.split('\t');
        if (parts.length < 2) continue;

        const rawStatus = parts[0];
        let status: PRDiffFile['status'] = 'unknown';
        let filePath = parts[1];

        if (rawStatus.startsWith('A')) {
          status = 'added';
        } else if (rawStatus.startsWith('D')) {
          status = 'deleted';
        } else if (rawStatus.startsWith('M')) {
          status = 'modified';
        } else if (rawStatus.startsWith('R')) {
          status = 'renamed';
          filePath = parts[2] || parts[1];
        } else if (rawStatus.startsWith('T')) {
          status = 'type_changed';
        }

        files.push({ path: filePath, status });
      }

      return files;
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Failed to get diff files against ${targetBranch}: ${errMsg}`,
      );
    }
  }

  async getFileDiff(
    repoPath: string,
    targetBranch: string,
    filePath: string,
  ): Promise<string> {
    try {
      const diffTarget = await this.getDiffTarget(repoPath, targetBranch);
      return await this.runCommand(
        repoPath,
        `git diff ${diffTarget}...HEAD -- "${filePath}"`,
      );
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to get file diff for ${filePath}: ${errMsg}`);
    }
  }
}
