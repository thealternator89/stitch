import React, { useEffect, useState } from 'react';
import { HashRouter as Router, Routes, Route } from 'react-router-dom';
import Menu from './pages/Menu';
import TestCaseWriter from './pages/TestCaseWriter';
import StoryWriter from './pages/StoryWriter';
import StoryElaborator from './pages/StoryElaborator';
import Settings from './pages/Settings';
import { UpdateStatus } from '../types';

function repoUrl(suffix: string): string {
  return 'https://github.com/thealternator89/stitch/' + suffix;
}

const App: React.FC = () => {
  const [version, setVersion] = useState<string>('');
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null);

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
    </Router>
  );
};

export default App;
