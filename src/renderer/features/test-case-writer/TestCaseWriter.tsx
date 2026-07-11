import React, { useState, useEffect, useRef } from 'react';
import { useCopilotModels } from '../../hooks/useCopilotModels';
import ModelDropdown from '../../components/ModelDropdown';
import PageLayout from '../../components/PageLayout';
import { TicketData } from '../../../types';
import { useTimeoutModal, isTimeoutError } from '../../context/TimeoutContext';

interface TestCase {
  id: string;
  description: string;
  preConditions: string;
  steps: string;
  expectedResult: string;
  priority: string;
  deleted?: boolean;
}

const generateTicketOrCommentText = (testCases: string) =>
  [
    'Test Cases:',
    '',
    testCases,
    '',
    '> Generated with Stitch and GitHub Copilot.',
    '> Like any AI generated content, mistakes and hallucinations can occur. Please review before relying on it.',
  ].join('\n');

const convertToMarkdownTable = (tcList: TestCase[]): string => {
  const activeList = tcList.filter((tc) => !tc.deleted);
  if (activeList.length === 0) return '';
  const headers = [
    '| Test Case ID | Description | Pre-conditions | Steps | Expected Result | Priority |',
    '| --- | --- | --- | --- | --- | --- |',
  ];
  const rows = activeList.map((tc, idx) => {
    const id = `TC-${idx + 1}`;
    const desc = (tc.description || '')
      .replace(/\|/g, '\\|')
      .replace(/\n/g, ' ')
      .trim();
    const pre = (tc.preConditions || '')
      .replace(/\|/g, '\\|')
      .replace(/\n/g, '<br>')
      .trim();
    const steps = (tc.steps || '')
      .replace(/\|/g, '\\|')
      .replace(/\n/g, '<br>')
      .trim();
    const expected = (tc.expectedResult || '')
      .replace(/\|/g, '\\|')
      .replace(/\n/g, '<br>')
      .trim();
    const prio = (tc.priority || '').replace(/\|/g, '\\|').trim();
    return `| ${id} | ${desc} | ${pre} | ${steps} | ${expected} | ${prio} |`;
  });
  return [...headers, ...rows].join('\n');
};

const TestCaseWriter: React.FC = () => {
  const { showTimeout } = useTimeoutModal();
  const isMountedRef = useRef(true);
  const [ticketId, setTicketId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<TicketData[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [context, setContext] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStarted, setGenerationStarted] = useState(false);
  const [ticketData, setTicketData] = useState<TicketData | null>(null);
  const [testCasesList, setTestCasesList] = useState<TestCase[]>([]);
  const [error, setError] = useState<string>('');
  const [isPosting, setIsPosting] = useState(false);

  // Reordering states
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const handleDelete = (index: number) => {
    setTestCasesList((prev) =>
      prev.map((tc, idx) => (idx === index ? { ...tc, deleted: true } : tc)),
    );
  };

  const handleRestore = (index: number) => {
    setTestCasesList((prev) =>
      prev.map((tc, idx) => (idx === index ? { ...tc, deleted: false } : tc)),
    );
  };

  const searchContainerRef = useRef<HTMLDivElement>(null);

  // Debounced search effect
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    // If query matches current ticket (meaning it was just selected), don't trigger search again
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

  // Click outside to dismiss dropdown dropdown
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

  // Track component mounting status
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);
  const { models, selectedModel, setSelectedModel, loadingModels } =
    useCopilotModels();

  const handleAddComment = async () => {
    if (testCasesList.length === 0) return;
    setIsPosting(true);
    try {
      const mdTable = convertToMarkdownTable(testCasesList);
      const text = generateTicketOrCommentText(mdTable);
      await window.electronAPI.addComment(ticketId, text);
      alert('Comment added successfully!');
    } catch (err: unknown) {
      console.error(err);
      const errMsg =
        err instanceof Error ? err.message : 'Failed to add comment.';
      alert(errMsg);
    } finally {
      setIsPosting(false);
    }
  };

  const handleAddTask = async () => {
    if (testCasesList.length === 0) return;
    setIsPosting(true);
    try {
      const mdTable = convertToMarkdownTable(testCasesList);
      const text = generateTicketOrCommentText(mdTable);
      await window.electronAPI.createTicket('Task', ticketId, {
        title: 'BA Test',
        description: text,
      });
      alert('Task created successfully!');
    } catch (err: unknown) {
      console.error(err);
      const errMsg =
        err instanceof Error ? err.message : 'Failed to create task.';
      alert(errMsg);
    } finally {
      setIsPosting(false);
    }
  };

  const handleGenerate = async () => {
    if (!ticketId) {
      setError('Please enter a ticket ID.');
      return;
    }

    setError('');
    setIsGenerating(true);
    setGenerationStarted(true);
    setTestCasesList([]);
    setTicketData(null);

    // Set up real-time listener for incoming lines
    const unsubscribe = window.electronAPI.onTestCaseLine((line: string) => {
      if (!isMountedRef.current) return;
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('```')) return;

      try {
        const testCase: TestCase = JSON.parse(trimmed);
        if (testCase && typeof testCase === 'object') {
          setTestCasesList((prev) => {
            const generatedId = `TC-${prev.length + 1}`;
            const exists = prev.some((tc) => tc.id === generatedId);
            if (exists) {
              return prev.map((tc) =>
                tc.id === generatedId ? { ...testCase, id: generatedId } : tc,
              );
            }
            return [...prev, { ...testCase, id: generatedId }];
          });
        }
      } catch (err) {
        console.warn('Failed to parse JSONL line:', trimmed, err);
      }
    });

    try {
      // 1. Fetch Ticket Data
      const fetchedTicket = await window.electronAPI.fetchTicket(ticketId);
      if (!isMountedRef.current) return;
      setTicketData(fetchedTicket);

      // 2. Generate Test Cases using Copilot SDK (this will stream lines via event listeners)
      await window.electronAPI.generateTestCases(
        fetchedTicket,
        context,
        selectedModel,
      );
    } catch (err: unknown) {
      if (!isMountedRef.current) return;
      console.error(err);
      const errMsg =
        err instanceof Error
          ? err.message
          : 'An error occurred during generation.';
      if (isTimeoutError(err)) {
        showTimeout(err);
      } else {
        setError(errMsg);
      }
    } finally {
      unsubscribe();
      if (isMountedRef.current) {
        setIsGenerating(false);
      }
    }
  };

  return (
    <PageLayout title="Test Case Writer" maxWidth="100%">
      <div className="row animate__animated animate__fadeIn">
        {/* Left Column: Input Form */}
        <div className="col-md-4 col-lg-3">
          <div className="card shadow-sm border-0 mb-4">
            <div className="card-header bg-primary text-white py-3">
              <h5 className="mb-0 fw-semibold">
                <i className="fas fa-edit me-2"></i>Ticket Details
              </h5>
            </div>
            <div className="card-body p-4">
              {error && <div className="alert alert-danger">{error}</div>}

              <div className="mb-3 position-relative" ref={searchContainerRef}>
                <label className="form-label fw-medium text-secondary">
                  Ticket Search (Azure DevOps)
                </label>
                <div className="input-group">
                  <span className="input-group-text bg-body-secondary border-2 border-end-0">
                    {isSearching ? (
                      <span
                        className="spinner-border spinner-border-sm text-primary"
                        role="status"
                      ></span>
                    ) : (
                      <i className="fas fa-search text-muted"></i>
                    )}
                  </span>
                  <input
                    type="text"
                    className="form-control form-control-lg border-2 border-start-0 ps-1"
                    placeholder="Search by title, text or ID..."
                    value={searchQuery}
                    onChange={(e) => {
                      const val = e.target.value;
                      setSearchQuery(val);
                      setIsDropdownOpen(val.trim().length > 0);

                      // Support direct numeric typing
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
                    disabled={isGenerating}
                  />
                  {searchQuery && (
                    <button
                      className="btn btn-outline-secondary border-2 border-start-0"
                      type="button"
                      onClick={() => {
                        setSearchQuery('');
                        setTicketId('');
                        setSearchResults([]);
                        setIsDropdownOpen(false);
                      }}
                      disabled={isGenerating}
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
                            className="spinner-border spinner-border-sm me-2 text-primary"
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
                            <span className="fw-bold text-primary small">
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

                {isDropdownOpen &&
                  !isSearching &&
                  searchQuery.trim().length > 0 &&
                  searchResults.length === 0 && (
                    <div
                      className="dropdown-menu show w-100 shadow-lg border rounded-3 mt-1 py-3 text-center text-muted small"
                      style={{
                        position: 'absolute',
                        zIndex: 1050,
                        backgroundColor: 'var(--bs-body-bg)',
                        borderColor: 'var(--bs-border-color)',
                      }}
                    >
                      No work items found.
                    </div>
                  )}
              </div>

              <div className="mb-4">
                <label className="form-label fw-medium text-secondary">
                  Additional Context (Optional)
                </label>
                <textarea
                  className="form-control border-2"
                  rows={4}
                  placeholder="e.g., focus on edge cases or accessibility requirements..."
                  value={context}
                  onChange={(e) => setContext(e.target.value)}
                  disabled={isGenerating}
                />
              </div>

              <button
                className="btn btn-primary btn-lg w-100 py-3 shadow-sm hover-grow"
                onClick={handleGenerate}
                disabled={isGenerating}
              >
                {isGenerating ? (
                  <>
                    <span
                      className="spinner-border spinner-border-sm me-2"
                      role="status"
                      aria-hidden="true"
                    ></span>
                    Generating...
                  </>
                ) : (
                  <>
                    <i className="fas fa-magic me-2"></i>
                    Generate Test Cases
                  </>
                )}
              </button>
            </div>
          </div>

          {ticketData && (
            <div className="card shadow-sm border-0 border-start border-info border-4 mb-3">
              <div className="card-header bg-body-secondary border-bottom py-2">
                <h6 className="mb-0 text-info fw-bold small">
                  <i className="fas fa-ticket-alt me-2"></i>Fetched Ticket: #
                  {ticketData.id}
                </h6>
              </div>
              <div className="card-body p-3">
                <h6
                  className="fw-semibold mb-2 small text-truncate"
                  title={ticketData.title}
                >
                  {ticketData.title}
                </h6>
                <div
                  className="text-muted small overflow-auto"
                  style={{ maxHeight: '100px', lineHeight: '1.5' }}
                  dangerouslySetInnerHTML={{ __html: ticketData.description }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Results */}
        <div className="col-md-8 col-lg-9">
          <div
            className="card shadow-sm border-0 d-flex flex-column"
            style={{ height: 'calc(100vh - 195px)', minHeight: '400px' }}
          >
            <div className="card-header bg-dark text-white py-3 d-flex justify-content-between align-items-center flex-shrink-0">
              <h5 className="mb-0 fw-semibold">
                <i className="fas fa-clipboard-list me-2"></i>Generated Test
                Cases
              </h5>
              <div className="d-flex align-items-center gap-3">
                {!generationStarted && (
                  <ModelDropdown
                    models={models}
                    selectedModel={selectedModel}
                    onSelect={setSelectedModel}
                    loading={loadingModels}
                    className="w-auto border-0 shadow-sm"
                  />
                )}
                {testCasesList.length > 0 && (
                  <button
                    className="btn btn-sm btn-outline-light px-3 py-2 fw-medium"
                    onClick={() => {
                      const mdTable = convertToMarkdownTable(testCasesList);
                      navigator.clipboard.writeText(mdTable);
                    }}
                    disabled={isGenerating}
                  >
                    <i className="fas fa-copy me-2"></i>
                    Copy Table
                  </button>
                )}
              </div>
            </div>
            <div className="card-body p-4 overflow-auto flex-grow-1">
              {testCasesList.length > 0 ? (
                <div className="table-responsive border rounded-3 overflow-hidden shadow-sm">
                  <table className="table table-striped table-hover align-middle mb-0">
                    <thead className="table-dark">
                      <tr>
                        <th style={{ width: '10%', minWidth: '80px' }}>ID</th>
                        <th style={{ width: '22%', minWidth: '150px' }}>
                          Description
                        </th>
                        <th style={{ width: '18%', minWidth: '130px' }}>
                          Pre-conditions
                        </th>
                        <th style={{ width: '22%', minWidth: '180px' }}>
                          Steps
                        </th>
                        <th style={{ width: '12%', minWidth: '100px' }}>
                          Expected Result
                        </th>
                        <th style={{ width: '8%', minWidth: '80px' }}>
                          Priority
                        </th>
                        <th
                          style={{
                            width: '8%',
                            minWidth: '70px',
                            textAlign: 'center',
                          }}
                        ></th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        let activeCount = 0;
                        return testCasesList.map((tc, index) => {
                          const isDeleted = tc.deleted;
                          if (!isDeleted) {
                            activeCount++;
                          }
                          const displayId = isDeleted
                            ? ''
                            : `TC-${activeCount}`;

                          if (isDeleted) {
                            return (
                              <tr
                                key={tc.id || index}
                                className="table-light align-middle text-muted animate__animated animate__fadeIn"
                                style={{ height: '45px', opacity: 0.8 }}
                              >
                                <td className="text-center text-muted small fst-italic">
                                  -
                                </td>
                                <td
                                  colSpan={5}
                                  className="small fst-italic py-2"
                                >
                                  <i className="fas fa-trash-alt me-2 text-secondary"></i>
                                  Test scenario deleted.
                                </td>
                                <td className="text-center">
                                  <button
                                    className="btn btn-link text-primary p-0 border-0 fw-semibold small"
                                    onClick={() => handleRestore(index)}
                                    disabled={isGenerating}
                                    title="Restore test case"
                                    style={{
                                      boxShadow: 'none',
                                      textDecoration: 'none',
                                    }}
                                  >
                                    <i className="fas fa-undo me-1"></i>
                                    Restore
                                  </button>
                                </td>
                              </tr>
                            );
                          }

                          return (
                            <tr
                              key={tc.id || index}
                              className={`animate__animated animate__fadeInUp ${
                                draggedIndex === index ? 'is-dragging' : ''
                              } ${
                                dragOverIndex === index
                                  ? draggedIndex !== null &&
                                    draggedIndex < index
                                    ? 'drag-over-target-bottom'
                                    : 'drag-over-target-top'
                                  : ''
                              }`}
                              style={{ animationDuration: '0.4s' }}
                              onDragOver={(e) => {
                                if (draggedIndex === null) return;
                                e.preventDefault();
                                if (dragOverIndex !== index) {
                                  setDragOverIndex(index);
                                }
                              }}
                              onDragLeave={() => {
                                setDragOverIndex(null);
                              }}
                              onDrop={(e) => {
                                e.preventDefault();
                                if (
                                  draggedIndex === null ||
                                  draggedIndex === index
                                ) {
                                  setDragOverIndex(null);
                                  return;
                                }

                                const listCopy = [...testCasesList];
                                const [draggedItem] = listCopy.splice(
                                  draggedIndex,
                                  1,
                                );
                                listCopy.splice(index, 0, draggedItem);

                                // Re-map IDs sequentially to keep them in order (TC-1, TC-2, etc.)
                                const reorderedList = listCopy.map(
                                  (item, idx) => ({
                                    ...item,
                                    id: `TC-${idx + 1}`,
                                  }),
                                );

                                setTestCasesList(reorderedList);
                                setDraggedIndex(null);
                                setDragOverIndex(null);
                              }}
                            >
                              <td className="fw-bold text-primary">
                                {displayId}
                              </td>
                              <td className="text-secondary small">
                                {tc.description}
                              </td>
                              <td className="text-secondary small whitespace-pre-wrap">
                                {tc.preConditions}
                              </td>
                              <td
                                className="text-secondary small whitespace-pre-wrap"
                                style={{ whiteSpace: 'pre-wrap' }}
                              >
                                {tc.steps}
                              </td>
                              <td className="text-secondary small whitespace-pre-wrap">
                                {tc.expectedResult}
                              </td>
                              <td>
                                <span
                                  className={`badge rounded-pill px-3 py-2 fw-semibold ${
                                    tc.priority?.toLowerCase() === 'high'
                                      ? 'bg-danger text-white'
                                      : tc.priority?.toLowerCase() === 'medium'
                                        ? 'bg-warning text-dark'
                                        : 'bg-secondary text-white'
                                  }`}
                                >
                                  {tc.priority || 'Medium'}
                                </span>
                              </td>
                              <td className="text-center">
                                <div className="d-flex align-items-center justify-content-center gap-2">
                                  <button
                                    className="btn btn-link text-danger p-0 border-0"
                                    onClick={() => handleDelete(index)}
                                    disabled={isGenerating}
                                    title="Delete test case"
                                    style={{ boxShadow: 'none' }}
                                  >
                                    <i className="fas fa-trash-alt"></i>
                                  </button>
                                  <div
                                    className={`drag-handle py-1 ${
                                      isGenerating ? 'drag-disabled' : ''
                                    }`}
                                    draggable={!isGenerating}
                                    onDragStart={(e) => {
                                      if (isGenerating) {
                                        e.preventDefault();
                                        return;
                                      }
                                      e.dataTransfer.effectAllowed = 'move';
                                      e.dataTransfer.setData(
                                        'text/plain',
                                        index.toString(),
                                      );
                                      setDraggedIndex(index);
                                    }}
                                    onDragEnd={() => {
                                      setDraggedIndex(null);
                                      setDragOverIndex(null);
                                    }}
                                    title={
                                      isGenerating
                                        ? 'Cannot reorder while generating'
                                        : 'Drag to reorder'
                                    }
                                  >
                                    <i className="fas fa-grip-lines"></i>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          );
                        });
                      })()}
                      {isGenerating && (
                        <tr className="animate__animated animate__fadeIn opacity-75">
                          <td className="py-3">
                            <div className="d-flex align-items-center gap-2">
                              <span
                                className="spinner-grow spinner-grow-sm text-primary"
                                role="status"
                                style={{ animationDuration: '1s' }}
                              ></span>
                              <span className="text-muted small">...</span>
                            </div>
                          </td>
                          <td colSpan={6} className="py-3">
                            <span className="text-muted small fst-italic animate__animated animate__pulse animate__infinite d-inline-block">
                              Generating next test case...
                            </span>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-5 my-5 text-muted">
                  {isGenerating ? (
                    <div className="py-5">
                      <div
                        className="spinner-grow text-primary"
                        role="status"
                        style={{ width: '3rem', height: '3rem' }}
                      ></div>
                      <p className="mt-4 fs-5 fw-medium">
                        Streaming test cases from Copilot...
                      </p>
                      <p className="text-secondary small">
                        Please wait as test scenarios are progressively parsed
                        and rendered.
                      </p>
                    </div>
                  ) : (
                    <div className="py-5">
                      <i
                        className="fas fa-clipboard text-light-hover mb-4"
                        style={{ fontSize: '4rem' }}
                      ></i>
                      <p className="fs-5 fw-semibold text-secondary">
                        No Test Cases Generated Yet
                      </p>
                      <p className="small text-muted">
                        Enter a ticket ID and click "Generate" to stream test
                        scenarios here in real-time.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
            {testCasesList.length > 0 && (
              <div className="card-footer bg-body-tertiary py-3 d-flex justify-content-end gap-3 border-top flex-shrink-0">
                <button
                  className="btn btn-outline-primary px-4 py-2 fw-semibold"
                  onClick={handleAddComment}
                  disabled={isPosting || isGenerating}
                >
                  <i className="fas fa-comment me-2"></i>
                  Add Comment
                </button>
                <button
                  className="btn btn-primary px-4 py-2 fw-semibold"
                  onClick={handleAddTask}
                  disabled={isPosting || isGenerating}
                >
                  <i className="fas fa-tasks me-2"></i>
                  Add Task
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </PageLayout>
  );
};

export default TestCaseWriter;
