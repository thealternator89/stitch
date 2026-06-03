import React from 'react';

interface ConfluenceSettingsProps {
  confluenceUrl: string;
  setConfluenceUrl: (val: string) => void;
  confluenceUser: string;
  setConfluenceUser: (val: string) => void;
  confluenceToken: string;
  setConfluenceToken: (val: string) => void;
}

const ConfluenceSettings: React.FC<ConfluenceSettingsProps> = ({
  confluenceUrl,
  setConfluenceUrl,
  confluenceUser,
  setConfluenceUser,
  confluenceToken,
  setConfluenceToken,
}) => {
  return (
    <div className="card shadow-sm border-0 bg-body-tertiary">
      <div className="card-body p-4">
        <h5 className="mb-4 border-bottom pb-2">
          <i className="fas fa-book me-2 text-primary"></i>Confluence
          Configuration
        </h5>

        <p className="text-muted small mb-4">
          Connect to Confluence to retrieve product requirements documents
          (PRDs), specifications, and other documentation pages to generate user
          stories.
        </p>

        <div className="mb-3">
          <label className="form-label fw-semibold">Confluence URL</label>
          <input
            type="text"
            className="form-control"
            placeholder="https://your-domain.atlassian.net/wiki"
            value={confluenceUrl}
            onChange={(e) => setConfluenceUrl(e.target.value)}
          />
          <div className="form-text">
            Base URL of your Atlassian Cloud or Server Confluence site.
          </div>
        </div>

        <div className="mb-3">
          <label className="form-label fw-semibold">
            Email / User (Optional)
          </label>
          <input
            type="text"
            className="form-control"
            placeholder="user@example.com"
            value={confluenceUser}
            onChange={(e) => setConfluenceUser(e.target.value)}
          />
          <div className="form-text">
            Leave blank if using a Personal Access Token (Bearer Auth). Enter
            email if using an Atlassian API Token (Basic Auth).
          </div>
        </div>

        <div className="mb-3">
          <label className="form-label fw-semibold">API Token / PAT</label>
          <input
            type="password"
            className="form-control"
            value={confluenceToken}
            onChange={(e) => setConfluenceToken(e.target.value)}
            placeholder="••••••••••••••••••••••••••••••••••••••••••••"
          />
          <div className="form-text">
            Your personal API token or Personal Access Token (PAT).
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConfluenceSettings;
