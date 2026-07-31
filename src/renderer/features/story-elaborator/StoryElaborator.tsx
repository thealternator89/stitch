import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useCopilotModels } from '../../hooks/useCopilotModels';
import ModelDropdown from '../../components/ModelDropdown';
import PageLayout from '../../components/PageLayout';
import { TicketData, CopilotUsage } from '../../../types';
import { useTimeoutModal, isTimeoutError } from '../../context/TimeoutContext';
import UsageStatsToast from '../../components/UsageStatsToast';

interface FeedItem {
  type: 'chat' | 'status';
  sender?: 'copilot' | 'user';
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

const StoryElaborator: React.FC = () => {
  const { showTimeout } = useTimeoutModal();
  const isMountedRef = useRef(true);
  const ticketIdRef = useRef('');
  const [ticketId, setTicketId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<TicketData[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [repoPath, setRepoPath] = useState('');
  const [context, setContext] = useState('');
  const [gitWorktreeEnabled, setGitWorktreeEnabled] = useState(false);
  const [issueSource, setIssueSource] = useState('azureDevOps');
  const [branch, setBranch] = useState('develop');

  // Session States
  // 'idle' | 'elaborating' | 'plan_completed'
  const [stage, setStage] = useState<'idle' | 'elaborating' | 'plan_completed'>(
    'idle',
  );
  const [isGenerating, setIsGenerating] = useState(false);
  const [isWaitingForUser, setIsWaitingForUser] = useState(false);
  const [error, setError] = useState<string>('');
  const [usageStats, setUsageStats] = useState<CopilotUsage | null>(null);

  // Elaboration Content
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [userAnswer, setUserAnswer] = useState('');
  const [planMarkdown, setPlanMarkdown] = useState('');
  const [planFilePath, setPlanFilePath] = useState('');

  const [isPosting, setIsPosting] = useState(false);
  const [currentSuggestions, setCurrentSuggestions] = useState<string[]>([]);

  const searchContainerRef = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
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

  // Debounced ticket search
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    if (ticketId && searchQuery.startsWith(`#${ticketId} -`)) {
      return;
    }

    setIsSearching(true);
    const delayDebounceFn = setTimeout(async () => {
      try {
        const results = await window.electronAPI.searchTickets(searchQuery);
        setSearchResults(results);
      } catch (err) {
        console.error('Error searching tickets:', err);
      } finally {
        setIsSearching(false);
      }
    }, 400);

    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery, ticketId]);

  // Click outside search dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        searchContainerRef.current &&
        !searchContainerRef.current.contains(event.target as Node)
      ) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Load settings on mount to check if git worktree is enabled
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const settings = await window.electronAPI.getSettings();
        setGitWorktreeEnabled(settings.gitWorktreeEnabled || false);
        setIssueSource(settings.sources?.issues || 'azureDevOps');
      } catch (err) {
        console.error('Failed to load settings in StoryElaborator:', err);
      }
    };
    loadSettings();
  }, []);

  // Scroll to bottom of chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [feed, isGenerating]);

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

  const handleStartElaboration = async () => {
    if (!ticketId) {
      setError('Please select a ticket.');
      return;
    }

    // Clean up any previous session/listener first
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
      unsubscribeRef.current = null;
    }
    if (ticketIdRef.current) {
      try {
        await window.electronAPI.stopStoryElaboration(ticketIdRef.current);
      } catch (err) {
        console.error('Error stopping previous story elaboration:', err);
      }
    }

    setError('');
    setUsageStats(null);
    setStage('elaborating');
    setIsGenerating(true);
    setIsWaitingForUser(false);
    setFeed([]);
    setPlanMarkdown('');
    setPlanFilePath('');
    setCurrentSuggestions([]);

    // Setup listener for incoming lines
    const unsubscribe = window.electronAPI.onElaborationLine((line: string) => {
      if (!isMountedRef.current) return;
      const trimmed = line.trim();
      if (!trimmed) return;

      try {
        const data = JSON.parse(trimmed);
        if (data.type === 'status') {
          setFeed((prev) => [...prev, { type: 'status', text: data.text }]);
        } else if (data.type === 'tool') {
          if (data.status === 'end' && data.success) {
            return; // don't clog status with "end" logs unless it fails
          }
          const statusText =
            data.status === 'end'
              ? `Tool failed: ${data.name} ${data.error ? `- ${data.error}` : ''}`
              : `Tool: ${data.name}`;
          setFeed((prev) => [...prev, { type: 'status', text: statusText }]);
        } else if (data.type === 'question') {
          setIsGenerating(false);
          setIsWaitingForUser(true);
          setFeed((prev) => [
            ...prev,
            {
              type: 'chat',
              sender: 'copilot',
              text: data.text,
            },
          ]);
          setCurrentSuggestions(data.suggestedAnswers || []);
          triggerNotification(
            'Elaborator Question',
            `The agent has asked a question for ticket #${ticketId}.`,
          );
        } else if (data.type === 'plan') {
          setPlanMarkdown(data.text);
          setPlanFilePath(data.filePath || '');
          setStage('plan_completed');
          setIsGenerating(false);
          setIsWaitingForUser(false);
          triggerNotification(
            'Elaboration Plan Completed',
            `The agent has successfully written the plan for ticket #${ticketId}.`,
          );
          window.electronAPI
            .stopStoryElaboration(ticketId)
            .then((usage) => {
              if (usage) {
                setUsageStats(usage);
              }
            })
            .catch((err) => {
              console.error(
                'Error stopping story elaboration on plan complete:',
                err,
              );
            });
        }
      } catch (err) {
        console.warn('Failed to parse JSONL line:', trimmed, err);
      }
    });

    try {
      // 1. Fetch Ticket details
      const fetchedTicket = await window.electronAPI.fetchTicket(ticketId);

      if (!isMountedRef.current) return;

      // 2. Start session
      await window.electronAPI.startStoryElaboration(
        fetchedTicket,
        repoPath.trim() ? repoPath : null,
        context,
        selectedModel,
        gitWorktreeEnabled ? branch.trim() || 'develop' : undefined,
      );
    } catch (err: unknown) {
      if (!isMountedRef.current) return;
      console.error(err);
      const errMsg = sanitizeErrorMessage(
        err,
        'An error occurred during elaboration.',
      );
      if (isTimeoutError(err)) {
        showTimeout(err);
      } else {
        setError(errMsg);
      }
      setStage('idle');
      setIsGenerating(false);
      triggerNotification(
        'Elaboration Failed',
        `Story elaboration failed for ticket #${ticketId}: ${errMsg}`,
      );
    } finally {
      if (isMountedRef.current) {
        unsubscribeRef.current = unsubscribe;
      } else {
        unsubscribe();
      }
    }
  };

  const handleSendAnswer = async () => {
    if (!userAnswer.trim()) return;

    const answer = userAnswer.trim();
    setFeed((prev) => [
      ...prev,
      { type: 'chat', sender: 'user', text: answer },
    ]);
    setUserAnswer('');
    setCurrentSuggestions([]);
    setIsGenerating(true);
    setIsWaitingForUser(false);

    try {
      await window.electronAPI.sendElaborationAnswer(ticketId, answer);
    } catch (err: unknown) {
      if (!isMountedRef.current) return;
      console.error(err);
      const errMsg = sanitizeErrorMessage(
        err,
        'An error occurred sending response.',
      );
      if (isTimeoutError(err)) {
        showTimeout(err);
      } else {
        setError(errMsg);
      }
      setIsGenerating(false);
      triggerNotification(
        'Elaboration Error',
        `Failed to send response: ${errMsg}`,
      );
    }
  };

  const handleSendSuggestion = async (suggestion: string) => {
    setFeed((prev) => [
      ...prev,
      { type: 'chat', sender: 'user', text: suggestion },
    ]);
    setCurrentSuggestions([]);
    setIsGenerating(true);
    setIsWaitingForUser(false);

    try {
      await window.electronAPI.sendElaborationAnswer(ticketId, suggestion);
    } catch (err: unknown) {
      if (!isMountedRef.current) return;
      console.error(err);
      const errMsg = sanitizeErrorMessage(
        err,
        'An error occurred sending response.',
      );
      if (isTimeoutError(err)) {
        showTimeout(err);
      } else {
        setError(errMsg);
      }
      setIsGenerating(false);
      triggerNotification(
        'Elaboration Error',
        `Failed to send response: ${errMsg}`,
      );
    }
  };

  const handleCancel = async () => {
    setIsGenerating(false);
    setIsWaitingForUser(false);
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
      unsubscribeRef.current = null;
    }

    try {
      await window.electronAPI.stopStoryElaboration(ticketId);
    } catch (err) {
      console.error(err);
    }
    setStage('idle');
  };

  const handlePostComment = async () => {
    if (!planMarkdown) return;
    setIsPosting(true);
    try {
      await window.electronAPI.addComment(ticketId, planMarkdown);
      alert('Plan added to the ticket comment successfully!');
    } catch (err: unknown) {
      console.error(err);
      const errMsg =
        err instanceof Error ? err.message : 'Failed to add comment.';
      alert(errMsg);
    } finally {
      setIsPosting(false);
    }
  };

  // Keep track of ticketId in a ref to clean up on unmount/resets
  useEffect(() => {
    ticketIdRef.current = ticketId;
  }, [ticketId]);

  // Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
      if (ticketIdRef.current) {
        window.electronAPI
          .stopStoryElaboration(ticketIdRef.current)
          .catch((err) => {
            console.error('Failed to stop story elaboration on unmount:', err);
          });
      }
    };
  }, []);

  return (
    <PageLayout title="Story Elaborator" maxWidth="100%">
      <div className="row animate__animated animate__fadeIn">
        {/* Left Column: Form / Info */}
        <div className="col-md-4 col-lg-3">
          <div className="card shadow-sm border-0 mb-4">
            <div
              className="card-header bg-indigo text-white py-3"
              style={{ backgroundColor: '#4f46e5' }}
            >
              <h5 className="mb-0 fw-semibold">
                <i className="fas fa-brain me-2"></i>Elaboration Settings
              </h5>
            </div>
            <div className="card-body p-4">
              {error && <div className="alert alert-danger">{error}</div>}

              {/* Ticket Search */}
              <div className="mb-3 position-relative" ref={searchContainerRef}>
                <label className="form-label fw-medium text-secondary">
                  Ticket Search (
                  {issueSource === 'github' ? 'GitHub' : 'Azure DevOps'})
                </label>
                <div className="input-group">
                  <span className="input-group-text bg-body-secondary border-2 border-end-0">
                    {isSearching ? (
                      <span
                        className="spinner-border spinner-border-sm text-indigo"
                        role="status"
                      ></span>
                    ) : (
                      <i className="fas fa-search text-muted"></i>
                    )}
                  </span>
                  <input
                    type="text"
                    className="form-control border-2 border-start-0 ps-1"
                    placeholder="Search by title or ID..."
                    value={searchQuery}
                    onChange={(e) => {
                      const val = e.target.value;
                      setSearchQuery(val);
                      setIsDropdownOpen(val.trim().length > 0);

                      if (/^\d+$/.test(val.trim())) {
                        setTicketId(val.trim());
                      } else {
                        setTicketId('');
                      }
                    }}
                    onFocus={() => {
                      if (searchQuery.trim().length > 0) {
                        setIsDropdownOpen(true);
                      }
                    }}
                    disabled={stage !== 'idle'}
                  />
                  {searchQuery && stage === 'idle' && (
                    <button
                      className="btn btn-outline-secondary border-2 border-start-0"
                      type="button"
                      onClick={() => {
                        setSearchQuery('');
                        setTicketId('');
                        setSearchResults([]);
                        setIsDropdownOpen(false);
                      }}
                    >
                      <i className="fas fa-times"></i>
                    </button>
                  )}
                </div>

                {isDropdownOpen &&
                  (searchResults.length > 0 || isSearching) && (
                    <div
                      className="dropdown-menu show w-100 shadow-lg border rounded-3 mt-1 overflow-y-auto"
                      style={{
                        position: 'absolute',
                        zIndex: 1050,
                        maxHeight: '300px',
                        backgroundColor: 'var(--bs-body-bg)',
                        borderColor: 'var(--bs-border-color)',
                      }}
                    >
                      {isSearching ? (
                        <div className="dropdown-item text-muted py-3 text-center">
                          <span
                            className="spinner-border spinner-border-sm me-2 text-indigo"
                            role="status"
                          ></span>
                          Searching work items...
                        </div>
                      ) : (
                        searchResults.map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            className="dropdown-item py-2 border-bottom border-light text-start d-flex flex-column gap-1"
                            onClick={() => {
                              setTicketId(item.id || '');
                              setSearchQuery(`#${item.id} - ${item.title}`);
                              setIsDropdownOpen(false);
                            }}
                            style={{ whiteSpace: 'normal', cursor: 'pointer' }}
                          >
                            <span className="fw-bold text-indigo small">
                              #{item.id}
                            </span>
                            <span className="text-body small fw-medium">
                              {item.title}
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                  )}
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
                <div className="form-text text-muted small">
                  If provided, Copilot can inspect codebase files to plan
                  changes.
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
                  <div className="form-text text-muted small">
                    The branch to checkout in the worktree. Defaults to{' '}
                    <code>develop</code>.
                  </div>
                </div>
              )}

              {/* Additional Context */}
              <div className="mb-3">
                <label className="form-label fw-medium text-secondary">
                  Additional Context (Optional)
                </label>
                <textarea
                  className="form-control border-2"
                  rows={3}
                  placeholder="e.g. steer Copilot to focus on frontend architecture, database setup, or specific dependencies..."
                  value={context}
                  onChange={(e) => setContext(e.target.value)}
                  disabled={stage !== 'idle'}
                />
              </div>

              {/* Action Buttons */}
              {stage === 'idle' ? (
                <button
                  className="btn text-white btn-lg w-100 py-3 shadow-sm hover-grow"
                  style={{ backgroundColor: '#4f46e5' }}
                  onClick={handleStartElaboration}
                  disabled={!ticketId}
                >
                  <i className="fas fa-rocket me-2"></i>
                  Start Elaboration
                </button>
              ) : (
                <button
                  className="btn btn-danger btn-lg w-100 py-3 shadow-sm hover-grow"
                  onClick={handleCancel}
                >
                  <i className="fas fa-stop me-2"></i>
                  Cancel Session
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Console / Chat / Plan */}
        <div className="col-md-8 col-lg-9">
          <div
            className="card shadow-sm border-0 d-flex flex-column"
            style={{ height: 'calc(100vh - 195px)', minHeight: '400px' }}
          >
            {/* Header */}
            <div className="card-header bg-dark text-white py-3 d-flex justify-content-between align-items-center flex-shrink-0">
              <h5 className="mb-0 fw-semibold d-flex align-items-center gap-2">
                <i className="fas fa-comments-dollar"></i>
                <span>Elaboration Session</span>
                {stage === 'elaborating' && isGenerating && (
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
                {stage === 'plan_completed' && (
                  <button
                    className="btn btn-sm btn-outline-light px-3 py-2 fw-medium"
                    onClick={() => navigator.clipboard.writeText(planMarkdown)}
                  >
                    <i className="fas fa-copy me-2"></i>
                    Copy Plan
                  </button>
                )}
              </div>
            </div>

            {/* Body */}
            {stage === 'idle' && (
              <div className="card-body p-4 d-flex flex-column justify-content-center align-items-center text-muted text-center flex-grow-1">
                <i
                  className="fas fa-brain mb-4"
                  style={{ fontSize: '4.5rem', color: '#cbd5e1' }}
                ></i>
                <h4 className="fw-semibold text-secondary">
                  Start a New Elaboration
                </h4>
                <p className="max-w-md text-muted small mt-2">
                  Select a work item ticket and optional repository directory,
                  then launch the session. Copilot will study your request and
                  interactively gather info to draft a plan.
                </p>
              </div>
            )}

            {stage === 'elaborating' && (
              <div className="card-body p-0 d-flex flex-column flex-grow-1 overflow-hidden bg-body-tertiary">
                <div className="flex-grow-1 p-4 overflow-auto">
                  {feed.length === 0 ? (
                    <div className="text-center py-5 my-5 text-muted">
                      <div
                        className="spinner-border text-indigo mb-3"
                        role="status"
                      ></div>
                      <p className="fw-medium small">
                        Initializing Copilot agent session...
                      </p>
                    </div>
                  ) : (
                    <div className="d-flex flex-column gap-3">
                      {feed.map((item, idx) => {
                        if (item.type === 'status') {
                          return (
                            <div
                              key={idx}
                              className="d-flex justify-content-start my-1"
                            >
                              <div
                                className="px-3 py-1.5 rounded-3 text-body-secondary font-monospace bg-body-secondary border d-flex align-items-center gap-2"
                                style={{
                                  maxWidth: '90%',
                                  fontSize: '0.75rem',
                                  wordBreak: 'break-word',
                                }}
                              >
                                <i className="fas fa-terminal opacity-75 flex-shrink-0"></i>
                                <span className="text-start">{item.text}</span>
                              </div>
                            </div>
                          );
                        }

                        // Chat message (user or copilot)
                        return (
                          <div
                            key={idx}
                            className={`d-flex ${item.sender === 'user' ? 'justify-content-end' : 'justify-content-start'}`}
                          >
                            <div
                              className={`p-3 rounded-4 shadow-sm max-w-75 ${
                                item.sender === 'user'
                                  ? 'bg-indigo text-white rounded-br-0'
                                  : 'bg-body border rounded-bl-0 text-body'
                              }`}
                              style={
                                item.sender === 'user'
                                  ? { backgroundColor: '#4f46e5' }
                                  : {}
                              }
                            >
                              <span className="small fw-semibold d-block mb-1 opacity-75">
                                {item.sender === 'user' ? 'You' : 'Copilot'}
                              </span>
                              <p
                                className="mb-0 small whitespace-pre-wrap"
                                style={{ whiteSpace: 'pre-wrap' }}
                              >
                                {item.text}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                      {isGenerating && (
                        <div className="d-flex justify-content-start align-items-center gap-2 text-muted ps-2 my-1">
                          <span
                            className="spinner-grow spinner-grow-sm text-indigo"
                            role="status"
                            style={{ width: '0.75rem', height: '0.75rem' }}
                          ></span>
                          <span
                            className="small italic font-monospace"
                            style={{ fontSize: '0.75rem' }}
                          >
                            Copilot is working...
                          </span>
                        </div>
                      )}
                      <div ref={chatEndRef} />
                    </div>
                  )}
                </div>

                {/* Chat Input */}
                <div className="p-3 border-top bg-body flex-shrink-0">
                  {isWaitingForUser && currentSuggestions.length > 0 && (
                    <div className="mb-3 d-flex flex-wrap gap-2 animate__animated animate__fadeIn">
                      {currentSuggestions.map((suggestion, idx) => (
                        <button
                          key={idx}
                          type="button"
                          className="btn btn-sm btn-outline-indigo rounded-pill shadow-sm py-1.5 px-3 fw-medium"
                          onClick={() => handleSendSuggestion(suggestion)}
                          disabled={isGenerating}
                        >
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="input-group">
                    <textarea
                      rows={2}
                      className="form-control border-2"
                      placeholder={
                        isWaitingForUser
                          ? 'Type your answer here...'
                          : 'Waiting for Copilot...'
                      }
                      value={userAnswer}
                      onChange={(e) => setUserAnswer(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleSendAnswer();
                        }
                      }}
                      disabled={!isWaitingForUser || isGenerating}
                    />
                    <button
                      className="btn text-white px-4 fw-semibold"
                      style={{ backgroundColor: '#4f46e5' }}
                      onClick={handleSendAnswer}
                      disabled={
                        !isWaitingForUser || isGenerating || !userAnswer.trim()
                      }
                    >
                      {isGenerating ? (
                        <span
                          className="spinner-border spinner-border-sm"
                          role="status"
                        ></span>
                      ) : (
                        <i className="fas fa-paper-plane"></i>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {stage === 'plan_completed' && (
              <div className="card-body p-0 d-flex flex-column flex-grow-1 overflow-hidden">
                <div className="flex-grow-1 p-4 overflow-auto">
                  {planFilePath && (
                    <div className="alert alert-success border-0 shadow-sm d-flex align-items-center gap-2 mb-4">
                      <i className="fas fa-file-circle-check fs-5"></i>
                      <div>
                        <strong>Plan saved successfully!</strong> Written to:{' '}
                        <code>{planFilePath}</code>
                      </div>
                    </div>
                  )}
                  <div className="markdown-content border rounded-3 p-4 bg-body-tertiary">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {planMarkdown}
                    </ReactMarkdown>
                  </div>
                </div>

                {/* Footer Controls */}
                <div className="card-footer bg-body-tertiary py-3 d-flex justify-content-between align-items-center border-top flex-shrink-0">
                  <button
                    className="btn btn-outline-secondary px-4 py-2 fw-semibold"
                    onClick={async () => {
                      if (unsubscribeRef.current) {
                        unsubscribeRef.current();
                        unsubscribeRef.current = null;
                      }
                      if (ticketId) {
                        try {
                          await window.electronAPI.stopStoryElaboration(
                            ticketId,
                          );
                        } catch (err) {
                          console.error(
                            'Error stopping story elaboration:',
                            err,
                          );
                        }
                      }
                      setStage('idle');
                    }}
                  >
                    <i className="fas fa-rotate-left me-2"></i>
                    Start Over
                  </button>
                  <button
                    className="btn text-white px-4 py-2 fw-semibold shadow-sm hover-grow"
                    style={{ backgroundColor: '#4f46e5' }}
                    onClick={handlePostComment}
                    disabled={isPosting}
                  >
                    {isPosting ? (
                      <>
                        <span
                          className="spinner-border spinner-border-sm me-2"
                          role="status"
                        ></span>
                        Posting...
                      </>
                    ) : (
                      <>
                        <i className="fas fa-comment-dots me-2"></i>
                        Post Plan as Comment
                      </>
                    )}
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

export default StoryElaborator;
