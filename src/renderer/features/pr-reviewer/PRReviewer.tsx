import React, { useState, useEffect, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import PageLayout from '../../components/PageLayout';
import ModelDropdown from '../../components/ModelDropdown';
import { useCopilotModels } from '../../hooks/useCopilotModels';
import { PRMetadata, ReviewPhase } from '../../../types';

interface ReviewComment {
  type: 'general' | 'line';
  file?: string;
  line?: number;
  context?: number;
  comment: string;
  codeLines?: { line: number; text: string; isTarget: boolean }[];
  posted?: boolean;
  phase?: string;
}

const PRReviewer: React.FC = () => {
  const [activeTab, setActiveTab] = useState<
    'assigned' | 'created' | 'all' | 'manual'
  >('assigned');
  const [prList, setPrList] = useState<PRMetadata[]>([]);
  const [isLoadingPRs, setIsLoadingPRs] = useState(false);
  const [prSearchQuery, setPrSearchQuery] = useState('');

  // Selected PR details
  const [selectedPR, setSelectedPR] = useState<PRMetadata | null>(null);
  const [repoPath, setRepoPath] = useState('');
  const [isLoadingCheckout, setIsLoadingCheckout] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState('');

  // Manual PR URL / ID input
  const [manualPrUrlOrId, setManualPrUrlOrId] = useState('');

  // Checkout result
  const [commitSha, setCommitSha] = useState('');
  const [isHeaderCollapsed, setIsHeaderCollapsed] = useState(false);

  // Review states
  const [comments, setComments] = useState<ReviewComment[]>([]);
  const [isReviewing, setIsReviewing] = useState(false);
  const [currentStatus, setCurrentStatus] = useState<string | null>(null);
  const [lastStatusTime, setLastStatusTime] = useState<Date | null>(null);
  const [customInstructions, setCustomInstructions] = useState('');
  const { models, selectedModel, setSelectedModel, loadingModels } =
    useCopilotModels();
  const [collapsedComments, setCollapsedComments] = useState<
    Record<number, boolean>
  >({});
  const [isPostingComment, setIsPostingComment] = useState<
    Record<number, boolean>
  >({});

  // Modals
  const [showDirtyModal, setShowDirtyModal] = useState(false);
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  interface LocalReviewPhase extends ReviewPhase {
    enabled: boolean;
  }
  const [phases, setPhases] = useState<LocalReviewPhase[]>([]);
  const [isLoadingPhases, setIsLoadingPhases] = useState(false);

  const groupedPhases = useMemo(() => {
    const groups: {
      name: string;
      phases: { phase: LocalReviewPhase; originalIndex: number }[];
    }[] = [];
    phases.forEach((phase, index) => {
      const groupName = phase.group || 'Ungrouped';
      let g = groups.find((group) => group.name === groupName);
      if (!g) {
        g = { name: groupName, phases: [] };
        groups.push(g);
      }
      g.phases.push({ phase, originalIndex: index });
    });
    return groups;
  }, [phases]);

  const toggleGroup = (groupName: string, checked: boolean) => {
    setPhases((prev) =>
      prev.map((p) => {
        if ((p.group || 'Ungrouped') === groupName) {
          return { ...p, enabled: checked };
        }
        return p;
      }),
    );
  };

  const togglePhase = (originalIndex: number, checked: boolean) => {
    setPhases((prev) => {
      const copy = [...prev];
      copy[originalIndex] = {
        ...copy[originalIndex],
        enabled: checked,
      };
      return copy;
    });
  };

  interface PhaseProgress {
    id: string;
    title: string;
    status: 'pending' | 'in-progress' | 'completed' | 'skipped';
    reason?: string;
  }
  const [phaseProgress, setPhaseProgress] = useState<PhaseProgress[]>([]);
  const [currentPhase, setCurrentPhase] = useState<string | null>(null);

  useEffect(() => {
    loadPhases();
  }, []);

  const loadPhases = async () => {
    setIsLoadingPhases(true);
    try {
      const results = await window.electronAPI.getPhases();
      setPhases(results.map((p) => ({ ...p, enabled: true })));
    } catch (err) {
      console.error('Failed to load review phases:', err);
    } finally {
      setIsLoadingPhases(false);
    }
  };

  // Fetch PRs when activeTab changes (unless tab is manual)
  useEffect(() => {
    if (activeTab === 'manual') return;
    loadProjectPRs();
  }, [activeTab]);

  const loadProjectPRs = async () => {
    setIsLoadingPRs(true);
    setPrList([]);
    try {
      if (activeTab !== 'manual') {
        const results = await window.electronAPI.searchPRs(activeTab);
        setPrList(results);
      }
    } catch (err: unknown) {
      console.error('Failed to load project pull requests:', err);
    } finally {
      setIsLoadingPRs(false);
    }
  };

  const handleSelectPR = async (pr: PRMetadata) => {
    setSelectedPR(pr);
    setRepoPath('');
    setCommitSha('');
    setComments([]);
    setIsHeaderCollapsed(false);

    // Fetch local path history for this repository name
    try {
      const historyPath = await window.electronAPI.getRepoPathHistory(
        pr.repositoryName,
      );
      if (historyPath) {
        setRepoPath(historyPath);
      }
    } catch (err) {
      console.error('Failed to get repo path history:', err);
    }
  };

  const handleManualPRSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualPrUrlOrId.trim()) return;

    setIsLoadingPRs(true);
    try {
      // Fetch details using dummy/empty path first or settings-based lookup
      const details = await window.electronAPI.getPRDetails(
        '',
        manualPrUrlOrId.trim(),
      );
      await handleSelectPR(details);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showError(msg);
    } finally {
      setIsLoadingPRs(false);
    }
  };

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

  const handleCheckoutAndDiff = async () => {
    if (!selectedPR) return;
    if (!repoPath) {
      showError('Please select a local repository path.');
      return;
    }

    setIsLoadingCheckout(true);
    setLoadingStatus('Running repository checks and checking out branch...');
    setCommitSha('');
    setComments([]);

    try {
      // 1. Checkout (runs dirty checking and remote URL matching internally on backend)
      const res = await window.electronAPI.checkoutPR(
        repoPath,
        parseInt(selectedPR.id),
        selectedPR.repositoryName,
      );
      setCommitSha(res.commitSha);

      // Save successful path to history mapping
      await window.electronAPI.saveRepoPathHistory(
        selectedPR.repositoryName,
        repoPath,
      );
      setIsHeaderCollapsed(true);
    } catch (err: unknown) {
      console.error('Checkout failed:', err);
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('uncommitted changes')) {
        setShowDirtyModal(true);
      } else {
        showError(msg);
      }
    } finally {
      setIsLoadingCheckout(false);
      setLoadingStatus('');
    }
  };

  const handleStartReview = async () => {
    if (!selectedPR || !commitSha) return;

    setIsReviewing(true);
    setComments([]);
    setCurrentPhase(null);
    setCurrentStatus(null);
    setLastStatusTime(null);

    const activePhases = phases.filter((p) => p.enabled);
    setPhaseProgress(
      activePhases.map((p) => ({
        id: p.id,
        title: p.title,
        status: 'pending',
      })),
    );

    const unsubscribe = window.electronAPI.onPRReviewLine((line: string) => {
      try {
        const commentObj = JSON.parse(line);
        if (commentObj && commentObj.type === 'phase-start') {
          setPhaseProgress((prev) =>
            prev.map((p) =>
              p.id === commentObj.phaseId
                ? { ...p, status: 'in-progress' }
                : p.status === 'in-progress'
                  ? { ...p, status: 'completed' }
                  : p,
            ),
          );
          setCurrentPhase(commentObj.phaseTitle);
          setCurrentStatus(`Starting review phase: ${commentObj.phaseTitle}`);
          setLastStatusTime(new Date());
        } else if (commentObj && commentObj.type === 'phase-skip') {
          setPhaseProgress((prev) =>
            prev.map((p) =>
              p.id === commentObj.phaseId
                ? { ...p, status: 'skipped', reason: commentObj.reason }
                : p,
            ),
          );
        } else if (commentObj && commentObj.type === 'phase-end') {
          setPhaseProgress((prev) =>
            prev.map((p) =>
              p.id === commentObj.phaseId ? { ...p, status: 'completed' } : p,
            ),
          );
        } else if (commentObj && commentObj.type === 'status') {
          setCurrentStatus(commentObj.status);
          setLastStatusTime(new Date());
        } else if (
          commentObj &&
          (commentObj.type === 'general' || commentObj.type === 'line')
        ) {
          setComments((prev) => [...prev, commentObj]);
          setLastStatusTime(new Date());
        }
      } catch (err) {
        console.error('Failed to parse streaming review line:', err);
      }
    });

    try {
      const enabledPhaseIds = activePhases.map((p) => p.id);
      await window.electronAPI.reviewPR(
        repoPath,
        selectedPR.targetBranch,
        customInstructions,
        selectedModel,
        enabledPhaseIds,
        selectedPR.description,
      );
    } catch (err: unknown) {
      console.error('Review execution failed:', err);
      const msg = err instanceof Error ? err.message : String(err);
      showError(msg);
    } finally {
      setIsReviewing(false);
      unsubscribe();
    }
  };

  const showError = (msg: string) => {
    setErrorMessage(msg);
    setShowErrorModal(true);
  };

  const handleDismissComment = (index: number) => {
    setCollapsedComments((prev) => ({ ...prev, [index]: true }));
  };

  const handlePostComment = async (comment: ReviewComment, index: number) => {
    if (!selectedPR) return;

    setIsPostingComment((prev) => ({ ...prev, [index]: true }));
    try {
      const prIdentifier =
        activeTab === 'manual' ? manualPrUrlOrId : selectedPR.id;

      await window.electronAPI.postPRComment(repoPath, prIdentifier, {
        type: comment.type,
        file: comment.file,
        line: comment.line,
        comment: comment.comment,
      });

      // Mark as posted
      setComments((prev) => {
        const copy = [...prev];
        copy[index] = { ...copy[index], posted: true };
        return copy;
      });
      setCollapsedComments((prev) => ({ ...prev, [index]: true }));
    } catch (err: unknown) {
      console.error('Failed to post comment:', err);
      const msg = err instanceof Error ? err.message : String(err);
      showError(msg);
    } finally {
      setIsPostingComment((prev) => ({ ...prev, [index]: false }));
    }
  };

  const handleToggleCollapse = (index: number) => {
    setCollapsedComments((prev) => ({ ...prev, [index]: !prev[index] }));
  };

  const filteredPRs = prList.filter(
    (pr) =>
      pr.title.toLowerCase().includes(prSearchQuery.toLowerCase()) ||
      pr.id.toString().includes(prSearchQuery) ||
      pr.repositoryName.toLowerCase().includes(prSearchQuery.toLowerCase()),
  );

  const hasSelectedPhases = phases.some((p) => p.enabled);

  return (
    <PageLayout title="PR Reviewer">
      <div className="row g-4">
        {selectedPR && commitSha && isHeaderCollapsed ? (
          /* Collapsed Header Panel */
          <div className="col-12">
            <div className="card shadow-sm border-0 bg-body-tertiary">
              <div className="card-body p-3 d-flex flex-wrap align-items-center justify-content-between gap-3">
                <div className="d-flex align-items-center gap-3">
                  <div
                    className="d-flex align-items-center justify-content-center bg-primary text-white rounded-circle"
                    style={{ width: '40px', height: '40px', flexShrink: 0 }}
                  >
                    <i className="fas fa-code-pull-request"></i>
                  </div>
                  <div>
                    <div className="d-flex align-items-center flex-wrap gap-2">
                      <span className="fw-bold text-primary font-monospace small">
                        PR #{selectedPR.id}
                      </span>
                      <span className="badge bg-secondary-subtle text-secondary-emphasis font-monospace small">
                        {selectedPR.repositoryName}
                      </span>
                      <span className="text-muted small">
                        | By {selectedPR.author}
                      </span>
                    </div>
                    <h5 className="fw-bold mb-0 text-body mt-1">
                      {selectedPR.title}
                    </h5>
                  </div>
                </div>

                <div className="d-flex align-items-center flex-wrap gap-3">
                  <div className="text-muted small">
                    <strong>Branches:</strong>{' '}
                    <span className="font-monospace bg-light px-2 py-1 rounded">
                      {selectedPR.sourceBranch}
                    </span>{' '}
                    &rarr;{' '}
                    <span className="font-monospace bg-light px-2 py-1 rounded">
                      {selectedPR.targetBranch}
                    </span>
                  </div>
                  <div className="text-muted small">
                    <strong>Commit:</strong>{' '}
                    <span className="badge bg-light text-dark font-monospace border">
                      {commitSha.slice(0, 7)}
                    </span>
                  </div>
                  <button
                    className="btn btn-sm btn-outline-primary fw-semibold shadow-sm"
                    onClick={() => setIsHeaderCollapsed(false)}
                  >
                    <i className="fas fa-expand me-1"></i>
                    Expand Settings
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* Expanded Configuration Panel */
          <>
            {/* Left Column: PR Lists / Selection */}
            <div className={selectedPR ? 'col-md-5' : 'col-12'}>
              <div className="card shadow-sm border-0 bg-body-tertiary h-100">
                <div
                  className="card-body p-4 d-flex flex-column"
                  style={{ minHeight: '300px' }}
                >
                  <h5 className="card-title fw-bold mb-3">
                    <i className="fas fa-code-pull-request me-2 text-primary"></i>
                    Select Pull Request
                  </h5>

                  {/* Navigation Tabs */}
                  <ul className="nav nav-pills mb-3 gap-1">
                    <li className="nav-item">
                      <button
                        className={`btn btn-sm ${activeTab === 'assigned' ? 'btn-primary' : 'btn-outline-secondary'}`}
                        onClick={() => setActiveTab('assigned')}
                      >
                        Assigned to Me
                      </button>
                    </li>
                    <li className="nav-item">
                      <button
                        className={`btn btn-sm ${activeTab === 'created' ? 'btn-primary' : 'btn-outline-secondary'}`}
                        onClick={() => setActiveTab('created')}
                      >
                        Created by Me
                      </button>
                    </li>
                    <li className="nav-item">
                      <button
                        className={`btn btn-sm ${activeTab === 'all' ? 'btn-primary' : 'btn-outline-secondary'}`}
                        onClick={() => setActiveTab('all')}
                      >
                        All Active PRs
                      </button>
                    </li>
                    <li className="nav-item">
                      <button
                        className={`btn btn-sm ${activeTab === 'manual' ? 'btn-primary' : 'btn-outline-secondary'}`}
                        onClick={() => setActiveTab('manual')}
                      >
                        Manual ID/URL
                      </button>
                    </li>
                  </ul>

                  {activeTab === 'manual' ? (
                    /* Manual Input Form */
                    <form onSubmit={handleManualPRSubmit} className="mt-2">
                      <div className="mb-3">
                        <label className="form-label text-muted small fw-semibold">
                          Azure DevOps PR URL or ID
                        </label>
                        <input
                          type="text"
                          className="form-control"
                          placeholder="https://dev.azure.com/.../pullrequest/123 or just PR ID"
                          value={manualPrUrlOrId}
                          onChange={(e) => setManualPrUrlOrId(e.target.value)}
                        />
                      </div>
                      <button
                        type="submit"
                        className="btn btn-outline-primary w-100"
                        disabled={isLoadingPRs || !manualPrUrlOrId.trim()}
                      >
                        Load PR Details
                      </button>
                    </form>
                  ) : (
                    /* Search Results / List */
                    <div className="d-flex flex-column flex-grow-1">
                      <div className="input-group input-group-sm mb-3">
                        <span className="input-group-text bg-body-secondary border-end-0">
                          <i className="fas fa-search text-muted"></i>
                        </span>
                        <input
                          type="text"
                          className="form-control border-start-0"
                          placeholder="Search title, ID, or repo..."
                          value={prSearchQuery}
                          onChange={(e) => setPrSearchQuery(e.target.value)}
                        />
                      </div>

                      <div
                        className="overflow-y-auto flex-grow-1"
                        style={{ maxHeight: '250px' }}
                      >
                        {isLoadingPRs ? (
                          <div className="text-center py-5 text-muted">
                            <span className="spinner-border spinner-border-sm mb-2"></span>
                            <p className="small mb-0">
                              Querying Azure DevOps...
                            </p>
                          </div>
                        ) : filteredPRs.length === 0 ? (
                          <div className="text-center py-5 text-muted small">
                            No active PRs found matching the criteria.
                          </div>
                        ) : (
                          <div className="list-group list-group-flush border-top border-bottom">
                            {filteredPRs.map((pr) => (
                              <button
                                key={pr.id}
                                type="button"
                                className={`list-group-item list-group-item-action p-3 text-start ${
                                  selectedPR?.id === pr.id
                                    ? 'active bg-primary text-white'
                                    : ''
                                }`}
                                onClick={() => handleSelectPR(pr)}
                              >
                                <div className="d-flex w-100 justify-content-between mb-1">
                                  <span className="fw-semibold small">
                                    PR #{pr.id}
                                  </span>
                                  <span className="small opacity-75">
                                    {pr.repositoryName}
                                  </span>
                                </div>
                                <div
                                  className="fw-bold mb-1 text-truncate"
                                  title={pr.title}
                                >
                                  {pr.title}
                                </div>
                                <div className="small opacity-75 d-flex justify-content-between">
                                  <span>By: {pr.author}</span>
                                  <span>
                                    {pr.sourceBranch} &rarr; {pr.targetBranch}
                                  </span>
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Right Column: Local Path Configuration (Only displays when a PR is selected) */}
            {selectedPR && (
              <div className="col-md-7">
                <div className="card shadow-sm border-0">
                  <div className="card-body p-4">
                    <h5 className="card-title fw-bold mb-3 text-primary">
                      PR Details & Checkout
                    </h5>

                    <div className="p-3 bg-body-tertiary rounded mb-4">
                      <div className="d-flex align-items-center justify-content-between mb-2">
                        <span className="badge bg-primary">
                          Repo: {selectedPR.repositoryName}
                        </span>
                        <span className="badge bg-secondary-subtle text-secondary-emphasis">
                          PR #{selectedPR.id}
                        </span>
                      </div>
                      <h4 className="fw-bold text-body mb-2">
                        {selectedPR.title}
                      </h4>
                      <div className="row g-2 text-muted small">
                        <div className="col-6">
                          <strong>Author:</strong> {selectedPR.author}
                        </div>
                        <div className="col-6">
                          <strong>Branches:</strong> {selectedPR.sourceBranch}{' '}
                          &rarr; {selectedPR.targetBranch}
                        </div>
                      </div>
                    </div>

                    {/* Local Repository Path Picker */}
                    <div className="mb-4">
                      <label className="form-label fw-semibold text-muted">
                        Locally Cloned Repo Path for "
                        {selectedPR.repositoryName}"
                      </label>
                      <div className="input-group">
                        <input
                          type="text"
                          className="form-control text-muted"
                          placeholder="Select the local clone directory..."
                          value={repoPath}
                          readOnly
                        />
                        <button
                          className="btn btn-outline-secondary"
                          type="button"
                          onClick={handleBrowseFolder}
                          disabled={isLoadingCheckout}
                        >
                          <i className="fas fa-folder-open me-1"></i>
                          Browse
                        </button>
                      </div>
                      <div className="form-text small">
                        {repoPath
                          ? 'Local clone matches mapping history.'
                          : `Please select the directory where repository "${selectedPR.repositoryName}" is cloned.`}
                      </div>
                    </div>

                    {/* Review Phases Checklist */}
                    <div className="mb-4">
                      <label className="form-label fw-semibold text-muted d-block">
                        Active Review Phases
                      </label>
                      {isLoadingPhases ? (
                        <div className="text-muted small">
                          <span className="spinner-border spinner-border-sm me-2"></span>
                          Loading phases...
                        </div>
                      ) : phases.length === 0 ? (
                        <div className="text-muted small border rounded p-3 bg-body-tertiary">
                          No custom review phases found in{' '}
                          <code>~/.stitch/pr-reviewer/phases</code>. Standard
                          single-phase review will be used.
                        </div>
                      ) : (
                        <div
                          className="border rounded p-3 bg-body-tertiary"
                          style={{ maxHeight: '250px', overflowY: 'auto' }}
                        >
                          {groupedPhases.map((group) => {
                            const allChecked = group.phases.every(
                              (p) => p.phase.enabled,
                            );
                            const someChecked =
                              group.phases.some((p) => p.phase.enabled) &&
                              !allChecked;

                            return (
                              <div key={group.name} className="mb-3">
                                <div className="form-check mb-1">
                                  <input
                                    className="form-check-input"
                                    type="checkbox"
                                    id={`group-check-${group.name}`}
                                    checked={allChecked}
                                    ref={(el) => {
                                      if (el) {
                                        el.indeterminate = someChecked;
                                      }
                                    }}
                                    onChange={(e) =>
                                      toggleGroup(group.name, e.target.checked)
                                    }
                                  />
                                  <label
                                    className="form-check-label small fw-bold text-body"
                                    htmlFor={`group-check-${group.name}`}
                                  >
                                    {group.name}
                                  </label>
                                </div>
                                <div className="ms-4 border-start ps-3 py-1">
                                  {group.phases.map(
                                    ({ phase, originalIndex }) => (
                                      <div
                                        key={phase.id}
                                        className="form-check mb-1"
                                      >
                                        <input
                                          className="form-check-input"
                                          type="checkbox"
                                          id={`phase-check-${phase.id}`}
                                          checked={phase.enabled}
                                          onChange={(e) =>
                                            togglePhase(
                                              originalIndex,
                                              e.target.checked,
                                            )
                                          }
                                        />
                                        <label
                                          className="form-check-label small text-body-secondary"
                                          htmlFor={`phase-check-${phase.id}`}
                                        >
                                          {phase.title}{' '}
                                          <span className="text-muted font-monospace tiny-text ms-1">
                                            ({phase.id})
                                          </span>
                                        </label>
                                      </div>
                                    ),
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    <div className="text-end">
                      {commitSha && (
                        <button
                          className="btn btn-outline-secondary px-3 me-2 fw-semibold"
                          onClick={() => setIsHeaderCollapsed(true)}
                          type="button"
                        >
                          <i className="fas fa-compress me-1"></i>
                          Collapse Settings
                        </button>
                      )}
                      <button
                        className="btn btn-primary px-4 shadow-sm fw-semibold"
                        onClick={handleCheckoutAndDiff}
                        disabled={isLoadingCheckout || !repoPath}
                      >
                        {isLoadingCheckout ? (
                          <>
                            <span className="spinner-border spinner-border-sm me-2"></span>
                            Checking Out...
                          </>
                        ) : (
                          <>
                            <i className="fas fa-cloud-arrow-down me-2"></i>
                            Fetch & Checkout PR
                          </>
                        )}
                      </button>
                    </div>

                    {isLoadingCheckout && loadingStatus && (
                      <div className="mt-3 text-muted small d-flex align-items-center">
                        <i className="fas fa-circle-notch fa-spin me-2 text-primary"></i>
                        {loadingStatus}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* Review Comments Segment (Displays once checked out and commitSha is generated) */}
        {selectedPR && commitSha && (
          <div className="col-12 mt-4">
            <div className="row g-4">
              {/* Review Settings Side Column */}
              <div className="col-md-4">
                <div className="card shadow-sm border-0 h-100">
                  <div
                    className="card-body p-4 d-flex flex-column"
                    style={{ minHeight: '300px' }}
                  >
                    <h5 className="card-title fw-bold mb-3">
                      <i className="fas fa-robot me-2 text-primary"></i>
                      Review Settings
                    </h5>

                    {isReviewing || phaseProgress.length > 0 ? (
                      /* Phase Progress Checklist */
                      <div className="flex-grow-1 d-flex flex-column">
                        <h6 className="fw-bold mb-3 text-muted small text-uppercase">
                          Review Progress
                        </h6>
                        <div
                          className="list-group list-group-flush border rounded overflow-hidden flex-grow-1 overflow-y-auto mb-3"
                          style={{ maxHeight: '300px' }}
                        >
                          {phaseProgress.map((p) => (
                            <div
                              key={p.id}
                              className="list-group-item d-flex align-items-center justify-content-between p-3"
                              style={{
                                backgroundColor:
                                  p.status === 'in-progress'
                                    ? 'rgba(13, 110, 253, 0.1)'
                                    : 'transparent',
                              }}
                            >
                              <div
                                className="d-flex align-items-center gap-2 text-truncate"
                                style={{ maxWidth: '75%' }}
                              >
                                {p.status === 'pending' && (
                                  <i className="far fa-circle text-muted"></i>
                                )}
                                {p.status === 'in-progress' && (
                                  <i className="fas fa-circle-notch fa-spin text-primary"></i>
                                )}
                                {p.status === 'completed' && (
                                  <i className="fas fa-check-circle text-success"></i>
                                )}
                                {p.status === 'skipped' && (
                                  <i
                                    className="fas fa-forward text-warning"
                                    title={p.reason || 'Skipped'}
                                  ></i>
                                )}
                                <span
                                  className={`small text-truncate ${
                                    p.status === 'completed'
                                      ? 'text-decoration-line-through text-muted'
                                      : p.status === 'skipped'
                                        ? 'text-muted'
                                        : 'fw-semibold text-body'
                                  }`}
                                  title={p.title}
                                >
                                  {p.title}
                                </span>
                              </div>
                              {p.status === 'skipped' && (
                                <span className="badge bg-warning-subtle text-warning-emphasis font-monospace tiny-badge">
                                  Skipped
                                </span>
                              )}
                              {p.status === 'in-progress' && (
                                <span className="badge bg-primary-subtle text-primary-emphasis font-monospace tiny-badge">
                                  Running
                                </span>
                              )}
                              {p.status === 'completed' && (
                                <span className="badge bg-success-subtle text-success-emphasis font-monospace tiny-badge">
                                  Done
                                </span>
                              )}
                            </div>
                          ))}
                        </div>

                        {isReviewing && (
                          <div className="mt-auto text-center text-muted small py-2 bg-body-secondary rounded">
                            <span className="spinner-border spinner-border-sm me-2 text-primary"></span>
                            {currentPhase
                              ? `Reviewing: ${currentPhase}`
                              : 'Analyzing PR changes...'}
                          </div>
                        )}

                        {!isReviewing && (
                          <button
                            className="btn btn-outline-primary btn-sm w-100 mt-auto fw-semibold"
                            onClick={() => {
                              setPhaseProgress([]);
                              setCurrentPhase(null);
                            }}
                          >
                            <i className="fas fa-arrow-left me-2"></i>
                            Back to Settings
                          </button>
                        )}
                      </div>
                    ) : (
                      /* Original Review Settings Inputs */
                      <>
                        {/* Model Selection */}
                        <div className="mb-3">
                          <label className="form-label text-muted small fw-semibold">
                            Copilot Model
                          </label>
                          <ModelDropdown
                            models={models}
                            selectedModel={selectedModel}
                            onSelect={setSelectedModel}
                            loading={loadingModels}
                          />
                        </div>

                        {/* Custom Review Instructions */}
                        <div className="mb-4 flex-grow-1 d-flex flex-column">
                          <label className="form-label text-muted small fw-semibold">
                            Specific Instructions (Optional)
                          </label>
                          <textarea
                            className="form-control flex-grow-1"
                            rows={6}
                            style={{ minHeight: '120px', resize: 'none' }}
                            placeholder="E.g., Focus on security, look out for proper error handling, verify database queries, etc."
                            value={customInstructions}
                            onChange={(e) =>
                              setCustomInstructions(e.target.value)
                            }
                            disabled={isReviewing}
                          />
                        </div>

                        {/* Action Button */}
                        <button
                          className="btn btn-primary w-100 py-2 fw-semibold shadow-sm mb-2"
                          onClick={handleStartReview}
                          disabled={
                            isReviewing || !commitSha || !hasSelectedPhases
                          }
                        >
                          <i className="fas fa-play me-2"></i>
                          Start Code Review
                        </button>
                        {!hasSelectedPhases && (
                          <div className="text-warning small text-center mt-1">
                            <i className="fas fa-exclamation-triangle me-1"></i>
                            Select at least one phase in PR settings to start
                            review.
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Review Comments Screen */}
              <div className="col-md-8">
                <div className="card shadow-sm border-0 h-100">
                  <div
                    className="card-body p-4 d-flex flex-column"
                    style={{
                      height: isHeaderCollapsed
                        ? 'calc(100vh - 315px)'
                        : '450px',
                      minHeight: '300px',
                    }}
                  >
                    <h5 className="card-title fw-bold mb-3">
                      <i className="fas fa-comments me-2 text-primary"></i>
                      Review Comments ({comments.length})
                    </h5>

                    {isReviewing && currentStatus && comments.length > 0 && (
                      <div className="alert alert-info py-2 px-3 mb-3 d-flex align-items-center justify-content-between shadow-sm border-0 bg-info-subtle text-info-emphasis small">
                        <div className="d-flex align-items-center gap-2">
                          <span
                            className="spinner-border spinner-border-sm text-info me-1"
                            style={{ width: '1rem', height: '1rem' }}
                          ></span>
                          <span>
                            <strong>Status:</strong> {currentStatus}
                          </span>
                        </div>
                        {lastStatusTime && (
                          <span className="text-muted small font-monospace">
                            Last update: {lastStatusTime.toLocaleTimeString()}
                          </span>
                        )}
                      </div>
                    )}

                    <div
                      className="flex-grow-1 overflow-y-auto pe-1"
                      style={{ maxHeight: 'none' }}
                    >
                      {comments.length === 0 ? (
                        <div className="h-100 d-flex flex-column align-items-center justify-content-center py-5 text-muted">
                          {isReviewing ? (
                            <>
                              <span
                                className="spinner-border text-primary mb-3"
                                style={{ width: '3rem', height: '3rem' }}
                              ></span>
                              <p className="fw-semibold text-body mb-1">
                                {currentStatus || 'Running Code Review...'}
                              </p>
                              {lastStatusTime && (
                                <p className="text-muted small mb-2">
                                  Last update:{' '}
                                  {lastStatusTime.toLocaleTimeString()}
                                </p>
                              )}
                              <p className="small mb-0 text-center px-4">
                                Copilot is analyzing the repository. Comments
                                will appear here as they are generated.
                              </p>
                            </>
                          ) : (
                            <>
                              <i className="fas fa-clipboard-list fa-3x mb-3 text-secondary opacity-50"></i>
                              <p className="fw-semibold text-body mb-1">
                                No comments generated yet
                              </p>
                              <p className="small mb-0 text-center px-4">
                                Configure instructions on the left and click
                                "Start Code Review" to begin.
                              </p>
                            </>
                          )}
                        </div>
                      ) : (
                        <div className="comments-list">
                          {comments.map((comment, index) => {
                            const isLine = comment.type === 'line';
                            if (collapsedComments[index]) {
                              return (
                                <div
                                  key={index}
                                  className="card shadow-sm border-0 mb-2 bg-body-secondary opacity-75"
                                >
                                  <div className="card-body p-2 d-flex align-items-center justify-content-between">
                                    <div className="d-flex align-items-center gap-2">
                                      <span
                                        className={`badge ${isLine ? 'bg-primary' : 'bg-secondary'}`}
                                      >
                                        {isLine ? 'Line' : 'General'}
                                      </span>
                                      {comment.phase && (
                                        <span className="badge bg-info-subtle text-info-emphasis">
                                          {comment.phase}
                                        </span>
                                      )}
                                      {comment.posted ? (
                                        <span className="text-success small fw-semibold">
                                          <i className="fas fa-check-circle me-1"></i>
                                          Posted to PR
                                        </span>
                                      ) : (
                                        <span className="text-muted small fw-semibold">
                                          <i className="fas fa-times-circle me-1"></i>
                                          Dismissed
                                        </span>
                                      )}
                                      {isLine && comment.file && (
                                        <span
                                          className="font-monospace text-muted small text-truncate"
                                          style={{ maxWidth: '300px' }}
                                          title={`${comment.file}:${comment.line}`}
                                        >
                                          {comment.file}:{comment.line}
                                        </span>
                                      )}
                                    </div>
                                    <button
                                      className="btn btn-sm btn-link text-decoration-none p-0 px-2"
                                      onClick={() =>
                                        handleToggleCollapse(index)
                                      }
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
                                className={`card shadow-sm border-0 mb-3 ${
                                  isLine
                                    ? 'border-start border-4 border-primary'
                                    : 'bg-body-tertiary'
                                }`}
                              >
                                <div className="card-body p-3">
                                  <div className="d-flex align-items-center justify-content-between mb-2 pb-2 border-bottom border-secondary-subtle">
                                    <div className="d-flex align-items-center gap-2">
                                      <span
                                        className={`badge ${isLine ? 'bg-primary' : 'bg-secondary'}`}
                                      >
                                        {isLine
                                          ? 'Line Comment'
                                          : 'General Comment'}
                                      </span>
                                      {comment.phase && (
                                        <span className="badge bg-info-subtle text-info-emphasis">
                                          {comment.phase}
                                        </span>
                                      )}
                                    </div>
                                    {isLine && comment.file && (
                                      <span
                                        className="font-monospace text-muted small text-truncate ms-2"
                                        style={{ maxWidth: '70%' }}
                                        title={`${comment.file}:${comment.line}`}
                                      >
                                        {comment.file}:{comment.line}
                                      </span>
                                    )}
                                  </div>

                                  {isLine &&
                                    comment.codeLines &&
                                    comment.codeLines.length > 0 && (
                                      <div
                                        className="mb-3 rounded overflow-hidden border border-secondary-subtle"
                                        style={{ backgroundColor: '#1e1e1e' }}
                                      >
                                        <pre
                                          className="m-0 p-2 text-white font-monospace small"
                                          style={{
                                            overflowX: 'auto',
                                            whiteSpace: 'pre',
                                          }}
                                        >
                                          {comment.codeLines.map(
                                            (
                                              lineObj: {
                                                line: number;
                                                text: string;
                                                isTarget: boolean;
                                              },
                                              idx: number,
                                            ) => (
                                              <div
                                                key={idx}
                                                style={{
                                                  backgroundColor:
                                                    lineObj.isTarget
                                                      ? 'rgba(255, 235, 59, 0.15)'
                                                      : 'transparent',
                                                  borderLeft: lineObj.isTarget
                                                    ? '3px solid #ffeb3b'
                                                    : '3px solid transparent',
                                                  paddingLeft: lineObj.isTarget
                                                    ? '5px'
                                                    : '8px',
                                                  display: 'flex',
                                                }}
                                              >
                                                <span
                                                  className="me-3 select-none"
                                                  style={{
                                                    width: '35px',
                                                    display: 'inline-block',
                                                    textAlign: 'right',
                                                    flexShrink: 0,
                                                    color: '#858585',
                                                  }}
                                                >
                                                  {lineObj.line}
                                                </span>
                                                <span className="text-break-none">
                                                  {lineObj.text}
                                                </span>
                                              </div>
                                            ),
                                          )}
                                        </pre>
                                      </div>
                                    )}

                                  <div className="markdown-content text-body small">
                                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                      {comment.comment}
                                    </ReactMarkdown>
                                  </div>

                                  {/* Card Actions */}
                                  <div className="d-flex justify-content-end gap-2 mt-3 pt-2 border-top border-secondary-subtle">
                                    <button
                                      className="btn btn-sm btn-outline-secondary"
                                      onClick={() =>
                                        handleDismissComment(index)
                                      }
                                    >
                                      <i className="fas fa-eye-slash me-1"></i>
                                      Dismiss
                                    </button>
                                    <button
                                      className="btn btn-sm btn-primary"
                                      onClick={() =>
                                        handlePostComment(comment, index)
                                      }
                                      disabled={isPostingComment[index]}
                                    >
                                      {isPostingComment[index] ? (
                                        <>
                                          <span className="spinner-border spinner-border-sm me-1"></span>
                                          Posting...
                                        </>
                                      ) : (
                                        <>
                                          <i className="fas fa-paper-plane me-1"></i>
                                          Post
                                        </>
                                      )}
                                    </button>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Dirty Repository Modal */}
      {showDirtyModal && (
        <div className="env-error-overlay">
          <div className="env-error-modal">
            <div className="env-error-icon bg-warning text-white">
              <i className="fas fa-exclamation-triangle"></i>
            </div>
            <h4 className="env-error-title mt-3">Local Repository is Dirty</h4>
            <p className="env-error-message text-center text-muted px-3">
              The local git repository has uncommitted changes. To prevent loss
              of work or merge conflicts, you must commit, stash, or reset your
              local changes before continuing.
            </p>
            <div className="env-error-actions mt-4 w-100 d-flex justify-content-center">
              <button
                className="btn btn-indigo btn-lg px-5 shadow-sm"
                onClick={() => setShowDirtyModal(false)}
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {/* General Error Modal */}
      {showErrorModal && (
        <div className="env-error-overlay">
          <div className="env-error-modal">
            <div className="env-error-icon bg-danger text-white">
              <i className="fas fa-xmark"></i>
            </div>
            <h4 className="env-error-title mt-3">Fetch & Checkout Failed</h4>
            <div
              className="env-error-details w-100 text-start overflow-y-auto mb-3"
              style={{ maxHeight: '150px' }}
            >
              <pre
                className="mb-0 text-break font-monospace small"
                style={{ whiteSpace: 'pre-wrap' }}
              >
                {errorMessage}
              </pre>
            </div>
            <div className="env-error-actions w-100 d-flex justify-content-center">
              <button
                className="btn btn-indigo btn-lg px-5 shadow-sm"
                onClick={() => setShowErrorModal(false)}
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}
    </PageLayout>
  );
};

export default PRReviewer;
