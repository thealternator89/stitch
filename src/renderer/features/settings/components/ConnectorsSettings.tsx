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

  // GitHub State & Setters
  githubToken: string;
  setGithubToken: (val: string) => void;
  githubOwner: string;
  setGithubOwner: (val: string) => void;
  githubRepo: string;
  setGithubRepo: (val: string) => void;

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
  githubToken,
  setGithubToken,
  githubOwner,
  setGithubOwner,
  githubRepo,
  setGithubRepo,
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

  // Load work item types if credentials exist when opening Azure Modal
  useEffect(() => {
    if (showAzureModal && localAzureOrg && localAzurePat && localAzureProject) {
      fetchWorkItemTypes();
    }
  }, [showAzureModal]);

  // Is Connector Configured?
  const isAzureConfigured = azureOrg && azurePat;
  const isConfluenceConfigured = confluenceUrl && confluenceToken;
  const isGithubConfigured = githubToken;

  const [showGithubModal, setShowGithubModal] = useState(false);
  const [localGithubToken, setLocalGithubToken] = useState(githubToken);
  const [localGithubOwner, setLocalGithubOwner] = useState(githubOwner);
  const [localGithubRepo, setLocalGithubRepo] = useState(githubRepo);

  useEffect(() => {
    setLocalGithubToken(githubToken);
    setLocalGithubOwner(githubOwner);
    setLocalGithubRepo(githubRepo);
  }, [githubToken, githubOwner, githubRepo]);

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

  const handleOpenGithubModal = () => {
    setLocalGithubToken(githubToken);
    setLocalGithubOwner(githubOwner);
    setLocalGithubRepo(githubRepo);
    setShowGithubModal(true);
  };

  const handleSaveGithub = () => {
    setGithubToken(localGithubToken);
    setGithubOwner(localGithubOwner);
    setGithubRepo(localGithubRepo);
    setShowGithubModal(false);
  };

  const handleDisconnectGithub = () => {
    setGithubToken('');
    setGithubOwner('');
    setGithubRepo('');
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
            <div className="col-12">
              <div className="card border bg-light-subtle">
                <div className="card-body d-flex align-items-center justify-content-between py-3">
                  {/* Left side: Icon & Details */}
                  <div className="d-flex align-items-center gap-3 flex-grow-1 min-w-0">
                    <div
                      className="d-flex align-items-center justify-content-center rounded bg-primary-subtle text-primary"
                      style={{ width: '45px', height: '45px', flexShrink: 0 }}
                    >
                      <i className="fab fa-microsoft fa-lg"></i>
                    </div>
                    <div
                      className="flex-grow-1 min-w-0"
                      style={{ maxWidth: '500px' }}
                    >
                      <div className="d-flex align-items-center gap-2 mb-1">
                        <h6 className="mb-0 fw-bold">Azure DevOps</h6>
                        {isAzureConfigured ? (
                          <span
                            className="badge bg-success-subtle text-success border border-success-subtle px-2 py-0.5"
                            style={{ fontSize: '0.75rem' }}
                          >
                            Connected
                          </span>
                        ) : (
                          <span
                            className="badge bg-secondary-subtle text-secondary border border-secondary-subtle px-2 py-0.5"
                            style={{ fontSize: '0.75rem' }}
                          >
                            Not Connected
                          </span>
                        )}
                      </div>
                      {isAzureConfigured && (
                        <div className="text-muted small mt-1">
                          <div className="text-truncate">
                            <strong>Org:</strong> {azureOrg}
                          </div>
                          <div className="text-truncate">
                            <strong>Project:</strong> {azureProject}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right side: Action Buttons */}
                  <div className="d-flex gap-2 align-items-center ms-3">
                    {isAzureConfigured ? (
                      <>
                        <button
                          type="button"
                          className="btn btn-outline-secondary btn-sm px-3"
                          onClick={handleOpenAzureModal}
                          title="Edit Azure DevOps Connection"
                        >
                          <i className="fas fa-edit"></i>
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
                        className="btn btn-primary btn-sm px-4"
                        onClick={handleOpenAzureModal}
                      >
                        <i className="fas fa-link me-1"></i> Connect
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Confluence/Atlassian Connector Card */}
            <div className="col-12">
              <div className="card border bg-light-subtle">
                <div className="card-body d-flex align-items-center justify-content-between py-3">
                  {/* Left side: Icon & Details */}
                  <div className="d-flex align-items-center gap-3 flex-grow-1 min-w-0">
                    <div
                      className="d-flex align-items-center justify-content-center rounded bg-primary-subtle text-primary"
                      style={{ width: '45px', height: '45px', flexShrink: 0 }}
                    >
                      <i className="fab fa-atlassian fa-lg"></i>
                    </div>
                    <div
                      className="flex-grow-1 min-w-0"
                      style={{ maxWidth: '500px' }}
                    >
                      <div className="d-flex align-items-center gap-2 mb-1">
                        <h6 className="mb-0 fw-bold">Atlassian</h6>
                        {isConfluenceConfigured ? (
                          <span
                            className="badge bg-success-subtle text-success border border-success-subtle px-2 py-0.5"
                            style={{ fontSize: '0.75rem' }}
                          >
                            Connected
                          </span>
                        ) : (
                          <span
                            className="badge bg-secondary-subtle text-secondary border border-secondary-subtle px-2 py-0.5"
                            style={{ fontSize: '0.75rem' }}
                          >
                            Not Connected
                          </span>
                        )}
                      </div>
                      {isConfluenceConfigured && (
                        <div className="text-muted small mt-1">
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
                    </div>
                  </div>

                  {/* Right side: Action Buttons */}
                  <div className="d-flex gap-2 align-items-center ms-3">
                    {isConfluenceConfigured ? (
                      <>
                        <button
                          type="button"
                          className="btn btn-outline-secondary btn-sm px-3"
                          onClick={handleOpenConfluenceModal}
                          title="Edit Atlassian Connection"
                        >
                          <i className="fas fa-edit"></i>
                        </button>
                        <button
                          type="button"
                          className="btn btn-outline-danger btn-sm px-3"
                          onClick={handleDisconnectConfluence}
                          title="Disconnect Atlassian"
                        >
                          <i className="fas fa-unlink"></i>
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-primary btn-sm px-4"
                        onClick={handleOpenConfluenceModal}
                      >
                        <i className="fas fa-link me-1"></i> Connect
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* GitHub Connector Card */}
            <div className="col-12">
              <div className="card border bg-light-subtle">
                <div className="card-body d-flex align-items-center justify-content-between py-3">
                  {/* Left side: Icon & Details */}
                  <div className="d-flex align-items-center gap-3 flex-grow-1 min-w-0">
                    <div
                      className="d-flex align-items-center justify-content-center rounded bg-primary-subtle text-primary"
                      style={{ width: '45px', height: '45px', flexShrink: 0 }}
                    >
                      <i className="fab fa-github fa-lg"></i>
                    </div>
                    <div
                      className="flex-grow-1 min-w-0"
                      style={{ maxWidth: '500px' }}
                    >
                      <div className="d-flex align-items-center gap-2 mb-1">
                        <h6 className="mb-0 fw-bold">GitHub</h6>
                        {isGithubConfigured ? (
                          <span
                            className="badge bg-success-subtle text-success border border-success-subtle px-2 py-0.5"
                            style={{ fontSize: '0.75rem' }}
                          >
                            Connected
                          </span>
                        ) : (
                          <span
                            className="badge bg-secondary-subtle text-secondary border border-secondary-subtle px-2 py-0.5"
                            style={{ fontSize: '0.75rem' }}
                          >
                            Not Connected
                          </span>
                        )}
                      </div>
                      {isGithubConfigured && (
                        <div className="text-muted small mt-1">
                          {githubOwner && (
                            <div className="text-truncate">
                              <strong>Default Owner:</strong> {githubOwner}
                            </div>
                          )}
                          {githubRepo && (
                            <div className="text-truncate">
                              <strong>Default Repo:</strong> {githubRepo}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right side: Action Buttons */}
                  <div className="d-flex gap-2 align-items-center ms-3">
                    {isGithubConfigured ? (
                      <>
                        <button
                          type="button"
                          className="btn btn-outline-secondary btn-sm px-3"
                          onClick={handleOpenGithubModal}
                          title="Edit GitHub Connection"
                        >
                          <i className="fas fa-edit"></i>
                        </button>
                        <button
                          type="button"
                          className="btn btn-outline-danger btn-sm px-3"
                          onClick={handleDisconnectGithub}
                          title="Disconnect GitHub"
                        >
                          <i className="fas fa-unlink"></i>
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-primary btn-sm px-4"
                        onClick={handleOpenGithubModal}
                      >
                        <i className="fas fa-link me-1"></i> Connect
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Notion Connector Card (Coming Soon) */}
            <div className="col-12 opacity-75">
              <div className="card border border-dashed bg-body-tertiary">
                <div className="card-body d-flex align-items-center justify-content-between py-3">
                  <div className="d-flex align-items-center gap-3">
                    <div
                      className="d-flex align-items-center justify-content-center rounded bg-body text-muted"
                      style={{ width: '45px', height: '45px', flexShrink: 0 }}
                    >
                      <i className="fab fa-notion fa-lg"></i>
                    </div>
                    <div>
                      <div className="d-flex align-items-center gap-2 mb-1">
                        <h6 className="mb-0 fw-semibold text-muted">Notion</h6>
                      </div>
                    </div>
                  </div>
                  <div className="ms-3">
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

          <div className="mt-2">
            {/* Issues Source */}
            <div className="row mb-3 align-items-center">
              <label className="col-sm-4 form-label fw-semibold small mb-0">
                Issues Tracker Source
              </label>
              <div className="col-sm-8">
                <select
                  className="form-select"
                  value={issuesSource}
                  onChange={(e) => setIssuesSource(e.target.value)}
                >
                  <option value="">None</option>
                  <option value="azureDevOps" disabled={!isAzureConfigured}>
                    Azure DevOps {!isAzureConfigured ? ' (Unconfigured)' : ''}
                  </option>
                  <option value="github" disabled={!isGithubConfigured}>
                    GitHub {!isGithubConfigured ? ' (Unconfigured)' : ''}
                  </option>
                </select>
              </div>
            </div>

            {/* Code Source */}
            <div className="row mb-3 align-items-center">
              <label className="col-sm-4 form-label fw-semibold small mb-0">
                Code Source
              </label>
              <div className="col-sm-8">
                <select
                  className="form-select"
                  value={codeSource}
                  onChange={(e) => setCodeSource(e.target.value)}
                >
                  <option value="">None</option>
                  <option value="azureDevOps" disabled={!isAzureConfigured}>
                    Azure DevOps {!isAzureConfigured ? ' (Unconfigured)' : ''}
                  </option>
                  <option value="github" disabled={!isGithubConfigured}>
                    GitHub {!isGithubConfigured ? ' (Unconfigured)' : ''}
                  </option>
                </select>
              </div>
            </div>

            {/* Docs Source */}
            <div className="row mb-3 align-items-center">
              <label className="col-sm-4 form-label fw-semibold small mb-0">
                Documentation Source
              </label>
              <div className="col-sm-8">
                <select
                  className="form-select"
                  value={docsSource}
                  onChange={(e) => setDocsSource(e.target.value)}
                >
                  <option value="">None</option>
                  <option value="atlassian" disabled={!isConfluenceConfigured}>
                    Atlassian {!isConfluenceConfigured ? ' (Unconfigured)' : ''}
                  </option>
                </select>
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

              <div className="mt-2">
                <div className="row mb-3 align-items-center">
                  <label className="col-sm-4 form-label fw-semibold small mb-0">
                    Organization URL
                  </label>
                  <div className="col-sm-8">
                    <input
                      type="text"
                      className="form-control"
                      placeholder="https://dev.azure.com/your-org"
                      value={localAzureOrg}
                      onChange={(e) => setLocalAzureOrg(e.target.value)}
                    />
                  </div>
                </div>

                <div className="row mb-3 align-items-center">
                  <label className="col-sm-4 form-label fw-semibold small mb-0">
                    Project Name
                  </label>
                  <div className="col-sm-8">
                    <input
                      type="text"
                      className="form-control"
                      placeholder="YourProject"
                      value={localAzureProject}
                      onChange={(e) => setLocalAzureProject(e.target.value)}
                    />
                  </div>
                </div>

                <div className="row mb-3 align-items-center">
                  <label className="col-sm-4 form-label fw-semibold small mb-0">
                    Personal Access Token (PAT)
                  </label>
                  <div className="col-sm-8">
                    <input
                      type="password"
                      className="form-control"
                      value={localAzurePat}
                      onChange={(e) => setLocalAzurePat(e.target.value)}
                      placeholder="••••••••••••••••••••••••••••••••••••••••••••"
                    />
                  </div>
                </div>
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

                <div className="mt-2">
                  <div className="row mb-2 align-items-center">
                    <label className="col-sm-4 form-label small mb-0">
                      Feature Type
                    </label>
                    <div className="col-sm-8">
                      {workItemTypes.length > 0 ? (
                        <select
                          className="form-select form-select-sm"
                          value={localFeatureType}
                          onChange={(e) => setLocalFeatureType(e.target.value)}
                        >
                          {!workItemTypes.includes(localFeatureType) && (
                            <option value={localFeatureType}>
                              {localFeatureType} (custom)
                            </option>
                          )}
                          {workItemTypes.map((type) => (
                            <option key={type} value={type}>
                              {type}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type="text"
                          className="form-control form-control-sm"
                          placeholder="Feature"
                          value={localFeatureType}
                          onChange={(e) => setLocalFeatureType(e.target.value)}
                        />
                      )}
                    </div>
                  </div>

                  <div className="row mb-2 align-items-center">
                    <label className="col-sm-4 form-label small mb-0">
                      Story Type
                    </label>
                    <div className="col-sm-8">
                      {workItemTypes.length > 0 ? (
                        <select
                          className="form-select form-select-sm"
                          value={localStoryType}
                          onChange={(e) => setLocalStoryType(e.target.value)}
                        >
                          {!workItemTypes.includes(localStoryType) && (
                            <option value={localStoryType}>
                              {localStoryType} (custom)
                            </option>
                          )}
                          {workItemTypes.map((type) => (
                            <option key={type} value={type}>
                              {type}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type="text"
                          className="form-control form-control-sm"
                          placeholder="Product Backlog Item"
                          value={localStoryType}
                          onChange={(e) => setLocalStoryType(e.target.value)}
                        />
                      )}
                    </div>
                  </div>

                  <div className="row mb-2 align-items-center">
                    <label className="col-sm-4 form-label small mb-0">
                      Task Type
                    </label>
                    <div className="col-sm-8">
                      {workItemTypes.length > 0 ? (
                        <select
                          className="form-select form-select-sm"
                          value={localTaskType}
                          onChange={(e) => setLocalTaskType(e.target.value)}
                        >
                          {!workItemTypes.includes(localTaskType) && (
                            <option value={localTaskType}>
                              {localTaskType} (custom)
                            </option>
                          )}
                          {workItemTypes.map((type) => (
                            <option key={type} value={type}>
                              {type}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type="text"
                          className="form-control form-control-sm"
                          placeholder="Task"
                          value={localTaskType}
                          onChange={(e) => setLocalTaskType(e.target.value)}
                        />
                      )}
                    </div>
                  </div>

                  <div className="row mb-2 align-items-center">
                    <label className="col-sm-4 form-label small mb-0">
                      Test Task Title
                    </label>
                    <div className="col-sm-8">
                      <input
                        type="text"
                        className="form-control form-control-sm"
                        value={localTestTaskTitle}
                        onChange={(e) => setLocalTestTaskTitle(e.target.value)}
                      />
                    </div>
                  </div>
                </div>
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
                <i className="fab fa-atlassian text-primary me-2"></i>Configure
                Atlassian
              </h5>

              <div className="mt-2">
                <div className="row mb-3 align-items-center">
                  <label className="col-sm-4 form-label fw-semibold small mb-0">
                    Confluence URL
                  </label>
                  <div className="col-sm-8">
                    <input
                      type="text"
                      className="form-control"
                      placeholder="https://your-domain.atlassian.net/wiki"
                      value={localConfluenceUrl}
                      onChange={(e) => setLocalConfluenceUrl(e.target.value)}
                    />
                  </div>
                </div>

                <div className="row mb-3 align-items-center">
                  <label className="col-sm-4 form-label fw-semibold small mb-0">
                    Email / User (Optional)
                  </label>
                  <div className="col-sm-8">
                    <input
                      type="text"
                      className="form-control"
                      placeholder="user@example.com"
                      value={localConfluenceUser}
                      onChange={(e) => setLocalConfluenceUser(e.target.value)}
                    />
                  </div>
                </div>

                <div className="row mb-3 align-items-center">
                  <label className="col-sm-4 form-label fw-semibold small mb-0">
                    API Token / PAT
                  </label>
                  <div className="col-sm-8">
                    <input
                      type="password"
                      className="form-control"
                      value={localConfluenceToken}
                      onChange={(e) => setLocalConfluenceToken(e.target.value)}
                      placeholder="••••••••••••••••••••••••••••••••••••••••••••"
                    />
                  </div>
                </div>
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

      {/* GitHub Portal Modal */}
      {showGithubModal &&
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
                onClick={() => setShowGithubModal(false)}
                aria-label="Close"
              ></button>

              <h5 className="mb-4 fw-bold">
                <i className="fab fa-github text-primary me-2"></i>Configure
                GitHub
              </h5>

              <div className="mt-2">
                <div className="row mb-3 align-items-center">
                  <label className="col-sm-4 form-label fw-semibold small mb-0">
                    Personal Access Token (PAT)
                  </label>
                  <div className="col-sm-8">
                    <input
                      type="password"
                      className="form-control"
                      value={localGithubToken}
                      onChange={(e) => setLocalGithubToken(e.target.value)}
                      placeholder="ghp_••••••••••••••••••••••••••••••••••••"
                    />
                  </div>
                </div>

                <div className="row mb-3 align-items-center">
                  <label className="col-sm-4 form-label fw-semibold small mb-0">
                    Default Owner / Org (Optional)
                  </label>
                  <div className="col-sm-8">
                    <input
                      type="text"
                      className="form-control"
                      placeholder="e.g. octocat"
                      value={localGithubOwner}
                      onChange={(e) => setLocalGithubOwner(e.target.value)}
                    />
                  </div>
                </div>

                <div className="row mb-3 align-items-center">
                  <label className="col-sm-4 form-label fw-semibold small mb-0">
                    Default Repository (Optional)
                  </label>
                  <div className="col-sm-8">
                    <input
                      type="text"
                      className="form-control"
                      placeholder="e.g. Hello-World"
                      value={localGithubRepo}
                      onChange={(e) => setLocalGithubRepo(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              <div className="d-flex justify-content-end gap-2 mt-4 pt-3 border-top">
                <button
                  type="button"
                  className="btn btn-secondary btn-sm px-4"
                  onClick={() => setShowGithubModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-sm px-4"
                  onClick={handleSaveGithub}
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
