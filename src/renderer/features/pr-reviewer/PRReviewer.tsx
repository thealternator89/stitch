import React, { useState } from 'react';
import PageLayout from '../../components/PageLayout';
import { PRMetadata, PRDiffFile } from '../../../types';

const PRReviewer: React.FC = () => {
  const [repoPath, setRepoPath] = useState('');
  const [prUrlOrId, setPrUrlOrId] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState('');

  // PR info and file changes
  const [prMetadata, setPrMetadata] = useState<PRMetadata | null>(null);
  const [commitSha, setCommitSha] = useState('');
  const [changedFiles, setChangedFiles] = useState<PRDiffFile[]>([]);
  const [fileFilter, setFileFilter] = useState('');

  // Selected file diff
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [selectedFileDiff, setSelectedFileDiff] = useState<string>('');
  const [isLoadingDiff, setIsLoadingDiff] = useState(false);

  // Modals
  const [showDirtyModal, setShowDirtyModal] = useState(false);
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

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

  const handleFetchAndCheckout = async () => {
    if (!repoPath) {
      showError('Please select a local git repository path.');
      return;
    }
    if (!prUrlOrId.trim()) {
      showError('Please enter a Pull Request URL or ID.');
      return;
    }

    setIsLoading(true);
    setLoadingStatus('Connecting to Azure DevOps and fetching PR details...');
    setPrMetadata(null);
    setCommitSha('');
    setChangedFiles([]);
    setSelectedFilePath(null);
    setSelectedFileDiff('');

    try {
      // 1. Get PR Details
      const details = await window.electronAPI.getPRDetails(
        repoPath,
        prUrlOrId.trim(),
      );
      setPrMetadata(details);

      // 2. Checkout the PR branch
      setLoadingStatus('Checking out PR branch locally (detached HEAD)...');
      const checkoutRes = await window.electronAPI.checkoutPR(
        repoPath,
        parseInt(details.id),
      );
      setCommitSha(checkoutRes.commitSha);

      // 3. Get changed files
      setLoadingStatus('Retrieving changed files list...');
      const files = await window.electronAPI.getPRDiffFiles(
        repoPath,
        details.targetBranch,
      );
      setChangedFiles(files);
    } catch (err: unknown) {
      console.error('PR review checkout failed:', err);
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('uncommitted changes')) {
        setShowDirtyModal(true);
      } else {
        showError(msg);
      }
    } finally {
      setIsLoading(false);
      setLoadingStatus('');
    }
  };

  const handleSelectFile = async (filePath: string) => {
    if (!prMetadata) return;
    setSelectedFilePath(filePath);
    setIsLoadingDiff(true);
    setSelectedFileDiff('');

    try {
      const diff = await window.electronAPI.getPRFileDiff(
        repoPath,
        prMetadata.targetBranch,
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

  const filteredFiles = changedFiles.filter((f) =>
    f.path.toLowerCase().includes(fileFilter.toLowerCase()),
  );

  return (
    <PageLayout title="PR Reviewer">
      <div className="row g-4">
        {/* Repository & PR Selection Form */}
        <div className="col-12">
          <div className="card shadow-sm border-0 bg-body-tertiary">
            <div className="card-body p-4">
              <h5 className="card-title fw-bold mb-3">
                <i className="fas fa-search me-2 text-primary"></i>
                Select Repository & Pull Request
              </h5>

              <div className="row g-3">
                {/* Local Repository Directory */}
                <div className="col-md-6">
                  <label className="form-label fw-semibold text-muted">
                    Locally Cloned Git Repo
                  </label>
                  <div className="input-group">
                    <input
                      type="text"
                      className="form-control"
                      placeholder="Select git repository path..."
                      value={repoPath}
                      readOnly
                    />
                    <button
                      className="btn btn-outline-secondary"
                      type="button"
                      onClick={handleBrowseFolder}
                      disabled={isLoading}
                    >
                      <i className="fas fa-folder-open me-1"></i>
                      Browse
                    </button>
                  </div>
                </div>

                {/* PR URL / ID */}
                <div className="col-md-6">
                  <label className="form-label fw-semibold text-muted">
                    Azure DevOps PR URL or ID
                  </label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="https://dev.azure.com/.../pullrequest/123 or just PR ID"
                    value={prUrlOrId}
                    onChange={(e) => setPrUrlOrId(e.target.value)}
                    disabled={isLoading}
                  />
                </div>

                {/* Fetch and Checkout Button */}
                <div className="col-12 mt-4 text-end">
                  <button
                    className="btn btn-primary px-4 py-2 fw-semibold shadow-sm"
                    onClick={handleFetchAndCheckout}
                    disabled={isLoading || !repoPath || !prUrlOrId}
                  >
                    {isLoading ? (
                      <>
                        <span
                          className="spinner-border spinner-border-sm me-2"
                          role="status"
                          aria-hidden="true"
                        ></span>
                        Fetching & Checking Out...
                      </>
                    ) : (
                      <>
                        <i className="fas fa-cloud-arrow-down me-2"></i>
                        Fetch & Checkout Branch
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Status/Loading Indicator */}
              {isLoading && loadingStatus && (
                <div className="mt-3 text-muted small d-flex align-items-center">
                  <i className="fas fa-circle-notch fa-spin me-2 text-primary"></i>
                  {loadingStatus}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* PR Details Summary */}
        {prMetadata && (
          <div className="col-12">
            <div className="card shadow-sm border-0 border-start border-primary border-4">
              <div className="card-body p-4">
                <div className="d-flex align-items-center justify-content-between mb-2">
                  <span className="badge bg-primary">
                    Azure DevOps PR #{prMetadata.id}
                  </span>
                  <span className="text-muted small">
                    <i className="fas fa-code-commit me-1"></i>
                    {commitSha ? commitSha.substring(0, 8) : 'unknown'}
                  </span>
                </div>
                <h4 className="fw-bold mb-2">{prMetadata.title}</h4>
                {prMetadata.description && (
                  <p
                    className="text-muted mb-3"
                    style={{
                      whiteSpace: 'pre-wrap',
                      maxHeight: '100px',
                      overflowY: 'auto',
                    }}
                  >
                    {prMetadata.description}
                  </p>
                )}

                <div className="row g-3 text-muted small">
                  <div className="col-md-4">
                    <strong>Author:</strong> {prMetadata.author || 'Unknown'}
                  </div>
                  <div className="col-md-4">
                    <strong>Source Branch:</strong>{' '}
                    <code className="text-primary">
                      {prMetadata.sourceBranch}
                    </code>
                  </div>
                  <div className="col-md-4">
                    <strong>Target Branch:</strong>{' '}
                    <code className="text-secondary">
                      {prMetadata.targetBranch}
                    </code>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* PR Files and Diff Viewer */}
        {prMetadata && (
          <div className="col-12">
            <div className="row g-4">
              {/* Left Column: Changed Files List */}
              <div className="col-md-4">
                <div className="card shadow-sm border-0 h-100">
                  <div
                    className="card-body p-3 d-flex flex-column"
                    style={{ maxHeight: '600px' }}
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

              {/* Right Column: File Diff Viewer */}
              <div className="col-md-8">
                <div className="card shadow-sm border-0 h-100">
                  <div
                    className="card-body p-3 d-flex flex-column"
                    style={{ minHeight: '400px' }}
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
                            <pre className="git-diff-viewer m-0">
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
