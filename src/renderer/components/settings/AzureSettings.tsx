import React from 'react';

interface AzureSettingsProps {
  azureOrg: string;
  setAzureOrg: (val: string) => void;
  azureProject: string;
  setAzureProject: (val: string) => void;
  azurePat: string;
  setAzurePat: (val: string) => void;
}

const AzureSettings: React.FC<AzureSettingsProps> = ({
  azureOrg,
  setAzureOrg,
  azureProject,
  setAzureProject,
  azurePat,
  setAzurePat,
}) => {
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
      </div>
    </div>
  );
};

export default AzureSettings;
