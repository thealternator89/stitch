import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useCopilotModels } from '../../hooks/useCopilotModels';
import ModelDropdown from '../../components/ModelDropdown';
import PageLayout from '../../components/PageLayout';
import { DocPageData } from '../../../types';
import { useTimeoutModal, isTimeoutError } from '../../context/TimeoutContext';

interface Story {
  title: string;
  description: string;
  acceptanceCriteria: string;
  notes?: string;
  checked?: boolean;
}

const StoryWriter: React.FC = () => {
  const { showTimeout } = useTimeoutModal();
  const isMountedRef = useRef(true);
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
  const [isCreating, setIsCreating] = useState(false);

  const searchContainerRef = useRef<HTMLDivElement>(null);

  // Debounced search effect
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

  // Click outside to dismiss dropdown
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

  const handleGenerate = async () => {
    if (!pageId) {
      setError('Please enter a Confluence Page ID.');
      return;
    }

    setError('');
    setIsGenerating(true);
    setGenerationStarted(true);
    setStories([]);
    setPageData(null);

    // Set up real-time listener for incoming lines
    const unsubscribe = window.electronAPI.onStoryLine((line: string) => {
      if (!isMountedRef.current) return;
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('```')) return;

      try {
        const story: Story = JSON.parse(trimmed);
        if (story && typeof story === 'object') {
          setStories((prev) => {
            const storyWithCheck = { ...story, checked: true };
            const exists = prev.some((s) => s.title === story.title);
            if (exists) {
              return prev.map((s) =>
                s.title === story.title ? storyWithCheck : s,
              );
            }
            return [...prev, storyWithCheck];
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

      // 2. Generate Stories using Copilot SDK (this will stream lines via event listeners)
      await window.electronAPI.generateStories(
        fetchedPage,
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

  const toggleStoryCheck = (index: number) => {
    const newStories = [...stories];
    newStories[index].checked = !newStories[index].checked;
    setStories(newStories);
  };

  const handleCreateStories = async () => {
    if (!featureId) {
      alert('Please enter a Feature ID.');
      return;
    }

    const storiesToCreate = stories.filter((s) => s.checked);
    if (storiesToCreate.length === 0) {
      alert('Please check at least one story to create.');
      return;
    }

    setIsCreating(true);
    try {
      for (const story of storiesToCreate) {
        const descriptionWithDisclaimer = [
          story.description,
          '',
          '> Generated with Stitch and GitHub Copilot.',
          '> Like any AI generated content, mistakes and hallucinations can occur. Please review before relying on it.',
        ].join('\n');

        await window.electronAPI.createTicket(
          'Product Backlog Item',
          featureId,
          {
            title: story.title,
            description: descriptionWithDisclaimer,
            acceptanceCriteria: story.acceptanceCriteria,
          },
        );
      }
      alert(`Successfully created ${storiesToCreate.length} PBIs!`);
    } catch (err) {
      console.error(err);
      alert(err.message || 'Failed to create stories.');
    } finally {
      setIsCreating(false);
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
                {stories.length > 0 && (
                  <button
                    className="btn btn-sm btn-outline-light px-3 py-2 fw-medium"
                    onClick={() =>
                      navigator.clipboard.writeText(
                        JSON.stringify(stories, null, 2),
                      )
                    }
                    disabled={isGenerating}
                  >
                    <i className="fas fa-copy me-2"></i>
                    Copy JSON
                  </button>
                )}
              </div>
            </div>
            <div className="card-body p-4 overflow-auto flex-grow-1">
              {stories.length > 0 ? (
                <div className="stories-list">
                  {stories.map((story, index) => (
                    <div
                      key={index}
                      className="card shadow-sm border-0 border-start border-success border-4 mb-3 animate__animated animate__fadeInUp"
                      style={{ animationDuration: '0.4s' }}
                    >
                      <div className="card-header d-flex justify-content-between align-items-center bg-body-secondary border-bottom py-3">
                        <h6 className="mb-0 text-success fw-bold">
                          <i className="fas fa-book me-2"></i>
                          {story.title}
                        </h6>
                        <div className="form-check m-0">
                          <input
                            className="form-check-input border-2"
                            type="checkbox"
                            checked={story.checked}
                            onChange={() => toggleStoryCheck(index)}
                            id={`check-${index}`}
                          />
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
                          <div>
                            <strong className="text-secondary small d-block mb-1">
                              Notes
                            </strong>
                            <p className="text-muted small mb-0 bg-body-tertiary p-2 rounded-3 border-start border-3 border-secondary">
                              {story.notes}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
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
            {stories.length > 0 && (
              <div className="card-footer bg-body-tertiary py-3 d-flex justify-content-end gap-3 border-top align-items-center flex-shrink-0">
                <div className="d-flex justify-content-between align-items-center w-100">
                  <div className="input-group" style={{ maxWidth: '320px' }}>
                    <span className="input-group-text border-2 bg-success text-white fw-medium">
                      Feature ID
                    </span>
                    <input
                      type="text"
                      className="form-control border-2"
                      placeholder="e.g. 12345"
                      value={featureId}
                      onChange={(e) => setFeatureId(e.target.value)}
                      disabled={isCreating || isGenerating}
                    />
                  </div>
                  <button
                    className="btn btn-success px-4 py-2 fw-semibold shadow-sm hover-grow"
                    onClick={handleCreateStories}
                    disabled={isCreating || isGenerating}
                  >
                    {isCreating ? (
                      <>
                        <span
                          className="spinner-border spinner-border-sm me-2"
                          role="status"
                          aria-hidden="true"
                        ></span>
                        Creating PBIs...
                      </>
                    ) : (
                      <>
                        <i className="fas fa-plus me-2"></i>
                        Create PBIs
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

export default StoryWriter;
