import React, { useState, useEffect } from 'react';

interface AzureSettingsProps {
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
}

const AzureSettings: React.FC<AzureSettingsProps> = ({
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
}) => {
  const [workItemTypes, setWorkItemTypes] = useState<string[]>([]);
  const [isLoadingTypes, setIsLoadingTypes] = useState(false);
  const [fetchError, setFetchError] = useState('');

  const fetchWorkItemTypes = async () => {
    if (!azureOrg || !azurePat || !azureProject) {
      setFetchError(
        'Organization URL, Project Name, and PAT are required to fetch work item types.',
      );
      return;
    }
    setIsLoadingTypes(true);
    setFetchError('');
    try {
      const types = await window.electronAPI.getAzureWorkItemTypes(
        azureOrg,
        azurePat,
        azureProject,
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

  useEffect(() => {
    if (azureOrg && azurePat && azureProject) {
      fetchWorkItemTypes();
    }
  }, []);

  return (
    <div className="card shadow-sm border-0 bg-body-tertiary">
      <div className="card-body p-4">
        <h5 className="mb-4 border-bottom pb-2">
          <i className="fab fa-microsoft me-2 text-primary"></i>Azure DevOps
          Configuration
        </h5>

        <p className="text-muted small mb-4">
          Configure connection details to fetch and sync work items, user
          stories, and tasks directly with your Azure DevOps instance.
        </p>

        <div className="mb-3">
          <label className="form-label fw-semibold">Organization URL</label>
          <input
            type="text"
            className="form-control"
            placeholder="https://dev.azure.com/your-org"
            value={azureOrg}
            onChange={(e) => setAzureOrg(e.target.value)}
          />
          <div className="form-text">
            The base URL for your Azure DevOps organization (e.g.
            `https://dev.azure.com/myorganization`).
          </div>
        </div>

        <div className="mb-3">
          <label className="form-label fw-semibold">Project Name</label>
          <input
            type="text"
            className="form-control"
            placeholder="YourProject"
            value={azureProject}
            onChange={(e) => setAzureProject(e.target.value)}
          />
          <div className="form-text">
            The target project where work items reside.
          </div>
        </div>

        <div className="mb-3">
          <label className="form-label fw-semibold">
            Personal Access Token (PAT)
          </label>
          <input
            type="password"
            className="form-control"
            value={azurePat}
            onChange={(e) => setAzurePat(e.target.value)}
            placeholder="••••••••••••••••••••••••••••••••••••••••••••"
          />
          <div className="form-text">
            Ensure your PAT has read and write access scope for work items.
          </div>
        </div>

        <div className="mb-4 mt-4 border-top pt-3">
          <div className="d-flex justify-content-between align-items-center mb-3">
            <h6 className="fw-bold mb-0">Work Item Types</h6>
            <button
              type="button"
              className="btn btn-outline-primary btn-sm"
              onClick={fetchWorkItemTypes}
              disabled={
                isLoadingTypes || !azureOrg || !azurePat || !azureProject
              }
            >
              {isLoadingTypes ? (
                <>
                  <span
                    className="spinner-border spinner-border-sm me-2"
                    role="status"
                    aria-hidden="true"
                  ></span>
                  Fetching...
                </>
              ) : (
                <>
                  <i className="fas fa-sync-alt me-2"></i>
                  Fetch Types
                </>
              )}
            </button>
          </div>

          {fetchError && (
            <div className="alert alert-warning py-2 px-3 small">
              {fetchError}
            </div>
          )}

          <div className="row">
            <div className="col-md-6 mb-3">
              <label className="form-label fw-semibold">
                Feature Work Item Type
              </label>
              {workItemTypes.length > 0 ? (
                <select
                  className="form-select"
                  value={featureType}
                  onChange={(e) => setFeatureType(e.target.value)}
                >
                  {!workItemTypes.includes(featureType) && (
                    <option value={featureType}>{featureType} (custom)</option>
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
                  className="form-control"
                  placeholder="Feature"
                  value={featureType}
                  onChange={(e) => setFeatureType(e.target.value)}
                />
              )}
              <div className="form-text">
                Work item type used for Features. Default is `Feature`.
              </div>
            </div>

            <div className="col-md-6 mb-3">
              <label className="form-label fw-semibold">
                Story Work Item Type
              </label>
              {workItemTypes.length > 0 ? (
                <select
                  className="form-select"
                  value={storyType}
                  onChange={(e) => setStoryType(e.target.value)}
                >
                  {!workItemTypes.includes(storyType) && (
                    <option value={storyType}>{storyType} (custom)</option>
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
                  className="form-control"
                  placeholder="Product Backlog Item"
                  value={storyType}
                  onChange={(e) => setStoryType(e.target.value)}
                />
              )}
              <div className="form-text">
                Work item type used for Stories. Default is `Product Backlog
                Item`.
              </div>
            </div>

            <div className="col-md-6 mb-3">
              <label className="form-label fw-semibold">
                Task Work Item Type
              </label>
              {workItemTypes.length > 0 ? (
                <select
                  className="form-select"
                  value={taskType}
                  onChange={(e) => setTaskType(e.target.value)}
                >
                  {!workItemTypes.includes(taskType) && (
                    <option value={taskType}>{taskType} (custom)</option>
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
                  className="form-control"
                  placeholder="Task"
                  value={taskType}
                  onChange={(e) => setTaskType(e.target.value)}
                />
              )}
              <div className="form-text">
                Work item type used for Tasks. Default is `Task`.
              </div>
            </div>

            <div className="col-md-6 mb-3">
              <label className="form-label fw-semibold">Test Task Title</label>
              <input
                type="text"
                className="form-control"
                placeholder="Testing"
                value={testTaskTitle}
                onChange={(e) => setTestTaskTitle(e.target.value)}
              />
              <div className="form-text">
                Title template for testing tasks. Default is `Testing`.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AzureSettings;
