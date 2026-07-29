import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useCopilotModels } from '../../hooks/useCopilotModels';
import ModelDropdown from '../../components/ModelDropdown';
import PageLayout from '../../components/PageLayout';
import { CopilotUsage } from '../../../types';
import { useTimeoutModal, isTimeoutError } from '../../context/TimeoutContext';
import UsageStatsToast from '../../components/UsageStatsToast';

interface LogItem {
  type: 'status' | 'error';
  text: string;
}

const sanitizeErrorMessage = (err: unknown, defaultMsg: string): string => {
  if (!(err instanceof Error)) {
    return defaultMsg;
  }
  let message = err.message;
  if (message.includes('Error invoking remote method')) {
    const match = message.match(
      /Error invoking remote method '[^']+':\s*([\s\S]*)/,
    );
    if (match && match[1]) {
      message = match[1];
    }
  }
  return message;
};

const getColorForSize = (size: string) => {
  switch (size) {
    case 'XS':
      return '#10b981'; // emerald green
    case 'S':
      return '#06b6d4'; // cyan
    case 'M':
      return '#f59e0b'; // amber/yellow
    case 'L':
      return '#f97316'; // orange
    case 'XL':
      return '#ef4444'; // red
    default:
      return '#6b7280'; // gray
  }
};

const TShirtEstimator: React.FC = () => {
  const { showTimeout } = useTimeoutModal();
  const isMountedRef = useRef(true);
  const sessionIdRef = useRef('');

  // Form states
  const [description, setDescription] = useState('');
  const [repoPath, setRepoPath] = useState('');
  const [branch, setBranch] = useState('develop');
  const [gitWorktreeEnabled, setGitWorktreeEnabled] = useState(false);

  // Estimation lifecycle states
  const [stage, setStage] = useState<'idle' | 'estimating' | 'completed'>(
    'idle',
  );
  const [isEstimating, setIsEstimating] = useState(false);
  const [error, setError] = useState('');
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [size, setSize] = useState<'XS' | 'S' | 'M' | 'L' | 'XL' | ''>('');
  const [reasoning, setReasoning] = useState('');
  const [usageStats, setUsageStats] = useState<CopilotUsage | null>(null);
  const [sessionId, setSessionId] = useState('');

  const consoleEndRef = useRef<HTMLDivElement>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  const { models, selectedModel, setSelectedModel, loadingModels } =
    useCopilotModels();

  const triggerNotification = (title: string, body: string) => {
    if (!document.hasFocus()) {
      window.electronAPI.showNotification(title, body).catch((err) => {
        console.error('Failed to show notification:', err);
      });
    }
  };

  // Load settings on mount to check if git worktree is enabled
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const settings = await window.electronAPI.getSettings();
        setGitWorktreeEnabled(settings.gitWorktreeEnabled || false);
      } catch (err) {
        console.error('Failed to load settings in TShirtEstimator:', err);
      }
    };
    loadSettings();
  }, []);

  // Scroll console to bottom
  useEffect(() => {
    consoleEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs, isEstimating]);

  // Sync ref with state
  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  // Clean up on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
      if (sessionIdRef.current) {
        window.electronAPI
          .stopTShirtEstimation(sessionIdRef.current)
          .catch((err) => {
            console.error('Failed to stop T-shirt estimation on unmount:', err);
          });
      }
    };
  }, []);

  const handleBrowseFolder = async () => {
    try {
      const path = await window.electronAPI.selectDirectory();
      if (path) {
        setRepoPath(path);
      }
    } catch (err) {
      console.error('Failed to select directory:', err);
    }
  };

  const handleStartEstimation = async () => {
    if (!description.trim()) {
      setError('Please provide a short description of the proposed change.');
      return;
    }

    // Clean up any previous session/listener first
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
      unsubscribeRef.current = null;
    }
    if (sessionIdRef.current) {
      try {
        await window.electronAPI.stopTShirtEstimation(sessionIdRef.current);
      } catch (err) {
        console.error('Error stopping previous session:', err);
      }
    }

    setError('');
    setUsageStats(null);
    setStage('estimating');
    setIsEstimating(true);
    setLogs([]);
    setSize('');
    setReasoning('');
    setSessionId('');

    // Setup listener for incoming JSONL lines
    const unsubscribe = window.electronAPI.onTShirtEstimationLine(
      (line: string) => {
        if (!isMountedRef.current) return;
        const trimmed = line.trim();
        if (!trimmed) return;

        try {
          const data = JSON.parse(trimmed);
          if (data.type === 'status') {
            setLogs((prev) => [...prev, { type: 'status', text: data.text }]);
          } else if (data.type === 'tool') {
            let statusText = '';
            if (data.status === 'end' && data.success) {
              return; // don't clog logs with end success messages
            }
            statusText =
              data.status === 'end'
                ? `Tool failed: ${data.name} ${data.error ? `- ${data.error}` : ''}`
                : `Tool: ${data.name}`;
            setLogs((prev) => [...prev, { type: 'status', text: statusText }]);
          } else if (data.type === 'estimate') {
            setSize(data.size);
            setReasoning(data.text);
            setStage('completed');
            setIsEstimating(false);
            triggerNotification(
              'Estimation Completed',
              `The agent has completed the estimation. Size: ${data.size}`,
            );
          }
        } catch (err) {
          console.warn('Failed to parse JSONL line:', trimmed, err);
        }
      },
    );

    try {
      const response = await window.electronAPI.startTShirtEstimation(
        description.trim(),
        repoPath.trim() ? repoPath : null,
        selectedModel,
        gitWorktreeEnabled ? branch.trim() || 'develop' : undefined,
      );

      if (!isMountedRef.current) return;

      const parsed = JSON.parse(response);
      setSessionId(parsed.sessionId);

      // Clean up backend session and collect usage details
      const usage = await window.electronAPI.stopTShirtEstimation(
        parsed.sessionId,
      );
      if (usage) {
        setUsageStats(usage);
      }
    } catch (err: unknown) {
      if (!isMountedRef.current) return;
      console.error(err);
      const errMsg = sanitizeErrorMessage(
        err,
        'An error occurred during estimation.',
      );
      if (isTimeoutError(err)) {
        showTimeout(err);
      } else {
        setError(errMsg);
      }
      setStage('idle');
      setIsEstimating(false);
      triggerNotification('Estimation Failed', `Estimation failed: ${errMsg}`);
    } finally {
      if (isMountedRef.current) {
        unsubscribeRef.current = unsubscribe;
      } else {
        unsubscribe();
      }
    }
  };

  const handleCancel = async () => {
    setIsEstimating(false);
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
      unsubscribeRef.current = null;
    }
    if (sessionId) {
      try {
        await window.electronAPI.stopTShirtEstimation(sessionId);
      } catch (err) {
        console.error('Error stopping session on cancel:', err);
      }
    }
    setStage('idle');
  };

  const handleStartOver = () => {
    setStage('idle');
    setSize('');
    setReasoning('');
    setLogs([]);
    setSessionId('');
    setError('');
  };

  return (
    <PageLayout title="T-Shirt Size Estimator" maxWidth="100%">
      <div className="row animate__animated animate__fadeIn">
        {/* Left Column: Form Settings */}
        <div className="col-md-4 col-lg-3">
          <div className="card shadow-sm border-0 mb-4">
            <div
              className="card-header text-white py-3"
              style={{ backgroundColor: '#4f46e5' }}
            >
              <h5 className="mb-0 fw-semibold">
                <i className="fas fa-sliders me-2"></i>Estimation Settings
              </h5>
            </div>
            <div className="card-body p-4">
              {error && <div className="alert alert-danger">{error}</div>}

              {/* Proposed Change Description */}
              <div className="mb-3">
                <label className="form-label fw-medium text-secondary">
                  Proposed Change Description
                </label>
                <textarea
                  className="form-control border-2"
                  rows={5}
                  placeholder="e.g. Add a button next to the search bar to export results to PDF, generating it in the backend using pdfkit and serving it as a download..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  disabled={stage !== 'idle'}
                />
                <div className="form-text text-muted small mt-1">
                  Describe what you want to add or modify. Be as specific as
                  possible.
                </div>
              </div>

              {/* Repository Path */}
              <div className="mb-3">
                <label className="form-label fw-medium text-secondary">
                  Local Repository Path (Optional)
                </label>
                <div className="input-group">
                  <input
                    type="text"
                    className="form-control border-2"
                    placeholder="/path/to/local/repo"
                    value={repoPath}
                    onChange={(e) => setRepoPath(e.target.value)}
                    disabled={stage !== 'idle'}
                  />
                  <button
                    className="btn btn-outline-secondary border-2"
                    type="button"
                    onClick={handleBrowseFolder}
                    disabled={stage !== 'idle'}
                  >
                    <i className="fas fa-folder-open"></i>
                  </button>
                </div>
                <div className="form-text text-muted small mt-1">
                  If provided, Copilot can analyze the existing codebase
                  structures to make a more accurate estimate.
                </div>
              </div>

              {/* Git Branch */}
              {gitWorktreeEnabled && (
                <div className="mb-3 animate__animated animate__fadeIn">
                  <label className="form-label fw-medium text-secondary">
                    Git Branch
                  </label>
                  <input
                    type="text"
                    className="form-control border-2"
                    placeholder="develop"
                    value={branch}
                    onChange={(e) => setBranch(e.target.value)}
                    disabled={stage !== 'idle'}
                  />
                  <div className="form-text text-muted small mt-1">
                    The branch to checkout in the worktree. Defaults to{' '}
                    <code>develop</code>.
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              {stage === 'idle' ? (
                <button
                  className="btn text-white btn-lg w-100 py-3 mt-2 shadow-sm hover-grow"
                  style={{ backgroundColor: '#4f46e5' }}
                  onClick={handleStartEstimation}
                  disabled={!description.trim()}
                >
                  <i className="fas fa-calculator me-2"></i>
                  Start Estimation
                </button>
              ) : (
                stage === 'estimating' && (
                  <button
                    className="btn btn-danger btn-lg w-100 py-3 mt-2 shadow-sm hover-grow"
                    onClick={handleCancel}
                  >
                    <i className="fas fa-stop me-2"></i>
                    Cancel Estimation
                  </button>
                )
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Console Log / Result */}
        <div className="col-md-8 col-lg-9">
          <div
            className="card shadow-sm border-0 d-flex flex-column"
            style={{ height: 'calc(100vh - 195px)', minHeight: '450px' }}
          >
            {/* Header */}
            <div className="card-header bg-dark text-white py-3 d-flex justify-content-between align-items-center flex-shrink-0">
              <h5 className="mb-0 fw-semibold d-flex align-items-center gap-2">
                <i className="fas fa-shirt"></i>
                <span>Estimation Output</span>
                {stage === 'estimating' && (
                  <span
                    className="spinner-grow spinner-grow-sm text-indigo ms-2"
                    role="status"
                    style={{ width: '0.75rem', height: '0.75rem' }}
                  ></span>
                )}
              </h5>
              <div className="d-flex align-items-center gap-3">
                {stage === 'idle' && (
                  <ModelDropdown
                    models={models}
                    selectedModel={selectedModel}
                    onSelect={setSelectedModel}
                    loading={loadingModels}
                    className="w-auto border-0 shadow-sm"
                  />
                )}
                {stage === 'completed' && (
                  <button
                    className="btn btn-sm btn-outline-light px-3 py-2 fw-medium"
                    onClick={() => {
                      const textToCopy = `Estimated Size: ${size}\n\nReasoning:\n${reasoning}`;
                      navigator.clipboard.writeText(textToCopy);
                    }}
                  >
                    <i className="fas fa-copy me-2"></i>
                    Copy Result
                  </button>
                )}
              </div>
            </div>

            {/* Content Area */}
            {stage === 'idle' && (
              <div className="card-body p-4 d-flex flex-column justify-content-center align-items-center text-muted text-center flex-grow-1">
                <i
                  className="fas fa-shirt mb-4"
                  style={{ fontSize: '5rem', color: '#cbd5e1' }}
                ></i>
                <h4 className="fw-semibold text-secondary">
                  Estimate a Proposed Change
                </h4>
                <p className="max-w-md text-muted small mt-2">
                  Enter a description of what you want to implement and select
                  your project's local directory. Copilot will run background
                  tools to inspect the files, analyze the requirements, and
                  suggest a T-Shirt size effort rating.
                </p>
              </div>
            )}

            {stage === 'estimating' && (
              <div className="card-body p-0 d-flex flex-column flex-grow-1 overflow-hidden bg-body-tertiary">
                <div className="flex-grow-1 p-4 overflow-auto font-monospace">
                  <div className="d-flex flex-column gap-2 text-start">
                    <div className="text-secondary small border-bottom pb-2 mb-2">
                      &gt; Initializing estimation session...
                    </div>
                    {logs.map((log, idx) => (
                      <div
                        key={idx}
                        className="d-flex align-items-start gap-2"
                        style={{ fontSize: '0.8rem' }}
                      >
                        <span className="text-success select-none">&gt;</span>
                        <span className="text-body-secondary">{log.text}</span>
                      </div>
                    ))}
                    {isEstimating && (
                      <div className="d-flex align-items-center gap-2 text-muted mt-2 ps-1">
                        <span
                          className="spinner-border spinner-border-sm text-indigo"
                          role="status"
                        ></span>
                        <span className="small italic">
                          Copilot is exploring the codebase...
                        </span>
                      </div>
                    )}
                    <div ref={consoleEndRef} />
                  </div>
                </div>
              </div>
            )}

            {stage === 'completed' && (
              <div className="card-body p-0 d-flex flex-column flex-grow-1 overflow-hidden">
                <div className="flex-grow-1 p-4 overflow-auto">
                  {/* Big prominent T-shirt size badge */}
                  <div className="d-flex align-items-center gap-4 border-bottom pb-4 mb-4">
                    <div
                      className="d-flex justify-content-center align-items-center rounded-3 shadow fw-bold text-white"
                      style={{
                        width: '90px',
                        height: '90px',
                        fontSize: '2.5rem',
                        backgroundColor: getColorForSize(size),
                        minWidth: '90px',
                      }}
                    >
                      {size}
                    </div>
                    <div>
                      <h3 className="fw-bold mb-1 text-primary">
                        Estimated Size
                      </h3>
                      <p className="text-muted mb-0 small">
                        Based on the analysis of the proposed description and
                        project structures, the change effort matches a{' '}
                        <strong>{size}</strong> T-shirt size.
                      </p>
                    </div>
                  </div>

                  {/* Reasoning markdown render */}
                  <div className="markdown-content border rounded-3 p-4 bg-body-tertiary">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {reasoning}
                    </ReactMarkdown>
                  </div>
                </div>

                {/* Footer Controls */}
                <div className="card-footer bg-body-tertiary py-3 d-flex justify-content-between align-items-center border-top flex-shrink-0">
                  <button
                    className="btn btn-outline-secondary px-4 py-2 fw-semibold"
                    onClick={handleStartOver}
                  >
                    <i className="fas fa-rotate-left me-2"></i>
                    Start Over
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      {usageStats && (
        <UsageStatsToast
          stats={usageStats}
          onClose={() => setUsageStats(null)}
        />
      )}
    </PageLayout>
  );
};

export default TShirtEstimator;
