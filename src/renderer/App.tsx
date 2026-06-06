import React, { useEffect, useState } from 'react';
import { HashRouter as Router, Routes, Route } from 'react-router-dom';
import Menu from './pages/Menu';
import TestCaseWriter from './pages/TestCaseWriter';
import StoryWriter from './pages/StoryWriter';
import Settings from './pages/Settings';
import { UpdateStatus } from '../types';

const App: React.FC = () => {
  const [version, setVersion] = useState<string>('');
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null);

  useEffect(() => {
    const fetchVersionAndStatus = async () => {
      try {
        const v = await window.electronAPI.getVersion();
        setVersion(v);

        const status = await window.electronAPI.checkUpdateStatus();
        if (status.isUpdated) {
          setUpdateStatus(status);
        }
      } catch (err) {
        console.error('Failed to initialize app version and status:', err);
      }
    };
    fetchVersionAndStatus();
  }, []);

  const handleCloseToast = async () => {
    try {
      await window.electronAPI.acknowledgeUpdate();
      setUpdateStatus(null);
    } catch (err) {
      console.error('Failed to acknowledge update:', err);
    }
  };

  const handleOpenChangelog = async () => {
    if (!updateStatus) return;
    try {
      const ver = updateStatus.currentVersion;
      await window.electronAPI.acknowledgeUpdate();
      setUpdateStatus(null);
      await window.electronAPI.openExternal(
        `https://github.com/thealternator89/stitch/releases/tag/v${ver}`,
      );
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
    window.electronAPI.openExternal(
      'https://github.com/thealternator89/stitch/issues',
    );
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
