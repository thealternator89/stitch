import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';

interface GeneralSettingsProps {
  theme: 'auto' | 'light' | 'dark';
  setTheme: (theme: 'auto' | 'light' | 'dark') => void;
  gitWorktreeEnabled: boolean;
  setGitWorktreeEnabled: (enabled: boolean) => void;
  gitWorktreeBaseDir: string;
  setGitWorktreeBaseDir: (dir: string) => void;
  maxParallelism: number;
  setMaxParallelism: (limit: number) => void;
  cpuCount: number;
}

const GeneralSettings: React.FC<GeneralSettingsProps> = ({
  theme,
  setTheme,
  gitWorktreeEnabled,
  setGitWorktreeEnabled,
  gitWorktreeBaseDir,
  setGitWorktreeBaseDir,
  maxParallelism,
  setMaxParallelism,
  cpuCount,
}) => {
  const [hasWorktrees, setHasWorktrees] = useState(false);
  const [worktreeCount, setWorktreeCount] = useState(0);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isCleaning, setIsCleaning] = useState(false);
  const [cleanupResult, setCleanupResult] = useState<{
    success: boolean;
    count: number;
    error?: string;
  } | null>(null);

  useEffect(() => {
    let active = true;
    const check = async () => {
      if (!gitWorktreeBaseDir) {
        setHasWorktrees(false);
        setWorktreeCount(0);
        return;
      }
      try {
        const result =
          await window.electronAPI.checkWorktrees(gitWorktreeBaseDir);
        if (active) {
          setHasWorktrees(result.hasWorktrees);
          setWorktreeCount(result.worktreeCount);
        }
      } catch (err) {
        console.error('Error checking worktrees:', err);
        if (active) {
          setHasWorktrees(false);
          setWorktreeCount(0);
        }
      }
    };
    check();
    return () => {
      active = false;
    };
  }, [gitWorktreeBaseDir]);

  const handleCleanWorktrees = async () => {
    try {
      setIsCleaning(true);
      const result =
        await window.electronAPI.cleanWorktrees(gitWorktreeBaseDir);
      setCleanupResult({
        success: result.success,
        count: result.cleanedCount,
        error: result.errors?.join('\n'),
      });
      const checkResult =
        await window.electronAPI.checkWorktrees(gitWorktreeBaseDir);
      setHasWorktrees(checkResult.hasWorktrees);
      setWorktreeCount(checkResult.worktreeCount);
    } catch (err) {
      console.error('Failed to clean worktrees:', err);
      const errMsg = err instanceof Error ? err.message : String(err);
      setCleanupResult({
        success: false,
        count: 0,
        error: errMsg,
      });
    } finally {
      setIsCleaning(false);
      setShowConfirmModal(false);
    }
  };

  return (
    <>
      <div className="card shadow-sm border-0 bg-body-tertiary">
        <div className="card-body p-4">
          <h5 className="mb-4 border-bottom pb-2">
            <i className="fas fa-palette me-2 text-primary"></i>Appearance
            Settings
          </h5>

          <div className="mb-4 border-bottom pb-4">
            <label className="form-label d-block fw-semibold text-muted small uppercase tracking-wider mb-3">
              Interface Theme
            </label>
            <p className="text-muted small mb-3">
              Choose how Stitch appears. Selecting "Auto" will sync with your
              system theme settings.
            </p>
            <div
              className="btn-group"
              role="group"
              aria-label="Theme selection"
            >
              <button
                type="button"
                className={`btn px-4 py-2 d-flex align-items-center gap-2 ${theme === 'auto' ? 'btn-primary' : 'btn-outline-secondary'}`}
                onClick={() => setTheme('auto')}
              >
                <i className="fas fa-circle-half-stroke"></i>
                Auto
              </button>
              <button
                type="button"
                className={`btn px-4 py-2 d-flex align-items-center gap-2 ${theme === 'light' ? 'btn-primary' : 'btn-outline-secondary'}`}
                onClick={() => setTheme('light')}
              >
                <i className="fas fa-sun"></i>
                Light
              </button>
              <button
                type="button"
                className={`btn px-4 py-2 d-flex align-items-center gap-2 ${theme === 'dark' ? 'btn-primary' : 'btn-outline-secondary'}`}
                onClick={() => setTheme('dark')}
              >
                <i className="fas fa-moon"></i>
                Dark
              </button>
            </div>
          </div>

          <h5 className="mb-4 mt-4 border-bottom pb-2">
            <i className="fas fa-code-branch me-2 text-primary"></i>Git Worktree
            Settings
          </h5>

          <div className="mb-4">
            <div className="form-check form-switch mb-3">
              <input
                className="form-check-input"
                type="checkbox"
                id="gitWorktreeEnabled"
                checked={gitWorktreeEnabled}
                onChange={(e) => setGitWorktreeEnabled(e.target.checked)}
              />
              <label
                className="form-check-label fw-semibold"
                htmlFor="gitWorktreeEnabled"
              >
                Enable Git Worktree Support
              </label>
            </div>
            <p className="text-muted small mb-3">
              When enabled, Stitch will create a separate git worktree for
              repository tasks (such as checking out pull requests or
              elaborating stories). This avoids dirtying or modifying your
              primary working directory.
            </p>
          </div>

          {gitWorktreeEnabled && (
            <div className="mb-3">
              <label className="form-label fw-semibold text-muted small uppercase tracking-wider mb-2">
                Worktree Base Directory
              </label>
              <div className="input-group">
                <input
                  type="text"
                  className="form-control"
                  placeholder="Select a directory to store worktrees..."
                  value={gitWorktreeBaseDir}
                  onChange={(e) => setGitWorktreeBaseDir(e.target.value)}
                />
                <button
                  className="btn btn-outline-secondary"
                  type="button"
                  onClick={async () => {
                    try {
                      const path = await window.electronAPI.selectDirectory();
                      if (path) {
                        setGitWorktreeBaseDir(path);
                      }
                    } catch (err) {
                      console.error(
                        'Failed to select worktree directory:',
                        err,
                      );
                    }
                  }}
                >
                  Browse...
                </button>
              </div>
              <p className="text-muted small mt-2 mb-3">
                Stitch will create temporary directories under this base
                directory for each worktree task.
              </p>

              <div className="d-flex align-items-center gap-3">
                <button
                  type="button"
                  className="btn btn-outline-danger d-flex align-items-center gap-2"
                  disabled={!hasWorktrees || isCleaning}
                  onClick={() => {
                    setCleanupResult(null);
                    setShowConfirmModal(true);
                  }}
                >
                  <i className="fas fa-trash-can"></i>
                  Clean Up
                </button>
                <span className="text-muted small">
                  {hasWorktrees
                    ? `Found ${worktreeCount} directory${worktreeCount > 1 ? 's' : ''} to clean up.`
                    : 'Nothing to clean up'}
                </span>
              </div>

              {cleanupResult && (
                <div
                  className={`alert ${cleanupResult.success ? 'alert-success' : 'alert-danger'} mt-3 mb-0 small p-2 w-100`}
                  style={{ whiteSpace: 'pre-wrap' }}
                >
                  {cleanupResult.success
                    ? `Successfully cleaned up ${cleanupResult.count} worktree directory(s).`
                    : `Cleaned up ${cleanupResult.count} directory(s) with errors:\n${cleanupResult.error}`}
                </div>
              )}
            </div>
          )}

          <h5 className="mb-4 mt-4 border-bottom pb-2">
            <i className="fas fa-microchip me-2 text-primary"></i>PR Reviewer
            Concurrency Settings
          </h5>

          <div className="mb-2">
            <label className="form-label d-block fw-semibold text-muted small uppercase tracking-wider mb-2">
              Default Review Agent Parallelism
            </label>
            <p className="text-muted small mb-3">
              Configure how many parallel GitHub Copilot agents can run reviews
              concurrently.
            </p>
            {cpuCount < 4 ? (
              <div className="alert alert-info py-2 px-3 shadow-sm border-0 bg-info-subtle text-info-emphasis small d-flex align-items-center gap-2">
                <i className="fas fa-circle-info"></i>
                <span>
                  Parallelism is locked to <strong>1</strong> because your
                  system has <strong>{cpuCount} CPU cores</strong> (fewer than 4
                  required for parallel agents).
                </span>
              </div>
            ) : (
              <div>
                <div className="d-flex align-items-center gap-3">
                  <input
                    type="range"
                    className="form-range flex-grow-0"
                    min="1"
                    max={cpuCount - 2}
                    value={maxParallelism}
                    onChange={(e) =>
                      setMaxParallelism(parseInt(e.target.value))
                    }
                    style={{ maxWidth: '300px' }}
                  />
                  <span className="badge bg-primary fs-6 px-3 py-2">
                    {maxParallelism} Worker{maxParallelism > 1 ? 's' : ''}
                  </span>
                </div>
                <p className="text-muted small mt-2 mb-0">
                  Allowing between 1 and {cpuCount - 2} parallel agents (Total
                  CPU cores: {cpuCount}).
                </p>
              </div>
            )}
          </div>

          <h5 className="mb-4 mt-4 border-bottom pb-2">
            <i className="fas fa-bell me-2 text-primary"></i>Notification
            Settings
          </h5>

          <div className="mb-2">
            <p className="text-muted small mb-3">
              Test native OS notifications to verify they are enabled and
              working correctly.
            </p>
            <button
              type="button"
              className="btn btn-outline-primary d-flex align-items-center gap-2"
              onClick={() => {
                setTimeout(() => {
                  window.electronAPI
                    .showNotification(
                      'Stitch Test Notification',
                      'This is a test notification from Stitch! Click here to focus.',
                    )
                    .catch((err) => {
                      console.error('Failed to send test notification:', err);
                    });
                }, 3000);
              }}
            >
              <i className="fas fa-paper-plane"></i>
              Send Test Notification (3s delay)
            </button>
            <p className="text-muted small mt-2 mb-0">
              Click the button, then minimize or focus away from Stitch within 3
              seconds to test.
            </p>
          </div>
        </div>
      </div>

      {showConfirmModal &&
        createPortal(
          <div className="env-error-overlay" style={{ zIndex: 3000 }}>
            <div className="env-error-modal" style={{ maxWidth: '550px' }}>
              <div className="text-danger mb-3" style={{ fontSize: '3rem' }}>
                <i className="fas fa-exclamation-triangle"></i>
              </div>
              <h4 className="fw-bold mb-3">Clean Up Git Worktrees</h4>
              <div className="alert alert-danger w-100 text-start mb-3">
                <h6 className="fw-bold">
                  <i className="fas fa-circle-exclamation me-2"></i>Strong
                  Warning:
                </h6>
                <p className="mb-0 small">
                  Please ensure no code reviews are actively running in any
                  other instance of Stitch before proceeding. Force-removing
                  worktrees that are currently in use could corrupt repositories
                  or cause active reviews to fail.
                </p>
              </div>
              <p className="mb-4 text-muted">
                This will remove all subdirectories under{' '}
                <code>{gitWorktreeBaseDir}</code> and clear their Git worktree
                registrations. Are you sure?
              </p>
              <div className="d-flex gap-3 w-100 justify-content-center">
                <button
                  type="button"
                  className="btn btn-secondary px-4"
                  disabled={isCleaning}
                  onClick={() => setShowConfirmModal(false)}
                >
                  No
                </button>
                <button
                  type="button"
                  className="btn btn-danger px-4 d-flex align-items-center gap-2"
                  disabled={isCleaning}
                  onClick={handleCleanWorktrees}
                >
                  {isCleaning && (
                    <span
                      className="spinner-border spinner-border-sm"
                      role="status"
                      aria-hidden="true"
                    ></span>
                  )}
                  Yes
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
};

export default GeneralSettings;
