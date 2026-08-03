import React, { useEffect, useState, useRef } from 'react';
import PageLayout from '../../components/PageLayout';
import { DbSession } from '../../../types';

const UsageHistory: React.FC = () => {
  const [history, setHistory] = useState<DbSession[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [toolFilter, setToolFilter] = useState<string>('all');
  const [expandedSessions, setExpandedSessions] = useState<
    Record<number, boolean>
  >({});

  const [clearConfirm, setClearConfirm] = useState<boolean>(false);
  const clearTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Load history from SQLite
  const loadHistory = async () => {
    setLoading(true);
    try {
      const data = await window.electronAPI.getHistory();
      setHistory(data || []);
    } catch (err) {
      console.error('Failed to load history:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHistory();
    return () => {
      if (clearTimerRef.current) {
        clearTimeout(clearTimerRef.current);
      }
    };
  }, []);

  const handleClearHistory = async () => {
    if (!clearConfirm) {
      setClearConfirm(true);
      clearTimerRef.current = setTimeout(() => {
        setClearConfirm(false);
      }, 3000);
      return;
    }

    if (clearTimerRef.current) {
      clearTimeout(clearTimerRef.current);
      clearTimerRef.current = null;
    }
    setClearConfirm(false);

    try {
      await window.electronAPI.clearHistory();
      setHistory([]);
      setExpandedSessions({});
    } catch (err) {
      console.error('Failed to clear history:', err);
    }
  };

  const toggleExpand = (id: number) => {
    setExpandedSessions((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  // Helper to format timestamps
  const formatTimestamp = (ts: number): string => {
    const date = new Date(ts);
    return date.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Helper to get tool icons
  const getToolIcon = (toolName: string): string => {
    switch (toolName) {
      case 'PR Reviewer':
        return 'fa-code-pull-request text-primary';
      case 'Story Writer':
        return 'fa-book-open text-success';
      case 'Test Case Writer':
        return 'fa-pen-to-square text-info';
      case 'Story Elaborator':
        return 'fa-brain text-warning';
      case 'T-Shirt Size Estimator':
        return 'fa-shirt text-indigo';
      default:
        return 'fa-chart-bar text-secondary';
    }
  };

  // Filter history
  const filteredHistory = history.filter((session) => {
    const matchesSearch =
      (session.contextReference || '')
        .toLowerCase()
        .includes(searchQuery.toLowerCase()) ||
      (session.aiOutput || '')
        .toLowerCase()
        .includes(searchQuery.toLowerCase()) ||
      (session.pushed || '').toLowerCase().includes(searchQuery.toLowerCase());

    const matchesTool = toolFilter === 'all' || session.toolName === toolFilter;

    return matchesSearch && matchesTool;
  });

  // Calculate aggregated stats
  const totalSessions = history.length;

  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCachedTokens = 0;

  history.forEach((session) => {
    if (session.llmUsages) {
      session.llmUsages.forEach((usage) => {
        totalInputTokens += usage.inputTokens;
        totalOutputTokens += usage.outputTokens;
        totalCachedTokens += usage.cacheReadTokens;
      });
    }
  });

  const cacheEfficiency =
    totalInputTokens > 0
      ? Math.round((totalCachedTokens / totalInputTokens) * 100)
      : 0;

  // Curate unique tool names for filter dropdown
  const uniqueTools = Array.from(new Set(history.map((s) => s.toolName)));

  const actions =
    history.length > 0 ? (
      <button
        className={
          clearConfirm
            ? 'btn btn-danger d-flex align-items-center gap-2 animate__animated animate__pulse animate__infinite'
            : 'btn btn-outline-danger d-flex align-items-center gap-2'
        }
        onClick={handleClearHistory}
      >
        <i
          className={
            clearConfirm ? 'fas fa-exclamation-triangle' : 'fas fa-trash-can'
          }
        ></i>{' '}
        {clearConfirm ? 'Click again to confirm!' : 'Clear All History'}
      </button>
    ) : undefined;

  return (
    <PageLayout title="Usage History" actions={actions} maxWidth="100%">
      <div className="container-fluid px-0 animate__animated animate__fadeIn">
        <div className="text-muted small mb-3 text-start">
          <i className="fas fa-info-circle me-1"></i> Showing history
          accumulated in the last 30 days.
        </div>

        {/* Stats Row */}
        <div className="row g-4 mb-4">
          <div className="col-md-3">
            <div className="card shadow-sm border-0 h-100 bg-gradient-primary text-white">
              <div className="card-body p-4 d-flex align-items-center">
                <div
                  className="rounded-circle me-3 d-flex align-items-center justify-content-center"
                  style={{
                    backgroundColor: 'rgba(255, 255, 255, 0.2)',
                    width: '56px',
                    height: '56px',
                  }}
                >
                  <i className="fas fa-history fa-lg"></i>
                </div>
                <div>
                  <h6 className="card-subtitle mb-1 text-white text-opacity-75 text-uppercase fw-semibold small">
                    Total Runs
                  </h6>
                  <h3 className="card-title mb-0 fw-bold">{totalSessions}</h3>
                </div>
              </div>
            </div>
          </div>

          <div className="col-md-3">
            <div className="card shadow-sm border-0 h-100 bg-gradient-success text-white">
              <div className="card-body p-4 d-flex align-items-center">
                <div
                  className="rounded-circle me-3 d-flex align-items-center justify-content-center"
                  style={{
                    backgroundColor: 'rgba(255, 255, 255, 0.2)',
                    width: '56px',
                    height: '56px',
                  }}
                >
                  <i className="fas fa-sign-in-alt fa-lg"></i>
                </div>
                <div>
                  <h6 className="card-subtitle mb-1 text-white text-opacity-75 text-uppercase fw-semibold small">
                    Input Tokens
                  </h6>
                  <h3 className="card-title mb-0 fw-bold">
                    {totalInputTokens.toLocaleString()}
                  </h3>
                </div>
              </div>
            </div>
          </div>

          <div className="col-md-3">
            <div className="card shadow-sm border-0 h-100 bg-gradient-info text-white">
              <div className="card-body p-4 d-flex align-items-center">
                <div
                  className="rounded-circle me-3 d-flex align-items-center justify-content-center"
                  style={{
                    backgroundColor: 'rgba(255, 255, 255, 0.2)',
                    width: '56px',
                    height: '56px',
                  }}
                >
                  <i className="fas fa-sign-out-alt fa-lg"></i>
                </div>
                <div>
                  <h6 className="card-subtitle mb-1 text-white text-opacity-75 text-uppercase fw-semibold small">
                    Output Tokens
                  </h6>
                  <h3 className="card-title mb-0 fw-bold">
                    {totalOutputTokens.toLocaleString()}
                  </h3>
                </div>
              </div>
            </div>
          </div>

          <div className="col-md-3">
            <div className="card shadow-sm border-0 h-100 bg-gradient-warning text-white">
              <div className="card-body p-4 d-flex align-items-center">
                <div
                  className="rounded-circle me-3 d-flex align-items-center justify-content-center"
                  style={{
                    backgroundColor: 'rgba(255, 255, 255, 0.2)',
                    width: '56px',
                    height: '56px',
                  }}
                >
                  <i className="fas fa-bolt fa-lg"></i>
                </div>
                <div>
                  <h6 className="card-subtitle mb-1 text-white text-opacity-75 text-uppercase fw-semibold small">
                    Cache Savings
                  </h6>
                  <h3 className="card-title mb-0 fw-bold">
                    {cacheEfficiency}%
                  </h3>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="card shadow-sm border-0 mb-4">
          <div className="card-body p-3">
            <div className="row g-3">
              <div className="col-md-8">
                <div className="input-group">
                  <span className="input-group-text bg-body-secondary border-end-0">
                    <i className="fas fa-search text-muted"></i>
                  </span>
                  <input
                    type="text"
                    className="form-control ps-1"
                    placeholder="Search by ID, produced details, or accepted status..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
              </div>
              <div className="col-md-4">
                <select
                  className="form-select"
                  value={toolFilter}
                  onChange={(e) => setToolFilter(e.target.value)}
                >
                  <option value="all">All Tools</option>
                  {uniqueTools.map((tool) => (
                    <option key={tool} value={tool}>
                      {tool}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Loading / Empty States */}
        {loading ? (
          <div className="text-center py-5">
            <div className="spinner-border text-primary" role="status">
              <span className="visually-hidden">Loading...</span>
            </div>
            <p className="text-muted mt-2">Loading usage logs...</p>
          </div>
        ) : filteredHistory.length === 0 ? (
          <div className="card shadow-sm border-0 text-center py-5">
            <div className="card-body">
              <i className="fas fa-history text-muted fa-4x mb-3 opacity-50"></i>
              <h5 className="fw-semibold text-secondary">
                No History Records Found
              </h5>
              {history.length > 0 && (
                <p className="text-muted mx-auto" style={{ maxWidth: '400px' }}>
                  No records matched your search query or filter selection.
                </p>
              )}
            </div>
          </div>
        ) : (
          /* History Accordion List */
          <div className="d-flex flex-column gap-3">
            {(() => {
              const maxSessionTokens = Math.max(
                ...filteredHistory.map((s) =>
                  s.llmUsages
                    ? s.llmUsages.reduce(
                        (acc, u) => acc + u.inputTokens + u.outputTokens,
                        0,
                      )
                    : 0,
                ),
                0,
              );

              return filteredHistory.map((session) => {
                const isExpanded = !!expandedSessions[session.id];

                // Calculate cache stats for this session
                let sessInput = 0;
                let sessCached = 0;
                let sessOutput = 0;
                if (session.llmUsages) {
                  session.llmUsages.forEach((u) => {
                    sessInput += u.inputTokens;
                    sessCached += u.cacheReadTokens;
                    sessOutput += u.outputTokens;
                  });
                }
                const sessCachePercent =
                  sessInput > 0
                    ? Math.round((sessCached / sessInput) * 100)
                    : 0;

                const sessTotal = sessInput + sessOutput;
                const relativePercent =
                  maxSessionTokens > 0
                    ? (sessTotal / maxSessionTokens) * 100
                    : 0;
                const visualPercent =
                  sessTotal > 0 ? Math.max(relativePercent, 6) : 0;
                const inputWidth =
                  sessTotal > 0 ? (sessInput / sessTotal) * visualPercent : 0;
                const outputWidth =
                  sessTotal > 0 ? (sessOutput / sessTotal) * visualPercent : 0;

                return (
                  <div
                    key={session.id}
                    className="card shadow-sm border-0 overflow-hidden history-card"
                  >
                    <div
                      className="card-header bg-body p-3 d-flex align-items-center justify-content-between cursor-pointer border-0"
                      onClick={() => toggleExpand(session.id)}
                      style={{ userSelect: 'none' }}
                    >
                      <div className="d-flex align-items-center gap-3 flex-grow-1 flex-wrap">
                        <div className="history-tool-icon-wrapper">
                          <i
                            className={`fas ${getToolIcon(session.toolName)} fs-5`}
                          ></i>
                        </div>

                        <div
                          className="flex-shrink-0 min-w-150"
                          style={{ width: '200px' }}
                        >
                          <div className="d-flex align-items-center gap-2 mb-1 flex-wrap">
                            <h6 className="mb-0 fw-bold text-body">
                              {session.toolName}
                            </h6>
                            {session.contextReference && (
                              <span className="badge bg-secondary-subtle text-secondary-emphasis border px-2 py-1 small">
                                {session.contextReference}
                              </span>
                            )}
                          </div>
                          <div className="text-muted small">
                            <i className="far fa-clock me-1"></i>{' '}
                            {formatTimestamp(session.timestamp)}
                          </div>
                        </div>

                        {/* Context Size Relative Visualizer */}
                        <div
                          className="d-none d-lg-flex flex-column justify-content-center flex-grow-1 mx-4"
                          style={{ minWidth: '120px' }}
                        >
                          <span className="text-muted small mb-1">
                            Context Size
                          </span>
                          <div
                            className="progress"
                            style={{
                              height: '8px',
                              backgroundColor:
                                'rgba(var(--bs-body-color-rgb), 0.1)',
                              borderRadius: '4px',
                              overflow: 'hidden',
                            }}
                          >
                            {sessTotal > 0 ? (
                              <>
                                <div
                                  className="progress-bar bg-success bg-gradient"
                                  role="progressbar"
                                  style={{ width: `${inputWidth}%` }}
                                  title={`Input: ${sessInput.toLocaleString()} tokens`}
                                ></div>
                                <div
                                  className="progress-bar bg-info bg-gradient"
                                  role="progressbar"
                                  style={{ width: `${outputWidth}%` }}
                                  title={`Output: ${sessOutput.toLocaleString()} tokens`}
                                ></div>
                              </>
                            ) : (
                              <div
                                className="text-center w-100 text-muted small"
                                style={{ fontSize: '9px', lineHeight: '8px' }}
                              >
                                -
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="me-4 text-start min-w-120">
                          <span className="text-muted small d-block">
                            Produced
                          </span>
                          <strong className="text-secondary-emphasis">
                            {session.aiOutput || '-'}
                          </strong>
                        </div>

                        <div className="me-4 text-start min-w-120">
                          <span className="text-muted small d-block">
                            Accepted
                          </span>
                          {session.pushed ? (
                            <span className="text-success fw-semibold">
                              <i className="fas fa-circle-check me-1"></i>{' '}
                              {session.pushed}
                            </span>
                          ) : (
                            <span className="text-muted">-</span>
                          )}
                        </div>
                      </div>

                      <button className="btn btn-sm btn-link text-secondary-emphasis px-2">
                        <i
                          className={`fas fa-chevron-${isExpanded ? 'up' : 'down'} transition-transform`}
                        ></i>
                      </button>
                    </div>

                    {isExpanded && (
                      <div className="card-body bg-body-tertiary border-top p-4 animate__animated animate__fadeIn">
                        <h6 className="fw-semibold text-secondary mb-3">
                          <i className="fas fa-chart-pie me-2"></i>LLM Usage
                          Breakdown
                        </h6>

                        <div className="table-responsive">
                          <table className="table table-sm table-hover align-middle mb-0 text-start bg-body border rounded">
                            <thead>
                              <tr className="table-light">
                                <th>Phase / Label</th>
                                <th>Model</th>
                                <th className="text-end">Input Tokens</th>
                                <th className="text-end">Output Tokens</th>
                                <th className="text-end">Cached Tokens</th>
                                <th className="text-end">% Cached</th>
                              </tr>
                            </thead>
                            <tbody>
                              {session.llmUsages &&
                              session.llmUsages.length > 0 ? (
                                <>
                                  {session.llmUsages.map((usage, index) => {
                                    const usageCachePercent =
                                      usage.inputTokens > 0
                                        ? Math.round(
                                            (usage.cacheReadTokens /
                                              usage.inputTokens) *
                                              100,
                                          )
                                        : 0;
                                    return (
                                      <tr key={`${usage.id}-${index}`}>
                                        <td className="fw-semibold">
                                          {usage.label}
                                        </td>
                                        <td>
                                          <span className="badge bg-secondary-subtle text-secondary border">
                                            {usage.model}
                                          </span>
                                        </td>
                                        <td className="text-end font-monospace">
                                          {usage.inputTokens.toLocaleString()}
                                        </td>
                                        <td className="text-end font-monospace">
                                          {usage.outputTokens.toLocaleString()}
                                        </td>
                                        <td className="text-end font-monospace">
                                          {usage.cacheReadTokens.toLocaleString()}
                                        </td>
                                        <td className="text-end font-monospace text-muted">
                                          {usageCachePercent}%
                                        </td>
                                      </tr>
                                    );
                                  })}
                                  {session.llmUsages.length > 1 && (
                                    <tr className="table-light fw-bold border-top">
                                      <td>Total</td>
                                      <td></td>
                                      <td className="text-end font-monospace">
                                        {sessInput.toLocaleString()}
                                      </td>
                                      <td className="text-end font-monospace">
                                        {sessOutput.toLocaleString()}
                                      </td>
                                      <td className="text-end font-monospace">
                                        {sessCached.toLocaleString()}
                                      </td>
                                      <td className="text-end font-monospace text-muted">
                                        {sessCachePercent}%
                                      </td>
                                    </tr>
                                  )}
                                </>
                              ) : (
                                <tr>
                                  <td
                                    colSpan={6}
                                    className="text-center text-muted py-3"
                                  >
                                    No LLM usage records found for this session.
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                );
              });
            })()}
          </div>
        )}
      </div>
    </PageLayout>
  );
};

export default UsageHistory;
