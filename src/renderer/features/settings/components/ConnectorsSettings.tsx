import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';

interface ConnectorsSettingsProps {
  // Azure DevOps State & Setters
  azureOrg: string;
  setAzureOrg: (val: string) => void;
  azureProject: string;
  setAzureProject: (val: string) => void;
  azurePat: string;
  setAzurePat: (val: string) => void;
  featureType: string;
  setFeatureType: (val: string) => void;
  storyType: string;
  setStoryType: (val: string) => void;
  taskType: string;
  setTaskType: (val: string) => void;
  testTaskTitle: string;
  setTestTaskTitle: (val: string) => void;

  // Confluence State & Setters
  confluenceUrl: string;
  setConfluenceUrl: (val: string) => void;
  confluenceUser: string;
  setConfluenceUser: (val: string) => void;
  confluenceToken: string;
  setConfluenceToken: (val: string) => void;

  // Sources State & Setters
  issuesSource: string;
  setIssuesSource: (val: string) => void;
  codeSource: string;
  setCodeSource: (val: string) => void;
  docsSource: string;
  setDocsSource: (val: string) => void;
}

const ConnectorsSettings: React.FC<ConnectorsSettingsProps> = ({
  azureOrg,
  setAzureOrg,
  azureProject,
  setAzureProject,
  azurePat,
  setAzurePat,
  featureType,
  setFeatureType,
  storyType,
  setStoryType,
  taskType,
  setTaskType,
  testTaskTitle,
  setTestTaskTitle,
  confluenceUrl,
  setConfluenceUrl,
  confluenceUser,
  setConfluenceUser,
  confluenceToken,
  setConfluenceToken,
  issuesSource,
  setIssuesSource,
  codeSource,
  setCodeSource,
  docsSource,
  setDocsSource,
}) => {
  // Modals Visibility
  const [showAzureModal, setShowAzureModal] = useState(false);
  const [showConfluenceModal, setShowConfluenceModal] = useState(false);

  // Local Modal States for Azure DevOps (committed on Save)
  const [localAzureOrg, setLocalAzureOrg] = useState(azureOrg);
  const [localAzureProject, setLocalAzureProject] = useState(azureProject);
  const [localAzurePat, setLocalAzurePat] = useState(azurePat);
  const [localFeatureType, setLocalFeatureType] = useState(featureType);
  const [localStoryType, setLocalStoryType] = useState(storyType);
  const [localTaskType, setLocalTaskType] = useState(taskType);
  const [localTestTaskTitle, setLocalTestTaskTitle] = useState(testTaskTitle);

  // Local Modal States for Confluence (committed on Save)
  const [localConfluenceUrl, setLocalConfluenceUrl] = useState(confluenceUrl);
  const [localConfluenceUser, setLocalConfluenceUser] =
    useState(confluenceUser);
  const [localConfluenceToken, setLocalConfluenceToken] =
    useState(confluenceToken);

  // Work Item Types Fetch State (Inside Azure Modal)
  const [workItemTypes, setWorkItemTypes] = useState<string[]>([]);
  const [isLoadingTypes, setIsLoadingTypes] = useState(false);
  const [fetchError, setFetchError] = useState('');

  // Sync local state when props change (e.g. on initial load)
  useEffect(() => {
    setLocalAzureOrg(azureOrg);
    setLocalAzureProject(azureProject);
    setLocalAzurePat(azurePat);
    setLocalFeatureType(featureType);
    setLocalStoryType(storyType);
    setLocalTaskType(taskType);
    setLocalTestTaskTitle(testTaskTitle);
  }, [
    azureOrg,
    azureProject,
    azurePat,
    featureType,
    storyType,
    taskType,
    testTaskTitle,
  ]);

  useEffect(() => {
    setLocalConfluenceUrl(confluenceUrl);
    setLocalConfluenceUser(confluenceUser);
    setLocalConfluenceToken(confluenceToken);
  }, [confluenceUrl, confluenceUser, confluenceToken]);

  // Is Connector Configured?
  const isAzureConfigured = azureOrg && azurePat;
  const isConfluenceConfigured = confluenceUrl && confluenceToken;

  const fetchWorkItemTypes = async () => {
    if (!localAzureOrg || !localAzurePat || !localAzureProject) {
      setFetchError(
        'Organization URL, Project Name, and PAT are required to fetch work item types.',
      );
      return;
    }
    setIsLoadingTypes(true);
    setFetchError('');
    try {
      const types = await window.electronAPI.getAzureWorkItemTypes(
        localAzureOrg,
        localAzurePat,
        localAzureProject,
      );
      setWorkItemTypes(types);
    } catch (err) {
      console.error(err);
      const errMsg =
        err instanceof Error
          ? err.message
          : 'Failed to fetch work item types. Please check your credentials and project name.';
      setFetchError(errMsg);
    } finally {
      setIsLoadingTypes(false);
    }
  };

  const handleOpenAzureModal = () => {
    setLocalAzureOrg(azureOrg);
    setLocalAzureProject(azureProject);
    setLocalAzurePat(azurePat);
    setLocalFeatureType(featureType);
    setLocalStoryType(storyType);
    setLocalTaskType(taskType);
    setLocalTestTaskTitle(testTaskTitle);
    setFetchError('');
    setShowAzureModal(true);
  };

  const handleSaveAzure = () => {
    setAzureOrg(localAzureOrg);
    setAzureProject(localAzureProject);
    setAzurePat(localAzurePat);
    setFeatureType(localFeatureType);
    setStoryType(localStoryType);
    setTaskType(localTaskType);
    setTestTaskTitle(localTestTaskTitle);
    setShowAzureModal(false);
  };

  const handleDisconnectAzure = () => {
    setAzureOrg('');
    setAzureProject('');
    setAzurePat('');
    // Leave work item defaults intact
  };

  const handleOpenConfluenceModal = () => {
    setLocalConfluenceUrl(confluenceUrl);
    setLocalConfluenceUser(confluenceUser);
    setLocalConfluenceToken(confluenceToken);
    setShowConfluenceModal(true);
  };

  const handleSaveConfluence = () => {
    setConfluenceUrl(localConfluenceUrl);
    setConfluenceUser(localConfluenceUser);
    setConfluenceToken(localConfluenceToken);
    setShowConfluenceModal(false);
  };

  const handleDisconnectConfluence = () => {
    setConfluenceUrl('');
    setConfluenceUser('');
    setConfluenceToken('');
  };

  return (
    <div className="d-flex flex-column gap-4">
      {/* Connectors Panel */}
      <div className="card shadow-sm border-0 bg-body-tertiary">
        <div className="card-body p-4">
          <h5 className="mb-4 border-bottom pb-2">
            <i className="fas fa-plug me-2 text-primary"></i>Integrations &
            Connectors
          </h5>

          <p className="text-muted small mb-4">
            Connect and configure external platforms. After connecting a
            platform, configure which data sources are routed through it below.
          </p>

          <div className="row g-3">
            {/* Azure DevOps Connector Card */}
            <div className="col-12 col-md-6">
              <div className="card h-100 border bg-light-subtle">
                <div className="card-body d-flex flex-column">
                  <div className="d-flex justify-content-between align-items-start mb-3">
                    <div className="d-flex align-items-center gap-2">
                      <div
                        className="d-flex align-items-center justify-content-center rounded bg-primary-subtle text-primary"
                        style={{ width: '40px', height: '40px' }}
                      >
                        <i className="fab fa-microsoft fa-lg"></i>
                      </div>
                      <div>
                        <h6 className="mb-0 fw-bold">Azure DevOps</h6>
                        <span className="text-muted small">
                          Issues, Code, and Pull Requests
                        </span>
                      </div>
                    </div>
                    {isAzureConfigured ? (
                      <span className="badge bg-success-subtle text-success border border-success-subtle px-2 py-1">
                        Connected
                      </span>
                    ) : (
                      <span className="badge bg-secondary-subtle text-secondary border border-secondary-subtle px-2 py-1">
                        Not Connected
                      </span>
                    )}
                  </div>

                  {isAzureConfigured && (
                    <div className="bg-body-tertiary rounded p-2 mb-3 small">
                      <div className="text-truncate">
                        <strong>Org:</strong> {azureOrg}
                      </div>
                      <div className="text-truncate">
                        <strong>Project:</strong> {azureProject}
                      </div>
                    </div>
                  )}

                  <div className="mt-auto pt-2 d-flex gap-2">
                    {isAzureConfigured ? (
                      <>
                        <button
                          type="button"
                          className="btn btn-outline-secondary btn-sm flex-grow-1"
                          onClick={handleOpenAzureModal}
                        >
                          <i className="fas fa-edit me-1"></i> Edit
                        </button>
                        <button
                          type="button"
                          className="btn btn-outline-danger btn-sm px-3"
                          onClick={handleDisconnectAzure}
                          title="Disconnect Azure DevOps"
                        >
                          <i className="fas fa-unlink"></i>
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-primary btn-sm w-100"
                        onClick={handleOpenAzureModal}
                      >
                        <i className="fas fa-link me-1"></i> Connect
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Confluence Connector Card */}
            <div className="col-12 col-md-6">
              <div className="card h-100 border bg-light-subtle">
                <div className="card-body d-flex flex-column">
                  <div className="d-flex justify-content-between align-items-start mb-3">
                    <div className="d-flex align-items-center gap-2">
                      <div
                        className="d-flex align-items-center justify-content-center rounded bg-primary-subtle text-primary"
                        style={{ width: '40px', height: '40px' }}
                      >
                        <i className="fas fa-book fa-lg"></i>
                      </div>
                      <div>
                        <h6 className="mb-0 fw-bold">Confluence</h6>
                        <span className="text-muted small">
                          Requirements & Documentation
                        </span>
                      </div>
                    </div>
                    {isConfluenceConfigured ? (
                      <span className="badge bg-success-subtle text-success border border-success-subtle px-2 py-1">
                        Connected
                      </span>
                    ) : (
                      <span className="badge bg-secondary-subtle text-secondary border border-secondary-subtle px-2 py-1">
                        Not Connected
                      </span>
                    )}
                  </div>

                  {isConfluenceConfigured && (
                    <div className="bg-body-tertiary rounded p-2 mb-3 small">
                      <div className="text-truncate">
                        <strong>URL:</strong> {confluenceUrl}
                      </div>
                      {confluenceUser && (
                        <div className="text-truncate">
                          <strong>User:</strong> {confluenceUser}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="mt-auto pt-2 d-flex gap-2">
                    {isConfluenceConfigured ? (
                      <>
                        <button
                          type="button"
                          className="btn btn-outline-secondary btn-sm flex-grow-1"
                          onClick={handleOpenConfluenceModal}
                        >
                          <i className="fas fa-edit me-1"></i> Edit
                        </button>
                        <button
                          type="button"
                          className="btn btn-outline-danger btn-sm px-3"
                          onClick={handleDisconnectConfluence}
                          title="Disconnect Confluence"
                        >
                          <i className="fas fa-unlink"></i>
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-primary btn-sm w-100"
                        onClick={handleOpenConfluenceModal}
                      >
                        <i className="fas fa-link me-1"></i> Connect
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* GitHub Connector Card (Coming Soon) */}
            <div className="col-12 col-md-6 opacity-75">
              <div className="card h-100 border border-dashed bg-body-tertiary">
                <div className="card-body d-flex flex-column justify-content-center py-4">
                  <div className="d-flex align-items-center justify-content-between mb-2">
                    <div className="d-flex align-items-center gap-2">
                      <div
                        className="d-flex align-items-center justify-content-center rounded bg-body text-muted"
                        style={{ width: '40px', height: '40px' }}
                      >
                        <i className="fab fa-github fa-lg"></i>
                      </div>
                      <div>
                        <h6 className="mb-0 fw-semibold text-muted">GitHub</h6>
                        <span className="text-muted small">
                          Code & PR Reviewer
                        </span>
                      </div>
                    </div>
                    <span className="badge bg-secondary-subtle text-secondary px-2 py-1 small">
                      Coming Soon
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Notion Connector Card (Coming Soon) */}
            <div className="col-12 col-md-6 opacity-75">
              <div className="card h-100 border border-dashed bg-body-tertiary">
                <div className="card-body d-flex flex-column justify-content-center py-4">
                  <div className="d-flex align-items-center justify-content-between mb-2">
                    <div className="d-flex align-items-center gap-2">
                      <div
                        className="d-flex align-items-center justify-content-center rounded bg-body text-muted"
                        style={{ width: '40px', height: '40px' }}
                      >
                        <i className="fas fa-file-invoice fa-lg"></i>
                      </div>
                      <div>
                        <h6 className="mb-0 fw-semibold text-muted">Notion</h6>
                        <span className="text-muted small">
                          Workspaces & Docs
                        </span>
                      </div>
                    </div>
                    <span className="badge bg-secondary-subtle text-secondary px-2 py-1 small">
                      Coming Soon
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Sources Routing Section */}
      <div className="card shadow-sm border-0 bg-body-tertiary">
        <div className="card-body p-4">
          <h5 className="mb-3 border-bottom pb-2">
            <i className="fas fa-route me-2 text-primary"></i>Source Routing
          </h5>

          <p className="text-muted small mb-4">
            Route data sources to your active integration connectors. Some
            sources only support specific integrations.
          </p>

          <div className="row g-3">
            {/* Issues Source */}
            <div className="col-12 col-md-4">
              <div className="mb-3">
                <label className="form-label fw-semibold">
                  Issues Tracker Source
                </label>
                <select
                  className="form-select"
                  value={issuesSource}
                  onChange={(e) => setIssuesSource(e.target.value)}
                >
                  <option value="">None</option>
                  <option value="azureDevOps" disabled={!isAzureConfigured}>
                    Azure DevOps {!isAzureConfigured ? '(Unconfigured)' : ''}
                  </option>
                </select>
                <div className="form-text small">
                  Select where to fetch and sync work items/issues.
                </div>
              </div>
            </div>

            {/* Code Source */}
            <div className="col-12 col-md-4">
              <div className="mb-3">
                <label className="form-label fw-semibold">Code Source</label>
                <select
                  className="form-select"
                  value={codeSource}
                  onChange={(e) => setCodeSource(e.target.value)}
                >
                  <option value="">None</option>
                  <option value="azureDevOps" disabled={!isAzureConfigured}>
                    Azure DevOps {!isAzureConfigured ? '(Unconfigured)' : ''}
                  </option>
                </select>
                <div className="form-text small">
                  Select where repositories and pull requests reside.
                </div>
              </div>
            </div>

            {/* Docs Source */}
            <div className="col-12 col-md-4">
              <div className="mb-3">
                <label className="form-label fw-semibold">
                  Documentation Source
                </label>
                <select
                  className="form-select"
                  value={docsSource}
                  onChange={(e) => setDocsSource(e.target.value)}
                >
                  <option value="">None</option>
                  <option value="atlassian" disabled={!isConfluenceConfigured}>
                    Confluence / Atlassian{' '}
                    {!isConfluenceConfigured ? '(Unconfigured)' : ''}
                  </option>
                </select>
                <div className="form-text small">
                  Select where product requirements/specs reside.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Azure DevOps Portal Modal */}
      {showAzureModal &&
        createPortal(
          <div className="env-error-overlay" style={{ zIndex: 3000 }}>
            <div
              className="near-full-modal text-start"
              style={{ width: '600px', padding: '30px' }}
            >
              <button
                type="button"
                className="btn-close position-absolute"
                style={{ top: '20px', right: '20px' }}
                onClick={() => setShowAzureModal(false)}
                aria-label="Close"
              ></button>

              <h5 className="mb-4 fw-bold">
                <i className="fab fa-microsoft text-primary me-2"></i>Configure
                Azure DevOps
              </h5>

              <div className="mb-3">
                <label className="form-label fw-semibold small">
                  Organization URL
                </label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="https://dev.azure.com/your-org"
                  value={localAzureOrg}
                  onChange={(e) => setLocalAzureOrg(e.target.value)}
                />
              </div>

              <div className="mb-3">
                <label className="form-label fw-semibold small">
                  Project Name
                </label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="YourProject"
                  value={localAzureProject}
                  onChange={(e) => setLocalAzureProject(e.target.value)}
                />
              </div>

              <div className="mb-3">
                <label className="form-label fw-semibold small">
                  Personal Access Token (PAT)
                </label>
                <input
                  type="password"
                  className="form-control"
                  value={localAzurePat}
                  onChange={(e) => setLocalAzurePat(e.target.value)}
                  placeholder="••••••••••••••••••••••••••••••••••••••••••••"
                />
              </div>

              {/* Work Item Types inside Modal */}
              <div className="border-top pt-3 mt-4 mb-3">
                <div className="d-flex justify-content-between align-items-center mb-3">
                  <h6 className="fw-bold mb-0">Work Item Types</h6>
                  <button
                    type="button"
                    className="btn btn-outline-primary btn-sm"
                    onClick={fetchWorkItemTypes}
                    disabled={
                      isLoadingTypes ||
                      !localAzureOrg ||
                      !localAzurePat ||
                      !localAzureProject
                    }
                  >
                    {isLoadingTypes ? (
                      <>
                        <span
                          className="spinner-border spinner-border-sm me-2"
                          role="status"
                        ></span>
                        Fetching...
                      </>
                    ) : (
                      <>
                        <i className="fas fa-sync me-1"></i> Fetch Types
                      </>
                    )}
                  </button>
                </div>

                {fetchError && (
                  <div className="alert alert-danger p-2 small mb-3">
                    {fetchError}
                  </div>
                )}

                <div className="row g-2">
                  <div className="col-6">
                    <label className="form-label small">Feature Type</label>
                    <input
                      type="text"
                      className="form-control form-control-sm"
                      list="work-item-types-list"
                      value={localFeatureType}
                      onChange={(e) => setLocalFeatureType(e.target.value)}
                    />
                  </div>
                  <div className="col-6">
                    <label className="form-label small">Story Type</label>
                    <input
                      type="text"
                      className="form-control form-control-sm"
                      list="work-item-types-list"
                      value={localStoryType}
                      onChange={(e) => setLocalStoryType(e.target.value)}
                    />
                  </div>
                  <div className="col-6">
                    <label className="form-label small">Task Type</label>
                    <input
                      type="text"
                      className="form-control form-control-sm"
                      list="work-item-types-list"
                      value={localTaskType}
                      onChange={(e) => setLocalTaskType(e.target.value)}
                    />
                  </div>
                  <div className="col-6">
                    <label className="form-label small">Test Task Title</label>
                    <input
                      type="text"
                      className="form-control form-control-sm"
                      value={localTestTaskTitle}
                      onChange={(e) => setLocalTestTaskTitle(e.target.value)}
                    />
                  </div>
                </div>

                <datalist id="work-item-types-list">
                  {workItemTypes.map((t) => (
                    <option key={t} value={t} />
                  ))}
                </datalist>
              </div>

              <div className="d-flex justify-content-end gap-2 mt-4 pt-3 border-top">
                <button
                  type="button"
                  className="btn btn-secondary btn-sm px-4"
                  onClick={() => setShowAzureModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-sm px-4"
                  onClick={handleSaveAzure}
                >
                  Apply
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {/* Confluence Portal Modal */}
      {showConfluenceModal &&
        createPortal(
          <div className="env-error-overlay" style={{ zIndex: 3000 }}>
            <div
              className="near-full-modal text-start"
              style={{ width: '500px', padding: '30px' }}
            >
              <button
                type="button"
                className="btn-close position-absolute"
                style={{ top: '20px', right: '20px' }}
                onClick={() => setShowConfluenceModal(false)}
                aria-label="Close"
              ></button>

              <h5 className="mb-4 fw-bold">
                <i className="fas fa-book text-primary me-2"></i>Configure
                Confluence
              </h5>

              <div className="mb-3">
                <label className="form-label fw-semibold small">
                  Confluence URL
                </label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="https://your-domain.atlassian.net/wiki"
                  value={localConfluenceUrl}
                  onChange={(e) => setLocalConfluenceUrl(e.target.value)}
                />
              </div>

              <div className="mb-3">
                <label className="form-label fw-semibold small">
                  Email / User (Optional)
                </label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="user@example.com"
                  value={localConfluenceUser}
                  onChange={(e) => setLocalConfluenceUser(e.target.value)}
                />
              </div>

              <div className="mb-3">
                <label className="form-label fw-semibold small">
                  API Token / PAT
                </label>
                <input
                  type="password"
                  className="form-control"
                  value={localConfluenceToken}
                  onChange={(e) => setLocalConfluenceToken(e.target.value)}
                  placeholder="••••••••••••••••••••••••••••••••••••••••••••"
                />
              </div>

              <div className="d-flex justify-content-end gap-2 mt-4 pt-3 border-top">
                <button
                  type="button"
                  className="btn btn-secondary btn-sm px-4"
                  onClick={() => setShowConfluenceModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-sm px-4"
                  onClick={handleSaveConfluence}
                >
                  Apply
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
};

export default ConnectorsSettings;
