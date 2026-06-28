import React, { useState, useEffect } from 'react';
import PageLayout from '../../components/PageLayout';
import { PRMetadata, PRDiffFile } from '../../../types';

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

  // Diff results
  const [commitSha, setCommitSha] = useState('');
  const [changedFiles, setChangedFiles] = useState<PRDiffFile[]>([]);
  const [fileFilter, setFileFilter] = useState('');
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [selectedFileDiff, setSelectedFileDiff] = useState<string>('');
  const [isLoadingDiff, setIsLoadingDiff] = useState(false);
  const [isHeaderCollapsed, setIsHeaderCollapsed] = useState(false);

  // Modals
  const [showDirtyModal, setShowDirtyModal] = useState(false);
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

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
    setChangedFiles([]);
    setSelectedFilePath(null);
    setSelectedFileDiff('');
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
    setChangedFiles([]);
    setSelectedFilePath(null);
    setSelectedFileDiff('');

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

      // 2. Load Diff Files
      setLoadingStatus('Retrieving changed files list...');
      const files = await window.electronAPI.getPRDiffFiles(
        repoPath,
        selectedPR.targetBranch,
      );
      setChangedFiles(files);
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

  const handleSelectFile = async (filePath: string) => {
    if (!selectedPR) return;
    setSelectedFilePath(filePath);
    setIsLoadingDiff(true);
    setSelectedFileDiff('');

    try {
      const diff = await window.electronAPI.getPRFileDiff(
        repoPath,
        selectedPR.targetBranch,
        filePath,
      );
      setSelectedFileDiff(diff);
    } catch (err: unknown) {
      console.error('Failed to load file diff:', err);
      const msg = err instanceof Error ? err.message : String(err);
      setSelectedFileDiff(`Error loading diff for ${filePath}: ${msg}`);
    } finally {
      setIsLoadingDiff(false);
    }
  };

  const showError = (msg: string) => {
    setErrorMessage(msg);
    setShowErrorModal(true);
  };

  const getStatusBadge = (status: PRDiffFile['status']) => {
    switch (status) {
      case 'added':
        return <span className="badge bg-success-subtle text-success">A</span>;
      case 'modified':
        return <span className="badge bg-primary-subtle text-primary">M</span>;
      case 'deleted':
        return <span className="badge bg-danger-subtle text-danger">D</span>;
      case 'renamed':
        return <span className="badge bg-info-subtle text-info">R</span>;
      case 'type_changed':
        return <span className="badge bg-warning-subtle text-warning">T</span>;
      default:
        return (
          <span className="badge bg-secondary-subtle text-secondary">?</span>
        );
    }
  };

  const renderDiffLine = (line: string, index: number) => {
    if (line.startsWith('+')) {
      return (
        <span key={index} className="diff-line-added">
          {line}
        </span>
      );
    } else if (line.startsWith('-')) {
      return (
        <span key={index} className="diff-line-removed">
          {line}
        </span>
      );
    } else if (line.startsWith('@@')) {
      return (
        <span key={index} className="diff-line-info text-info fw-bold">
          {line}
        </span>
      );
    } else {
      return (
        <span key={index} className="diff-line-normal">
          {line}
        </span>
      );
    }
  };

  const filteredPRs = prList.filter(
    (pr) =>
      pr.title.toLowerCase().includes(prSearchQuery.toLowerCase()) ||
      pr.id.toString().includes(prSearchQuery) ||
      pr.repositoryName.toLowerCase().includes(prSearchQuery.toLowerCase()),
  );

  const filteredFiles = changedFiles.filter((f) =>
    f.path.toLowerCase().includes(fileFilter.toLowerCase()),
  );

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
                  style={{ minHeight: '400px' }}
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
                        style={{ maxHeight: '450px' }}
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

        {/* Git Diffs Segment (Displays once checked out and commitSha is generated) */}
        {selectedPR && commitSha && (
          <div className="col-12 mt-4">
            <div className="row g-4">
              {/* Changed Files Side Column */}
              <div className="col-md-4">
                <div className="card shadow-sm border-0 h-100">
                  <div
                    className="card-body p-3 d-flex flex-column"
                    style={{
                      height: isHeaderCollapsed
                        ? 'calc(100vh - 275px)'
                        : '600px',
                      minHeight: '400px',
                    }}
                  >
                    <h6 className="fw-bold mb-3">
                      Changed Files ({filteredFiles.length} of{' '}
                      {changedFiles.length})
                    </h6>

                    {/* Filter File List */}
                    <div className="input-group input-group-sm mb-3">
                      <span className="input-group-text bg-body-secondary border-end-0">
                        <i className="fas fa-filter text-muted"></i>
                      </span>
                      <input
                        type="text"
                        className="form-control border-start-0"
                        placeholder="Filter files..."
                        value={fileFilter}
                        onChange={(e) => setFileFilter(e.target.value)}
                      />
                    </div>

                    <div className="flex-grow-1 overflow-y-auto">
                      {filteredFiles.length === 0 ? (
                        <div className="text-center py-4 text-muted small">
                          No files match the filter.
                        </div>
                      ) : (
                        <div className="list-group list-group-flush border-top border-bottom">
                          {filteredFiles.map((file) => (
                            <div
                              key={file.path}
                              onClick={() => handleSelectFile(file.path)}
                              className={`list-group-item list-group-item-action d-flex align-items-center justify-content-between p-2 pr-file-item ${
                                selectedFilePath === file.path ? 'active' : ''
                              }`}
                            >
                              <span
                                className="text-truncate small selectable-text"
                                title={file.path}
                              >
                                {file.path}
                              </span>
                              <span className="ms-2">
                                {getStatusBadge(file.status)}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Diffs Screen */}
              <div className="col-md-8">
                <div className="card shadow-sm border-0 h-100">
                  <div
                    className="card-body p-3 d-flex flex-column"
                    style={{
                      height: isHeaderCollapsed
                        ? 'calc(100vh - 275px)'
                        : '600px',
                      minHeight: '400px',
                    }}
                  >
                    {selectedFilePath ? (
                      <>
                        <div className="d-flex align-items-center justify-content-between mb-3 border-bottom pb-2">
                          <h6 className="fw-bold mb-0 text-truncate font-monospace small">
                            {selectedFilePath}
                          </h6>
                          <button
                            className="btn btn-sm btn-outline-secondary"
                            onClick={() => {
                              navigator.clipboard.writeText(selectedFileDiff);
                            }}
                            title="Copy Diff to Clipboard"
                            disabled={isLoadingDiff || !selectedFileDiff}
                          >
                            <i className="fas fa-copy me-1"></i>
                            Copy Diff
                          </button>
                        </div>

                        {isLoadingDiff ? (
                          <div className="flex-grow-1 d-flex flex-column align-items-center justify-content-center py-5 text-muted">
                            <span className="spinner-border spinner-border-sm mb-3"></span>
                            Loading file differences...
                          </div>
                        ) : selectedFileDiff ? (
                          <div className="flex-grow-1 overflow-y-auto">
                            <pre
                              className="git-diff-viewer m-0"
                              style={{ maxHeight: 'none' }}
                            >
                              {selectedFileDiff
                                .split('\n')
                                .map((line, index) =>
                                  renderDiffLine(line, index),
                                )}
                            </pre>
                          </div>
                        ) : (
                          <div className="flex-grow-1 d-flex align-items-center justify-content-center text-muted small">
                            No differences found for this file.
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="flex-grow-1 d-flex flex-column align-items-center justify-content-center py-5 text-muted">
                        <i className="fas fa-code-compare fa-3x mb-3 text-secondary opacity-50"></i>
                        <p className="mb-0 small">
                          Select a file from the list to view its diff.
                        </p>
                      </div>
                    )}
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
