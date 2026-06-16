import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useCopilotModels } from '../hooks/useCopilotModels';
import ModelDropdown from '../components/ModelDropdown';
import PageLayout from '../components/PageLayout';
import { TicketData } from '../../types';

interface ChatMessage {
  sender: 'copilot' | 'user';
  text: string;
}

const StoryElaborator: React.FC = () => {
  const [ticketId, setTicketId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<TicketData[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [repoPath, setRepoPath] = useState('');
  const [context, setContext] = useState('');

  // Session States
  // 'idle' | 'elaborating' | 'plan_completed'
  const [stage, setStage] = useState<'idle' | 'elaborating' | 'plan_completed'>(
    'idle',
  );
  const [isGenerating, setIsGenerating] = useState(false);
  const [isWaitingForUser, setIsWaitingForUser] = useState(false);
  const [error, setError] = useState<string>('');

  // Elaboration Content
  const [statusLogs, setStatusLogs] = useState<
    { message: string; timestamp: Date }[]
  >([]);
  const [conversation, setConversation] = useState<ChatMessage[]>([]);
  const [userAnswer, setUserAnswer] = useState('');
  const [planMarkdown, setPlanMarkdown] = useState('');
  const [planFilePath, setPlanFilePath] = useState('');

  const [isPosting, setIsPosting] = useState(false);
  const [currentSuggestions, setCurrentSuggestions] = useState<string[]>([]);

  const searchContainerRef = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const logEndRef = useRef<HTMLDivElement>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  const { models, selectedModel, setSelectedModel, loadingModels } =
    useCopilotModels();

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

  // Scroll to bottom of chat/logs
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversation]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [statusLogs]);

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

    setError('');
    setStage('elaborating');
    setIsGenerating(true);
    setIsWaitingForUser(false);
    setStatusLogs([]);
    setConversation([]);
    setPlanMarkdown('');
    setPlanFilePath('');
    setCurrentSuggestions([]);

    // Setup listener for incoming lines
    const unsubscribe = window.electronAPI.onElaborationLine((line: string) => {
      const trimmed = line.trim();
      if (!trimmed) return;

      try {
        const data = JSON.parse(trimmed);
        if (data.type === 'status') {
          setStatusLogs((prev) => [
            ...prev,
            { message: data.text, timestamp: new Date() },
          ]);
        } else if (data.type === 'tool') {
          let statusText = '';
          if (data.name === 'report_intent') {
            if (data.status === 'start' && data.arguments?.intent) {
              statusText = `Intent: ${data.arguments.intent}`;
            } else {
              return;
            }
          } else {
            if (data.status === 'end' && data.success) {
              return; // don't clog status with "end" logs unless it fails
            }
            statusText =
              data.status === 'end'
                ? `Tool failed: ${data.name} ${data.error ? `- ${data.error}` : ''}`
                : `Tool start: ${data.name}`;
          }
          setStatusLogs((prev) => [
            ...prev,
            { message: statusText, timestamp: new Date() },
          ]);
        } else if (data.type === 'question') {
          setIsGenerating(false);
          setIsWaitingForUser(true);
          setConversation((prev) => [
            ...prev,
            { sender: 'copilot', text: data.text },
          ]);
          setCurrentSuggestions(data.suggestedAnswers || []);
        } else if (data.type === 'plan') {
          setPlanMarkdown(data.text);
          setPlanFilePath(data.filePath || '');
          setStage('plan_completed');
          setIsGenerating(false);
          setIsWaitingForUser(false);
        }
      } catch (err) {
        console.warn('Failed to parse JSONL line:', trimmed, err);
      }
    });

    try {
      // 1. Fetch Ticket details
      const fetchedTicket = await window.electronAPI.fetchTicket(ticketId);

      // 2. Start session
      await window.electronAPI.startStoryElaboration(
        fetchedTicket,
        repoPath.trim() ? repoPath : null,
        context,
        selectedModel,
      );
    } catch (err: unknown) {
      console.error(err);
      const errMsg =
        err instanceof Error
          ? err.message
          : 'An error occurred during elaboration.';
      setError(errMsg);
      setStage('idle');
      setIsGenerating(false);
    } finally {
      // We keep unsubscribe active because we need it for follow-up turns
      // We will clean it up in useEffect or during cancel/restart.
      unsubscribeRef.current = unsubscribe;
    }
  };

  const handleSendAnswer = async () => {
    if (!userAnswer.trim()) return;

    const answer = userAnswer.trim();
    setConversation((prev) => [...prev, { sender: 'user', text: answer }]);
    setUserAnswer('');
    setCurrentSuggestions([]);
    setIsGenerating(true);
    setIsWaitingForUser(false);

    try {
      await window.electronAPI.sendElaborationAnswer(ticketId, answer);
    } catch (err: unknown) {
      console.error(err);
      const errMsg =
        err instanceof Error
          ? err.message
          : 'An error occurred sending response.';
      setError(errMsg);
      setIsGenerating(false);
    }
  };

  const handleSendSuggestion = async (suggestion: string) => {
    setConversation((prev) => [...prev, { sender: 'user', text: suggestion }]);
    setCurrentSuggestions([]);
    setIsGenerating(true);
    setIsWaitingForUser(false);

    try {
      await window.electronAPI.sendElaborationAnswer(ticketId, suggestion);
    } catch (err: unknown) {
      console.error(err);
      const errMsg =
        err instanceof Error
          ? err.message
          : 'An error occurred sending response.';
      setError(errMsg);
      setIsGenerating(false);
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
      const disclaimer =
        '\n\n*Generated with Stitch and GitHub Copilot Story Elaborator.*';
      await window.electronAPI.addComment(ticketId, planMarkdown + disclaimer);
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

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
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
                  Ticket Search (Azure DevOps)
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
              <h5 className="mb-0 fw-semibold">
                <i className="fas fa-comments-dollar me-2"></i>Elaboration
                Console
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
              <div className="card-body p-0 d-flex flex-column flex-grow-1 overflow-hidden">
                <div
                  className="row g-0 flex-grow-1 overflow-hidden"
                  style={{ height: '100%' }}
                >
                  {/* Chat Panel */}
                  <div className="col-md-8 d-flex flex-column border-end h-100">
                    <div className="flex-grow-1 p-4 overflow-auto bg-body-tertiary">
                      {conversation.length === 0 ? (
                        <div className="text-center py-5 my-5 text-muted">
                          <div
                            className="spinner-border text-indigo mb-3"
                            role="status"
                          ></div>
                          <p className="fw-medium small">
                            {statusLogs.length === 0
                              ? 'Initializing Copilot agent session...'
                              : 'Copilot is thinking...'}
                          </p>
                        </div>
                      ) : (
                        <div className="d-flex flex-column gap-3">
                          {conversation.map((msg, idx) => (
                            <div
                              key={idx}
                              className={`d-flex ${msg.sender === 'user' ? 'justify-content-end' : 'justify-content-start'}`}
                            >
                              <div
                                className={`p-3 rounded-4 shadow-sm max-w-75 ${
                                  msg.sender === 'user'
                                    ? 'bg-indigo text-white rounded-br-0'
                                    : 'bg-body border rounded-bl-0 text-body'
                                }`}
                                style={
                                  msg.sender === 'user'
                                    ? { backgroundColor: '#4f46e5' }
                                    : {}
                                }
                              >
                                <span className="small fw-semibold d-block mb-1 opacity-75">
                                  {msg.sender === 'user' ? 'You' : 'Copilot'}
                                </span>
                                <p
                                  className="mb-0 small whitespace-pre-wrap"
                                  style={{ whiteSpace: 'pre-wrap' }}
                                >
                                  {msg.text}
                                </p>
                              </div>
                            </div>
                          ))}
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
                            !isWaitingForUser ||
                            isGenerating ||
                            !userAnswer.trim()
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

                  {/* Status / Activity Panel */}
                  <div
                    className="col-md-4 d-flex flex-column h-100 bg-dark text-light border-start"
                    data-bs-theme="dark"
                  >
                    <div className="p-3 border-bottom border-secondary flex-shrink-0 d-flex align-items-center justify-content-between">
                      <span className="small fw-bold text-uppercase text-secondary tracking-wider">
                        Copilot Status Log
                      </span>
                      {isGenerating && (
                        <span
                          className="spinner-grow spinner-grow-sm text-indigo"
                          role="status"
                        ></span>
                      )}
                    </div>
                    <div
                      className="flex-grow-1 p-3 overflow-auto font-monospace small"
                      style={{ backgroundColor: '#111827' }}
                    >
                      {statusLogs.length === 0 ? (
                        <div className="text-body-secondary small italic">
                          {conversation.length === 0
                            ? 'Awaiting connection...'
                            : 'Copilot is thinking...'}
                        </div>
                      ) : (
                        statusLogs.map((log, idx) => (
                          <div
                            key={idx}
                            className="mb-2 text-indigo-light border-start border-indigo border-2 ps-2 py-0.5"
                          >
                            <span className="text-body-secondary small">
                              [{log.timestamp.toLocaleTimeString()}]
                            </span>{' '}
                            {log.message}
                          </div>
                        ))
                      )}
                      <div ref={logEndRef} />
                    </div>
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
                    onClick={() => {
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
    </PageLayout>
  );
};

export default StoryElaborator;
