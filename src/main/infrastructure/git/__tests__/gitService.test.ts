/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GitService } from '../gitService';

let mockExec: any = null;

vi.mock('child_process', () => {
  return {
    exec: (cmd: string, options: any, cb?: any) => {
      let callback = cb;
      if (typeof options === 'function') {
        callback = options;
      }
      if (mockExec) {
        mockExec(cmd, options, callback);
      } else {
        callback(null, { stdout: '' });
      }
    },
  };
});

describe('GitService', () => {
  let gitService: GitService;
  const repoPath = '/mock/repo';

  beforeEach(() => {
    gitService = new GitService();
    mockExec = null;
  });

  describe('checkGitRepo', () => {
    it('should return true if rev-parse succeeds and returns true', async () => {
      mockExec = (cmd: string, options: any, cb: any) => {
        expect(cmd).toBe('git rev-parse --is-inside-work-tree');
        expect(options.cwd).toBe(repoPath);
        cb(null, { stdout: 'true\n' });
      };

      const result = await gitService.checkGitRepo(repoPath);
      expect(result).toBe(true);
    });

    it('should return false if rev-parse returns false or fails', async () => {
      mockExec = (cmd: string, options: any, cb: any) => {
        cb(new Error('not a git repo'), { stdout: '' });
      };

      const result = await gitService.checkGitRepo(repoPath);
      expect(result).toBe(false);
    });
  });

  describe('getRepoRoot', () => {
    it('should return repo root if show-toplevel succeeds', async () => {
      mockExec = (cmd: string, options: any, cb: any) => {
        expect(cmd).toBe('git rev-parse --show-toplevel');
        expect(options.cwd).toBe(repoPath);
        cb(null, { stdout: '/mock/repo-root\n' });
      };

      const result = await gitService.getRepoRoot(repoPath);
      expect(result).toBe('/mock/repo-root');
    });

    it('should return null if show-toplevel fails', async () => {
      mockExec = (cmd: string, options: any, cb: any) => {
        cb(new Error('failed'), { stdout: '' });
      };

      const result = await gitService.getRepoRoot(repoPath);
      expect(result).toBeNull();
    });
  });

  describe('getRemoteUrl', () => {
    it('should return origin remote URL', async () => {
      mockExec = (cmd: string, options: any, cb: any) => {
        expect(cmd).toBe('git config --get remote.origin.url');
        cb(null, { stdout: 'git@github.com:foo/bar.git\n' });
      };

      const result = await gitService.getRemoteUrl(repoPath);
      expect(result).toBe('git@github.com:foo/bar.git');
    });

    it('should return null on error', async () => {
      mockExec = (cmd: string, options: any, cb: any) => {
        cb(new Error('no remote origin'), { stdout: '' });
      };

      const result = await gitService.getRemoteUrl(repoPath);
      expect(result).toBeNull();
    });
  });

  describe('hasUncommittedChanges', () => {
    it('should return true if status --porcelain is non-empty', async () => {
      mockExec = (cmd: string, options: any, cb: any) => {
        expect(cmd).toBe('git status --porcelain');
        cb(null, { stdout: ' M src/index.ts\n' });
      };

      const result = await gitService.hasUncommittedChanges(repoPath);
      expect(result).toBe(true);
    });

    it('should return false if status --porcelain is empty', async () => {
      mockExec = (cmd: string, options: any, cb: any) => {
        cb(null, { stdout: '\n' });
      };

      const result = await gitService.hasUncommittedChanges(repoPath);
      expect(result).toBe(false);
    });
  });

  describe('fetchAndCheckoutPR', () => {
    it('should fetch merge ref first, and checkout on success', async () => {
      const calls: string[] = [];
      mockExec = (cmd: string, options: any, cb: any) => {
        calls.push(cmd);
        if (cmd.includes('git rev-parse')) {
          cb(null, { stdout: 'mock-commit-sha\n' });
        } else {
          cb(null, { stdout: '' });
        }
      };

      const sha = await gitService.fetchAndCheckoutPR(repoPath, 123);
      expect(sha).toBe('mock-commit-sha');
      expect(calls).toEqual([
        'git fetch origin refs/pull/123/merge',
        'git checkout FETCH_HEAD',
        'git rev-parse HEAD',
      ]);
    });

    it('should fallback to fetch head ref if merge ref fails', async () => {
      const calls: string[] = [];
      mockExec = (cmd: string, options: any, cb: any) => {
        calls.push(cmd);
        if (cmd.includes('refs/pull/123/merge')) {
          cb(new Error('no merge ref'), { stdout: '' });
        } else if (cmd.includes('git rev-parse')) {
          cb(null, { stdout: 'mock-commit-sha-head\n' });
        } else {
          cb(null, { stdout: '' });
        }
      };

      const sha = await gitService.fetchAndCheckoutPR(repoPath, 123);
      expect(sha).toBe('mock-commit-sha-head');
      expect(calls).toEqual([
        'git fetch origin refs/pull/123/merge',
        'git fetch origin refs/pull/123/head',
        'git checkout FETCH_HEAD',
        'git rev-parse HEAD',
      ]);
    });

    it('should throw an error if both refs fail', async () => {
      mockExec = (cmd: string, options: any, cb: any) => {
        cb(new Error('fail'), { stdout: '' });
      };

      await expect(
        gitService.fetchAndCheckoutPR(repoPath, 123),
      ).rejects.toThrow();
    });
  });

  describe('getDiffFiles', () => {
    it('should return parsed files with correct status (single parent)', async () => {
      mockExec = (cmd: string, options: any, cb: any) => {
        if (cmd.includes('git log')) {
          cb(null, { stdout: 'parent1\n' });
        } else if (cmd.includes('git diff')) {
          expect(cmd).toBe('git diff --name-status main...HEAD');
          cb(null, {
            stdout:
              'A\tfile1.txt\nM\tfile2.txt\nD\tfile3.txt\nR100\told.txt\tnew.txt\nT\ttypechange.txt\n',
          });
        }
      };

      const result = await gitService.getDiffFiles(repoPath, 'main');
      expect(result).toEqual([
        { path: 'file1.txt', status: 'added' },
        { path: 'file2.txt', status: 'modified' },
        { path: 'file3.txt', status: 'deleted' },
        { path: 'new.txt', status: 'renamed' },
        { path: 'typechange.txt', status: 'type_changed' },
      ]);
    });

    it('should use HEAD~1 for diffing if HEAD is a merge commit (multiple parents)', async () => {
      mockExec = (cmd: string, options: any, cb: any) => {
        if (cmd.includes('git log')) {
          cb(null, { stdout: 'parent1 parent2\n' });
        } else if (cmd.includes('git diff')) {
          expect(cmd).toBe('git diff --name-status HEAD~1...HEAD');
          cb(null, {
            stdout: 'M\tfile1.txt\n',
          });
        }
      };

      const result = await gitService.getDiffFiles(repoPath, 'main');
      expect(result).toEqual([{ path: 'file1.txt', status: 'modified' }]);
    });
  });

  describe('getFileDiff', () => {
    it('should return diff text (single parent)', async () => {
      mockExec = (cmd: string, options: any, cb: any) => {
        if (cmd.includes('git log')) {
          cb(null, { stdout: 'parent1\n' });
        } else if (cmd.includes('git diff')) {
          expect(cmd).toBe('git diff main...HEAD -- "file1.txt"');
          cb(null, { stdout: 'some-diff-text\n' });
        }
      };

      const result = await gitService.getFileDiff(
        repoPath,
        'main',
        'file1.txt',
      );
      expect(result).toBe('some-diff-text');
    });

    it('should return diff text against HEAD~1 (multiple parents)', async () => {
      mockExec = (cmd: string, options: any, cb: any) => {
        if (cmd.includes('git log')) {
          cb(null, { stdout: 'parent1 parent2\n' });
        } else if (cmd.includes('git diff')) {
          expect(cmd).toBe('git diff HEAD~1...HEAD -- "file1.txt"');
          cb(null, { stdout: 'merge-diff-text\n' });
        }
      };

      const result = await gitService.getFileDiff(
        repoPath,
        'main',
        'file1.txt',
      );
      expect(result).toBe('merge-diff-text');
    });
  });

  describe('getCurrentRef', () => {
    it('should return branch name if symbolic-ref succeeds', async () => {
      mockExec = (cmd: string, options: any, cb: any) => {
        expect(cmd).toBe('git symbolic-ref --short -q HEAD');
        cb(null, { stdout: 'feature/pr-reviewer\n' });
      };

      const ref = await gitService.getCurrentRef(repoPath);
      expect(ref).toBe('feature/pr-reviewer');
    });

    it('should return commit SHA if symbolic-ref fails', async () => {
      let isFirstCall = true;
      mockExec = (cmd: string, options: any, cb: any) => {
        if (isFirstCall) {
          expect(cmd).toBe('git symbolic-ref --short -q HEAD');
          isFirstCall = false;
          cb(new Error('not on a branch'), { stdout: '' });
        } else {
          expect(cmd).toBe('git rev-parse HEAD');
          cb(null, { stdout: 'mock-commit-sha\n' });
        }
      };

      const ref = await gitService.getCurrentRef(repoPath);
      expect(ref).toBe('mock-commit-sha');
    });
  });

  describe('restoreRef', () => {
    it('should throw error if repository has uncommitted changes', async () => {
      mockExec = (cmd: string, options: any, cb: any) => {
        expect(cmd).toBe('git status --porcelain');
        cb(null, { stdout: ' M src/index.ts\n' });
      };

      await expect(gitService.restoreRef(repoPath, 'master')).rejects.toThrow(
        'Cannot restore repository because it has uncommitted changes.',
      );
    });

    it('should check out ref if repository is clean', async () => {
      const calls: string[] = [];
      mockExec = (cmd: string, options: any, cb: any) => {
        calls.push(cmd);
        cb(null, { stdout: '' });
      };

      await gitService.restoreRef(repoPath, 'master');
      expect(calls).toEqual(['git status --porcelain', 'git checkout master']);
    });
  });
});
