import React, { useEffect, useState } from 'react';
import { HashRouter as Router, Routes, Route } from 'react-router-dom';
import Menu from './features/menu/Menu';
import TestCaseWriter from './features/test-case-writer/TestCaseWriter';
import StoryWriter from './features/story-writer/StoryWriter';
import StoryElaborator from './features/story-elaborator/StoryElaborator';
import Settings from './features/settings/components/Settings';
import { TimeoutProvider } from './context/TimeoutContext';
import { UpdateStatus, EnvironmentCheckResult } from '../types';

function repoUrl(suffix: string): string {
  return 'https://github.com/thealternator89/stitch/' + suffix;
}

const App: React.FC = () => {
  const [version, setVersion] = useState<string>('');
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null);
  const [envCheckResult, setEnvCheckResult] =
    useState<EnvironmentCheckResult | null>(null);

  useEffect(() => {
    const runEnvCheck = async () => {
      try {
        const result = await window.electronAPI.checkEnvironment();
        if (!result.success) {
          setEnvCheckResult(result);
        }
      } catch (err) {
        console.error('Failed to run environment check:', err);
      }
    };
    runEnvCheck();
  }, []);

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
          </Routes>
        </div>

        <div className="footer">
          <span className="me-2 text-muted">Version {version}</span>
        </div>

        {envCheckResult && (
          <div className="env-error-overlay">
            <div className="env-error-modal">
              <div className="env-error-icon">
                <i className="fas fa-exclamation-triangle"></i>
              </div>
              <h4 className="env-error-title">Node.js Upgrade Required</h4>
              <p className="env-error-message text-center">
                {envCheckResult.message}
              </p>
              <div className="env-error-details">
                Stitch requires Node.js v{envCheckResult.minRequiredVersion} or
                above to communicate with the GitHub Copilot CLI safely and
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
          </div>
        )}
      </Router>
    </TimeoutProvider>
  );
};

export default App;
