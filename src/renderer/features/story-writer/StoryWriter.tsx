import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useCopilotModels } from '../../hooks/useCopilotModels';
import ModelDropdown from '../../components/ModelDropdown';
import PageLayout from '../../components/PageLayout';
import { DocPageData, TicketData, CopilotUsage } from '../../../types';
import { useTimeoutModal, isTimeoutError } from '../../context/TimeoutContext';
import UsageStatsToast from '../../components/UsageStatsToast';

interface Story {
  title: string;
  description: string;
  acceptanceCriteria: string;
  notes?: string;
}

const StoryWriter: React.FC = () => {
  const { showTimeout } = useTimeoutModal();
  const isMountedRef = useRef(true);
  const [featureType, setFeatureType] = useState('Feature');
  const [storyType, setStoryType] = useState('Product Backlog Item');
  const [usageStats, setUsageStats] = useState<CopilotUsage | null>(null);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const settings = await window.electronAPI.getSettings();
        if (settings) {
          if (settings.featureType) {
            setFeatureType(settings.featureType);
          }
          if (settings.storyType) {
            setStoryType(settings.storyType);
          }
        }
      } catch (err) {
        console.error('Failed to load settings in StoryWriter:', err);
      }
    };
    fetchSettings();
  }, []);

  const [pageId, setPageId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<DocPageData[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [context, setContext] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStarted, setGenerationStarted] = useState(false);
  const [pageData, setPageData] = useState<DocPageData | null>(null);
  const [stories, setStories] = useState<Story[]>([]);
  const [error, setError] = useState<string>('');
  const [featureId, setFeatureId] = useState('');

  const [featureSearchQuery, setFeatureSearchQuery] = useState('');
  const [featureSearchResults, setFeatureSearchResults] = useState<
    TicketData[]
  >([]);
  const [isSearchingFeatures, setIsSearchingFeatures] = useState(false);
  const [isFeatureDropdownOpen, setIsFeatureDropdownOpen] = useState(false);

  const [collapsedStories, setCollapsedStories] = useState<
    Record<number, boolean>
  >({});
  const [createdStories, setCreatedStories] = useState<Record<number, boolean>>(
    {},
  );
  const [discardedStories, setDiscardedStories] = useState<
    Record<number, boolean>
  >({});
  const [creatingStories, setCreatingStories] = useState<
    Record<number, boolean>
  >({});

  const searchContainerRef = useRef<HTMLDivElement>(null);
  const featureSearchContainerRef = useRef<HTMLDivElement>(null);

  // Debounced Confluence search effect
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    // If query matches current page (meaning it was just selected), don't trigger search again
    if (pageId && searchQuery.startsWith(`#${pageId} -`)) {
      return;
    }

    setIsSearching(true);
    const delayDebounceFn = setTimeout(async () => {
      try {
        const results =
          await window.electronAPI.searchConfluencePages(searchQuery);
        setSearchResults(results);
      } catch (err) {
        console.error('Error searching pages:', err);
      } finally {
        setIsSearching(false);
      }
    }, 400);

    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery, pageId]);

  // Debounced Feature search effect
  useEffect(() => {
    if (!featureSearchQuery.trim()) {
      setFeatureSearchResults([]);
      return;
    }

    // If query matches current feature (meaning it was just selected), don't trigger search again
    if (featureId && featureSearchQuery.startsWith(`#${featureId} -`)) {
      return;
    }

    setIsSearchingFeatures(true);
    const delayDebounceFn = setTimeout(async () => {
      try {
        const results = await window.electronAPI.searchTickets(
          featureSearchQuery,
          featureType,
        );
        setFeatureSearchResults(results);
      } catch (err) {
        console.error('Error searching features:', err);
      } finally {
        setIsSearchingFeatures(false);
      }
    }, 400);

    return () => clearTimeout(delayDebounceFn);
  }, [featureSearchQuery, featureId]);

  // Click outside to dismiss dropdowns
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        searchContainerRef.current &&
        !searchContainerRef.current.contains(event.target as Node)
      ) {
        setIsDropdownOpen(false);
      }
      if (
        featureSearchContainerRef.current &&
        !featureSearchContainerRef.current.contains(event.target as Node)
      ) {
        setIsFeatureDropdownOpen(false);
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

  const handleGenerate = async () => {
    if (!pageId) {
      setError('Please enter a Confluence Page ID.');
      return;
    }
    if (!featureId) {
      setError('Please enter a Feature ID.');
      return;
    }

    const triggerNotification = (title: string, body: string) => {
      if (!document.hasFocus()) {
        window.electronAPI.showNotification(title, body).catch((err) => {
          console.error('Failed to show notification:', err);
        });
      }
    };

    setError('');
    setIsGenerating(true);
    setGenerationStarted(true);
    setStories([]);
    setPageData(null);
    setCollapsedStories({});
    setCreatedStories({});
    setDiscardedStories({});
    setCreatingStories({});

    // Set up real-time listener for incoming lines
    const unsubscribe = window.electronAPI.onStoryLine((line: string) => {
      if (!isMountedRef.current) return;
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('```')) return;

      try {
        const story: Story = JSON.parse(trimmed);
        if (story && typeof story === 'object') {
          setStories((prev) => {
            const exists = prev.some((s) => s.title === story.title);
            if (exists) {
              return prev.map((s) => (s.title === story.title ? story : s));
            }
            return [...prev, story];
          });
        }
      } catch (err) {
        console.warn('Failed to parse JSONL line:', trimmed, err);
      }
    });

    try {
      // 1. Fetch Page Data
      const fetchedPage = await window.electronAPI.fetchConfluencePage(pageId);
      if (!isMountedRef.current) return;
      setPageData(fetchedPage);

      setUsageStats(null);
      // 2. Generate Stories using Copilot SDK (this will stream lines via event listeners)
      const res = await window.electronAPI.generateStories(
        fetchedPage,
        context,
        selectedModel,
      );
      if (res && res.usage) {
        setUsageStats(res.usage);
      }
      triggerNotification(
        'Story Generation Complete',
        `Stitch has successfully generated stories for Confluence page "${fetchedPage.title}".`,
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
      triggerNotification(
        'Story Generation Failed',
        `Failed to generate stories: ${errMsg}`,
      );
    } finally {
      unsubscribe();
      if (isMountedRef.current) {
        setIsGenerating(false);
      }
    }
  };

  const handleToggleCollapse = (index: number) => {
    setCollapsedStories((prev) => ({ ...prev, [index]: !prev[index] }));
  };

  const handleDiscardStory = (index: number) => {
    setDiscardedStories((prev) => ({ ...prev, [index]: true }));
    setCollapsedStories((prev) => ({ ...prev, [index]: true }));
  };

  const handleCreateStory = async (story: Story, index: number) => {
    if (!featureId) {
      alert('Please enter a Feature ID.');
      return;
    }

    setCreatingStories((prev) => ({ ...prev, [index]: true }));
    try {
      const descriptionWithDisclaimer = [
        story.description,
        '',
        '> Generated with Stitch and GitHub Copilot.',
        '> Like any AI generated content, mistakes and hallucinations can occur. Please review before relying on it.',
      ].join('\n');

      await window.electronAPI.createTicket(storyType, featureId, {
        title: story.title,
        description: descriptionWithDisclaimer,
        acceptanceCriteria: story.acceptanceCriteria,
      });

      setCreatedStories((prev) => ({ ...prev, [index]: true }));
      setCollapsedStories((prev) => ({ ...prev, [index]: true }));
    } catch (err: unknown) {
      console.error(err);
      const errMsg =
        err instanceof Error ? err.message : 'Failed to create story.';
      alert(errMsg);
    } finally {
      setCreatingStories((prev) => ({ ...prev, [index]: false }));
    }
  };

  return (
    <PageLayout title="Story Writer" maxWidth="100%">
      <div className="row animate__animated animate__fadeIn">
        {/* Left Column: Input Form */}
        <div className="col-md-4 col-lg-3">
          <div className="card shadow-sm border-0 mb-4">
            <div className="card-header bg-success text-white py-3">
              <h5 className="mb-0 fw-semibold">
                <i className="fas fa-file-alt me-2"></i>Confluence Details
              </h5>
            </div>
            <div className="card-body p-4">
              {error && <div className="alert alert-danger">{error}</div>}

              <div className="mb-3 position-relative" ref={searchContainerRef}>
                <label className="form-label fw-medium text-secondary">
                  Page Search (Confluence)
                </label>
                <div className="input-group">
                  <span className="input-group-text bg-body-secondary border-2 border-end-0">
                    {isSearching ? (
                      <span
                        className="spinner-border spinner-border-sm text-success"
                        role="status"
                      ></span>
                    ) : (
                      <i className="fas fa-search text-muted"></i>
                    )}
                  </span>
                  <input
                    type="text"
                    className="form-control form-control-lg border-2 border-start-0 ps-1"
                    placeholder="Search by title or ID..."
                    value={searchQuery}
                    onChange={(e) => {
                      const val = e.target.value;
                      setSearchQuery(val);
                      setIsDropdownOpen(val.trim().length > 0);

                      // Support direct numeric typing
                      if (/^\d+$/.test(val.trim())) {
                        setPageId(val.trim());
                      } else {
                        setPageId('');
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
                        setPageId('');
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
                            className="spinner-border spinner-border-sm me-2 text-success"
                            role="status"
                          ></span>
                          Searching pages...
                        </div>
                      ) : (
                        searchResults.map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            className="dropdown-item py-2 border-bottom border-light text-start d-flex flex-column gap-1"
                            onClick={() => {
                              setPageId(item.id || '');
                              setSearchQuery(`#${item.id} - ${item.title}`);
                              setIsDropdownOpen(false);
                            }}
                            style={{ whiteSpace: 'normal', cursor: 'pointer' }}
                          >
                            <span className="fw-bold text-success small">
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
                      No Confluence pages found.
                    </div>
                  )}
              </div>

              <div
                className="mb-3 position-relative"
                ref={featureSearchContainerRef}
              >
                <label className="form-label fw-medium text-secondary">
                  Feature ID / Search (Azure DevOps)
                </label>
                <div className="input-group">
                  <span className="input-group-text bg-body-secondary border-2 border-end-0">
                    {isSearchingFeatures ? (
                      <span
                        className="spinner-border spinner-border-sm text-success"
                        role="status"
                      ></span>
                    ) : (
                      <i className="fas fa-search text-muted"></i>
                    )}
                  </span>
                  <input
                    type="text"
                    className="form-control form-control-lg border-2 border-start-0 ps-1"
                    placeholder="Search features or type ID..."
                    value={featureSearchQuery}
                    onChange={(e) => {
                      const val = e.target.value;
                      setFeatureSearchQuery(val);
                      setIsFeatureDropdownOpen(val.trim().length > 0);

                      // Support direct numeric typing
                      if (/^\d+$/.test(val.trim())) {
                        setFeatureId(val.trim());
                      } else {
                        setFeatureId('');
                      }
                    }}
                    onFocus={() => {
                      if (featureSearchQuery.trim().length > 0) {
                        setIsFeatureDropdownOpen(true);
                      }
                    }}
                    disabled={isGenerating}
                  />
                  {featureSearchQuery && (
                    <button
                      className="btn btn-outline-secondary border-2 border-start-0"
                      type="button"
                      onClick={() => {
                        setFeatureSearchQuery('');
                        setFeatureId('');
                        setFeatureSearchResults([]);
                        setIsFeatureDropdownOpen(false);
                      }}
                      disabled={isGenerating}
                    >
                      <i className="fas fa-times"></i>
                    </button>
                  )}
                </div>

                {isFeatureDropdownOpen &&
                  (featureSearchResults.length > 0 || isSearchingFeatures) && (
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
                      {isSearchingFeatures ? (
                        <div className="dropdown-item text-muted py-3 text-center">
                          <span
                            className="spinner-border spinner-border-sm me-2 text-success"
                            role="status"
                          ></span>
                          Searching features...
                        </div>
                      ) : (
                        featureSearchResults.map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            className="dropdown-item py-2 border-bottom border-light text-start d-flex flex-column gap-1"
                            onClick={() => {
                              setFeatureId(item.id || '');
                              setFeatureSearchQuery(
                                `#${item.id} - ${item.title}`,
                              );
                              setIsFeatureDropdownOpen(false);
                            }}
                            style={{ whiteSpace: 'normal', cursor: 'pointer' }}
                          >
                            <span className="fw-bold text-success small">
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

                {isFeatureDropdownOpen &&
                  !isSearchingFeatures &&
                  featureSearchQuery.trim().length > 0 &&
                  featureSearchResults.length === 0 && (
                    <div
                      className="dropdown-menu show w-100 shadow-lg border rounded-3 mt-1 py-3 text-center text-muted small"
                      style={{
                        position: 'absolute',
                        zIndex: 1050,
                        backgroundColor: 'var(--bs-body-bg)',
                        borderColor: 'var(--bs-border-color)',
                      }}
                    >
                      No features found.
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
                  placeholder="e.g., focus on backend APIs or split them by component..."
                  value={context}
                  onChange={(e) => setContext(e.target.value)}
                  disabled={isGenerating}
                />
              </div>

              <button
                className="btn btn-success btn-lg w-100 py-3 shadow-sm hover-grow"
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
                    Generate Stories
                  </>
                )}
              </button>
            </div>
          </div>

          {pageData && (
            <div className="card shadow-sm border-0 border-start border-info border-4 mb-3">
              <div className="card-header bg-body-secondary border-bottom py-2">
                <h6
                  className="mb-0 text-info fw-bold small text-truncate"
                  title={`Fetched Page: ${pageData.title}`}
                >
                  <i className="fas fa-file-invoice me-2"></i>Fetched Page:{' '}
                  {pageData.title}
                </h6>
              </div>
              <div className="card-body p-3">
                <div
                  className="text-muted small overflow-auto"
                  style={{ maxHeight: '100px', lineHeight: '1.5' }}
                  dangerouslySetInnerHTML={{ __html: pageData.body }}
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
                <i className="fas fa-clipboard-list me-2"></i>Generated Stories
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
              </div>
            </div>
            <div className="card-body p-4 overflow-auto flex-grow-1">
              {stories.length > 0 ? (
                <div className="stories-list">
                  {stories.map((story, index) => {
                    if (collapsedStories[index]) {
                      return (
                        <div
                          key={index}
                          className="card shadow-sm border-0 mb-2 bg-body-secondary opacity-75 animate__animated animate__fadeInUp"
                          style={{ animationDuration: '0.4s' }}
                        >
                          <div className="card-body p-2 d-flex align-items-center justify-content-between">
                            <div className="d-flex align-items-center gap-2">
                              <span
                                className="fw-bold text-secondary small text-truncate"
                                style={{ maxWidth: '300px' }}
                                title={story.title}
                              >
                                <i className="fas fa-book me-2"></i>
                                {story.title}
                              </span>
                              {createdStories[index] ? (
                                <span className="text-success small fw-semibold">
                                  <i className="fas fa-check-circle me-1"></i>
                                  Created
                                </span>
                              ) : (
                                <span className="text-muted small fw-semibold">
                                  <i className="fas fa-times-circle me-1"></i>
                                  Discarded
                                </span>
                              )}
                            </div>
                            <button
                              className="btn btn-sm btn-link text-decoration-none p-0 px-2 fw-semibold text-success"
                              onClick={() => handleToggleCollapse(index)}
                            >
                              <i className="fas fa-chevron-down me-1"></i>{' '}
                              Expand
                            </button>
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div
                        key={index}
                        className={`card shadow-sm border-0 border-start border-4 mb-3 animate__animated animate__fadeInUp ${
                          createdStories[index]
                            ? 'border-success'
                            : discardedStories[index]
                              ? 'border-secondary opacity-75'
                              : 'border-success'
                        }`}
                        style={{ animationDuration: '0.4s' }}
                      >
                        <div className="card-header d-flex justify-content-between align-items-center bg-body-secondary border-bottom py-3">
                          <h6
                            className={`mb-0 fw-bold ${createdStories[index] ? 'text-success' : discardedStories[index] ? 'text-secondary' : 'text-success'}`}
                          >
                            <i className="fas fa-book me-2"></i>
                            {story.title}
                          </h6>
                          <div className="d-flex align-items-center gap-2">
                            {createdStories[index] && (
                              <span className="badge bg-success-subtle text-success-emphasis me-2">
                                <i className="fas fa-check-circle me-1"></i>
                                Created
                              </span>
                            )}
                            {discardedStories[index] && (
                              <span className="badge bg-secondary-subtle text-secondary-emphasis me-2">
                                <i className="fas fa-times-circle me-1"></i>
                                Discarded
                              </span>
                            )}
                            <button
                              className="btn btn-sm btn-link text-decoration-none p-0 text-secondary"
                              onClick={() => handleToggleCollapse(index)}
                              title="Collapse card"
                            >
                              <i className="fas fa-chevron-up"></i>
                            </button>
                          </div>
                        </div>
                        <div className="card-body p-4">
                          <div className="mb-3">
                            <strong className="text-secondary small d-block mb-1">
                              Description
                            </strong>
                            <p className="mb-0 text-body small">
                              {story.description}
                            </p>
                          </div>
                          <div className="mb-3">
                            <strong className="text-secondary small d-block mb-2">
                              Acceptance Criteria
                            </strong>
                            <div className="markdown-content p-3 rounded-3 border bg-body-tertiary small">
                              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                {story.acceptanceCriteria}
                              </ReactMarkdown>
                            </div>
                          </div>
                          {story.notes && (
                            <div className="mb-3">
                              <strong className="text-secondary small d-block mb-1">
                                Notes
                              </strong>
                              <p className="text-muted small mb-0 bg-body-tertiary p-2 rounded-3 border-start border-3 border-secondary">
                                {story.notes}
                              </p>
                            </div>
                          )}

                          {/* Card Actions */}
                          <div className="d-flex justify-content-end gap-2 mt-3 pt-2 border-top border-secondary-subtle">
                            <button
                              className="btn btn-sm btn-outline-secondary"
                              onClick={() => handleDiscardStory(index)}
                              disabled={
                                creatingStories[index] || createdStories[index]
                              }
                            >
                              <i className="fas fa-trash-alt me-1"></i>
                              Discard
                            </button>
                            <button
                              className={`btn btn-sm ${createdStories[index] ? 'btn-success' : 'btn-primary'}`}
                              onClick={() => handleCreateStory(story, index)}
                              disabled={
                                creatingStories[index] || createdStories[index]
                              }
                            >
                              {creatingStories[index] ? (
                                <>
                                  <span className="spinner-border spinner-border-sm me-1"></span>
                                  Creating...
                                </>
                              ) : createdStories[index] ? (
                                <>
                                  <i className="fas fa-check me-1"></i>
                                  Created
                                </>
                              ) : (
                                <>
                                  <i className="fas fa-plus me-1"></i>
                                  Create Story
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {isGenerating && (
                    <div
                      className="card shadow-sm border-0 border-start border-success border-4 mb-3 animate__animated animate__fadeIn opacity-75"
                      style={{ animationDuration: '0.4s' }}
                    >
                      <div className="card-header d-flex justify-content-between align-items-center bg-body-secondary border-bottom py-3">
                        <h6 className="mb-0 text-success fw-bold d-flex align-items-center gap-2">
                          <span
                            className="spinner-grow spinner-grow-sm text-success"
                            role="status"
                            style={{ animationDuration: '1s' }}
                          ></span>
                          <span className="text-muted small">
                            Generating next story...
                          </span>
                        </h6>
                      </div>
                      <div className="card-body p-4">
                        <div className="placeholder-glow">
                          <span className="placeholder col-6 mb-2"></span>
                          <span className="placeholder col-8 mb-3 d-block"></span>
                          <span
                            className="placeholder col-12 mb-2 d-block"
                            style={{ height: '40px' }}
                          ></span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-5 my-5 text-muted">
                  {isGenerating ? (
                    <div className="py-5">
                      <div
                        className="spinner-grow text-success"
                        role="status"
                        style={{ width: '3rem', height: '3rem' }}
                      ></div>
                      <p className="mt-4 fs-5 fw-medium">
                        Asking Copilot to write stories...
                      </p>
                      <p className="text-secondary small">
                        Please wait while Copilot structures backlog items for
                        you.
                      </p>
                    </div>
                  ) : (
                    <div className="py-5">
                      <i
                        className="fas fa-clipboard text-light-hover mb-4"
                        style={{ fontSize: '4rem' }}
                      ></i>
                      <p className="fs-5 fw-semibold text-secondary">
                        No Stories Generated Yet
                      </p>
                      <p className="small text-muted">
                        Enter a Confluence Page ID and click "Generate" to see
                        the results here.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
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

export default StoryWriter;
