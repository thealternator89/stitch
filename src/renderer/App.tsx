import React, { useEffect, useState } from 'react';
import { HashRouter as Router, Routes, Route } from 'react-router-dom';
import Menu from './pages/Menu';
import TestCaseWriter from './pages/TestCaseWriter';
import StoryWriter from './pages/StoryWriter';
import Settings from './pages/Settings';

const App: React.FC = () => {
  const [version, setVersion] = useState<string>('');

  useEffect(() => {
    const fetchVersion = async () => {
      try {
        const v = await (window as any).electronAPI.getVersion();
        setVersion(v);
      } catch (err) {
        console.error('Failed to get version:', err);
      }
    };
    fetchVersion();
  }, []);

  return (
    <Router>
      <div className="titlebar shadow-sm">
        <span className="titlebar-content">
          <i className="fas fa-code-merge me-2 text-primary"></i>
          Stitch
        </span>
      </div>

      <div className="main-content">
        <Routes>
          <Route path="/" element={<Menu />} />
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
