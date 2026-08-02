import React, { useEffect, useState, useCallback } from 'react';
import { HashRouter as Router, Routes, Route } from 'react-router-dom';
import Menu from './features/menu/Menu';
import TestCaseWriter from './features/test-case-writer/TestCaseWriter';
import StoryWriter from './features/story-writer/StoryWriter';
import StoryElaborator from './features/story-elaborator/StoryElaborator';
import PRReviewer from './features/pr-reviewer/PRReviewer';
import TShirtEstimator from './features/tshirt-estimator/TShirtEstimator';
import Settings from './features/settings/components/Settings';
import UsageHistory from './features/history/UsageHistory';
import { TimeoutProvider } from './context/TimeoutContext';
import { UpdateStatus, EnvironmentCheckResult, CopilotAuth } from '../types';

function repoUrl(suffix: string): string {
  return 'https://github.com/thealternator89/stitch/' + suffix;
}

const App: React.FC = () => {
  const [version, setVersion] = useState<string>('');
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null);
  const [envCheckResult, setEnvCheckResult] =
    useState<EnvironmentCheckResult | null>(null);
  const [installStatus, setInstallStatus] = useState<
    'idle' | 'installing' | 'success' | 'error'
  >('idle');
  const [installError, setInstallError] = useState<string | null>(null);
  const [authCheckResult, setAuthCheckResult] = useState<CopilotAuth | null>(
    null,
  );
  const [checkingAuth, setCheckingAuth] = useState<boolean>(false);
  const [authModalDismissed, setAuthModalDismissed] = useState<boolean>(false);

  const runAuthCheck = useCallback(async () => {
    setCheckingAuth(true);
    try {
      const res = await window.electronAPI.checkCopilotAuth();
      setAuthCheckResult(res);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      setAuthCheckResult({
        error: errMsg || 'Unknown authentication check error',
      });
    } finally {
      setCheckingAuth(false);
    }
  }, []);

  const handleInstallCopilot = async () => {
    setInstallStatus('installing');
    setInstallError(null);
    try {
      const res = await window.electronAPI.installCopilotCli();
      if (res.success) {
        setInstallStatus('success');
        setTimeout(async () => {
          try {
            const result = await window.electronAPI.checkEnvironment();
            if (result.success) {
              setEnvCheckResult(null);
              await runAuthCheck();
            } else {
              setEnvCheckResult(result);
            }
          } catch (err) {
            console.error(
              'Failed to run environment check after install:',
              err,
            );
          }
          setInstallStatus('idle');
        }, 1500);
      } else {
        setInstallStatus('error');
        setInstallError(res.error || 'Unknown error occurred.');
      }
    } catch (err: unknown) {
      setInstallStatus('error');
      const errMsg = err instanceof Error ? err.message : String(err);
      setInstallError(
        errMsg || 'An error occurred during installer execution.',
      );
    }
  };

  useEffect(() => {
    const runEnvCheck = async () => {
      try {
        const result = await window.electronAPI.checkEnvironment();
        if (!result.success) {
          setEnvCheckResult(result);
        } else {
          await runAuthCheck();
        }
      } catch (err) {
        console.error('Failed to run environment check:', err);
      }
    };
    runEnvCheck();
  }, [runAuthCheck]);

  useEffect(() => {
    const fetchVersionAndStatus = async () => {
      try {
        const status = await window.electronAPI.getVersionStatus();
        setVersion(status.currentVersion);
        if (status.isUpdated) {
          setUpdateStatus(status);
        }
      } catch (err) {
        console.error('Failed to initialize app version and status:', err);
      }
    };
    fetchVersionAndStatus();
  }, []);

  const handleCloseToast = () => {
    setUpdateStatus(null);
  };

  const handleOpenChangelog = async () => {
    if (!updateStatus) return;
    const ver = updateStatus.currentVersion;
    setUpdateStatus(null);
    try {
      await window.electronAPI.openExternal(repoUrl(`releases/tag/v${ver}`));
    } catch (err) {
      console.error('Failed to open changelog:', err);
    }
  };

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const updateTheme = () => {
      document.documentElement.setAttribute(
        'data-bs-theme',
        mediaQuery.matches ? 'dark' : 'light',
      );
    };

    updateTheme();
    mediaQuery.addEventListener('change', updateTheme);
    return () => mediaQuery.removeEventListener('change', updateTheme);
  }, []);

  const handleOpenIssues = (e: React.MouseEvent) => {
    e.preventDefault();
    window.electronAPI.openExternal(repoUrl('issues'));
  };

  const isWindows = window.electronAPI.isWindows;

  return (
    <TimeoutProvider>
      <Router>
        <div className={`titlebar shadow-sm ${isWindows ? 'is-windows' : ''}`}>
          <span className="titlebar-content">
            <i className="fas fa-code-merge me-2 text-primary"></i>
            Stitch
          </span>
          <div className="titlebar-actions no-drag">
            <button
              className="btn btn-outline-light btn-sm titlebar-btn"
              onClick={handleOpenIssues}
              title="Report an Issue"
            >
              <i className="fas fa-bug"></i>
            </button>
          </div>
        </div>

        <div className="main-content">
          <Routes>
            <Route
              path="/"
              element={
                <Menu
                  updateStatus={updateStatus}
                  onCloseToast={handleCloseToast}
                  onOpenChangelog={handleOpenChangelog}
                />
              }
            />
            <Route path="/test-case-writer" element={<TestCaseWriter />} />
            <Route path="/story-writer" element={<StoryWriter />} />
            <Route path="/story-elaborator" element={<StoryElaborator />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/pr-reviewer" element={<PRReviewer />} />
            <Route path="/tshirt-estimator" element={<TShirtEstimator />} />
            <Route path="/history" element={<UsageHistory />} />
          </Routes>
        </div>

        <div className="footer">
          <div className="me-auto d-flex align-items-center">
            <button
              className="btn btn-link p-0 border-0 d-flex align-items-center text-decoration-none no-drag"
              onClick={runAuthCheck}
              disabled={checkingAuth}
              title={
                checkingAuth
                  ? 'Checking authentication status...'
                  : authCheckResult &&
                      authCheckResult.authStatus?.isAuthenticated
                    ? `Authenticated as ${authCheckResult.authStatus.login}`
                    : 'Not authenticated with GitHub Copilot. Click to re-check.'
              }
              style={{
                fontSize: '11px',
                color: 'inherit',
                textDecoration: 'none',
              }}
            >
              <i
                className={`fab fa-github me-1 ${
                  checkingAuth
                    ? 'fa-spin text-muted'
                    : authCheckResult &&
                        authCheckResult.authStatus?.isAuthenticated
                      ? 'text-success'
                      : 'text-warning'
                }`}
              ></i>
              <span className="small">
                {checkingAuth
                  ? 'Checking Auth...'
                  : authCheckResult &&
                      authCheckResult.authStatus?.isAuthenticated
                    ? 'Copilot Connected'
                    : 'Copilot Disconnected'}
              </span>
            </button>
          </div>
          <span className="me-2 text-muted">Version {version}</span>
        </div>

        {envCheckResult && (
          <div className="env-error-overlay">
            {envCheckResult.errorType === 'NODE_NOT_FOUND' ||
            envCheckResult.errorType === 'NODE_VERSION_TOO_LOW' ? (
              <div className="env-error-modal">
                <div className="env-error-icon">
                  <i className="fas fa-exclamation-triangle"></i>
                </div>
                <h4 className="env-error-title">Node.js Upgrade Required</h4>
                <p className="env-error-message text-center">
                  {envCheckResult.message}
                </p>
                <div className="env-error-details">
                  Stitch requires Node.js v{envCheckResult.minRequiredVersion}{' '}
                  or above to communicate with the GitHub Copilot CLI safely and
                  reliably. Please install the latest LTS version of Node.js and
                  restart the application.
                </div>
                <div className="env-error-actions">
                  <button
                    className="btn btn-indigo btn-lg"
                    onClick={async () => {
                      await window.electronAPI.openExternal(
                        'https://nodejs.org/',
                      );
                    }}
                  >
                    <i className="fas fa-download me-2"></i>
                    Download Node.js
                  </button>
                </div>
              </div>
            ) : (
              <div className="env-error-modal">
                {installStatus === 'idle' && (
                  <>
                    <div className="env-error-icon info">
                      <i className="fas fa-cloud-download-alt"></i>
                    </div>
                    <h4 className="env-error-title">
                      {envCheckResult.errorType === 'COPILOT_CLI_OUTDATED'
                        ? 'Update Required'
                        : 'Setup Required'}
                    </h4>
                    <p className="env-error-message text-center">
                      {envCheckResult.errorType === 'COPILOT_CLI_OUTDATED'
                        ? 'Stitch needs to update its internal copy of GitHub Copilot CLI.'
                        : 'Stitch needs to install an internal copy of GitHub Copilot CLI.'}
                    </p>
                    <div className="env-error-details">
                      This process is automated. We will set up this dependency
                      securely within the application data directory.
                    </div>
                    <div className="env-error-actions">
                      <button
                        className="btn btn-indigo btn-lg"
                        onClick={handleInstallCopilot}
                      >
                        <i className="fas fa-tools me-2"></i>
                        {envCheckResult.errorType === 'COPILOT_CLI_OUTDATED'
                          ? 'Update CLI'
                          : 'Install CLI'}
                      </button>
                    </div>
                  </>
                )}
                {installStatus === 'installing' && (
                  <>
                    <div className="env-error-icon info">
                      <i className="fas fa-circle-notch fa-spin"></i>
                    </div>
                    <h4 className="env-error-title">Installing Dependency</h4>
                    <p className="env-error-message text-center">
                      Downloading and setting up the internal GitHub Copilot
                      CLI...
                    </p>
                    <div className="env-error-details">
                      This may take a moment. Please keep the application
                      running.
                    </div>
                  </>
                )}
                {installStatus === 'success' && (
                  <>
                    <div className="env-error-icon success">
                      <i className="fas fa-check-circle"></i>
                    </div>
                    <h4 className="env-error-title">Installation Complete</h4>
                    <p className="env-error-message text-center">
                      GitHub Copilot CLI was successfully installed.
                    </p>
                    <div className="env-error-details">
                      Verifying setup and loading Stitch dashboard...
                    </div>
                  </>
                )}
                {installStatus === 'error' && (
                  <>
                    <div className="env-error-icon">
                      <i className="fas fa-exclamation-triangle"></i>
                    </div>
                    <h4 className="env-error-title">Installation Failed</h4>
                    <p className="env-error-message text-center text-danger">
                      {installError || 'An unexpected error occurred.'}
                    </p>
                    <div className="env-error-details">
                      Please make sure you have an active internet connection
                      and that Node.js is configured correctly.
                    </div>
                    <div className="env-error-actions">
                      <button
                        className="btn btn-indigo btn-lg"
                        onClick={handleInstallCopilot}
                      >
                        <i className="fas fa-redo me-2"></i>
                        Retry Installation
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {!envCheckResult &&
          authCheckResult &&
          (!authCheckResult.authStatus?.isAuthenticated ||
            authCheckResult.error) &&
          !authModalDismissed && (
            <div className="env-error-overlay">
              <div className="env-error-modal">
                <div className="env-error-icon info">
                  <i className="fas fa-lock"></i>
                </div>
                <h4 className="env-error-title">
                  GitHub Copilot Authentication Required
                </h4>
                <p className="env-error-message text-center">
                  Stitch requires GitHub Copilot to function, but no active
                  authentication session was found.
                </p>
                <div className="env-error-details w-100">
                  Please open your terminal and authenticate using one of the
                  following commands:
                  <div className="mt-2 font-monospace bg-body-secondary text-body p-2 rounded small border text-center">
                    <code>copilot auth signin</code>
                  </div>
                  <div className="text-muted text-center my-1 small">or</div>
                  <div className="font-monospace bg-body-secondary text-body p-2 rounded small border text-center">
                    <code>gh auth login</code>
                  </div>
                  <div className="mt-3 text-muted">
                    If you are using an API key/token instead, click{' '}
                    <strong>Close</strong> to proceed and configure it under{' '}
                    <strong>Settings &gt; Copilot</strong>.
                  </div>
                </div>
                <div className="env-error-actions">
                  <div className="d-flex gap-2 w-100">
                    <button
                      className="btn btn-indigo flex-grow-1"
                      onClick={runAuthCheck}
                      disabled={checkingAuth}
                    >
                      {checkingAuth ? (
                        <>
                          <span
                            className="spinner-border spinner-border-sm me-2"
                            role="status"
                            aria-hidden="true"
                          ></span>
                          Checking...
                        </>
                      ) : (
                        <>
                          <i className="fas fa-sync-alt me-2"></i>
                          Check Again
                        </>
                      )}
                    </button>
                    <button
                      className="btn btn-outline-secondary flex-grow-1"
                      onClick={() => setAuthModalDismissed(true)}
                      disabled={checkingAuth}
                    >
                      Close
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
      </Router>
    </TimeoutProvider>
  );
};

export default App;
