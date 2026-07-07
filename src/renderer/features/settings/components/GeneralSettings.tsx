import React from 'react';

interface GeneralSettingsProps {
  theme: 'auto' | 'light' | 'dark';
  setTheme: (theme: 'auto' | 'light' | 'dark') => void;
  gitWorktreeEnabled: boolean;
  setGitWorktreeEnabled: (enabled: boolean) => void;
  gitWorktreeBaseDir: string;
  setGitWorktreeBaseDir: (dir: string) => void;
}

const GeneralSettings: React.FC<GeneralSettingsProps> = ({
  theme,
  setTheme,
  gitWorktreeEnabled,
  setGitWorktreeEnabled,
  gitWorktreeBaseDir,
  setGitWorktreeBaseDir,
}) => {
  return (
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
            macOS system theme settings.
          </p>
          <div className="btn-group" role="group" aria-label="Theme selection">
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
              Enable Git Worktree for PR Reviews
            </label>
          </div>
          <p className="text-muted small mb-3">
            When enabled, Stitch will create a separate git worktree for
            checking out the PR. This avoids dirtying or modifying your local
            working directory during review.
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
                    console.error('Failed to select worktree directory:', err);
                  }
                }}
              >
                Browse...
              </button>
            </div>
            <p className="text-muted small mt-2 mb-0">
              Stitch will create temporary directories under this base directory
              for each PR review.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default GeneralSettings;
