import React from 'react';
import { CopilotAuth, CopilotModel } from '../../../../types';

interface CopilotSettingsProps {
  copilotToken: string;
  setCopilotToken: (val: string) => void;
  models: CopilotModel[];
  selectedModel: string;
  setSelectedModel: (val: string) => void;
  authStatus: CopilotAuth | null;
  checkingAuth: boolean;
  handleCheckAuth: () => void;
}

const CopilotSettings: React.FC<CopilotSettingsProps> = ({
  copilotToken,
  setCopilotToken,
  models,
  selectedModel,
  setSelectedModel,
  authStatus,
  checkingAuth,
  handleCheckAuth,
}) => {
  const [copiedModelId, setCopiedModelId] = React.useState<string | null>(null);

  const handleCopy = (id: string) => {
    navigator.clipboard.writeText(id);
    setCopiedModelId(id);
    setTimeout(() => {
      setCopiedModelId(null);
    }, 1500);
  };

  return (
    <div className="card shadow-sm border-0 bg-body-tertiary">
      <div className="card-body p-4">
        <h5 className="mb-4 border-bottom pb-2">
          <i className="fas fa-robot me-2 text-primary"></i>GitHub Copilot
          Configuration
        </h5>

        <div className="mb-3">
          <label className="form-label fw-semibold">Copilot API Token</label>
          <input
            type="password"
            className="form-control"
            value={copilotToken}
            onChange={(e) => setCopilotToken(e.target.value)}
            placeholder="••••••••••••••••••••••••••••••••••••••••••••"
          />
          <div className="form-text">
            Your Copilot session or API token for authentication.
          </div>
        </div>

        <div className="mb-2 p-3 rounded border bg-body">
          <div className="d-flex justify-content-between align-items-center mb-2">
            <div>
              <h6 className="mb-0 fw-semibold">Copilot CLI Status</h6>
              <div className="text-muted small">
                Verify local Copilot agent connectivity status.
              </div>
            </div>
            <button
              type="button"
              className="btn btn-outline-info btn-sm d-flex align-items-center gap-2"
              onClick={handleCheckAuth}
              disabled={checkingAuth}
            >
              {checkingAuth ? (
                <>
                  <span
                    className="spinner-border spinner-border-sm"
                    role="status"
                    aria-hidden="true"
                  ></span>
                  Checking...
                </>
              ) : (
                <>
                  <i className="fas fa-sync-alt"></i>Check Status
                </>
              )}
            </button>
          </div>

          {authStatus && (
            <div
              className={`alert mt-3 mb-0 border-0 ${authStatus.error || !authStatus.authStatus?.isAuthenticated ? 'alert-danger bg-danger-subtle' : 'alert-success bg-success-subtle'}`}
            >
              {authStatus.error ? (
                <div>
                  <strong>Error:</strong> {authStatus.error}
                </div>
              ) : (
                <div className="small">
                  <div>
                    <strong>Authenticated:</strong>{' '}
                    {authStatus.authStatus?.isAuthenticated ? 'Yes' : 'No'}
                  </div>
                  {authStatus.authStatus?.isAuthenticated && (
                    <>
                      <div>
                        <strong>User:</strong> {authStatus.authStatus?.login}
                      </div>
                      <div>
                        <strong>Auth Type:</strong>{' '}
                        {authStatus.authStatus?.authType}
                      </div>
                      <div>
                        <strong>Message:</strong>{' '}
                        {authStatus.authStatus?.statusMessage}
                      </div>
                      {authStatus.status && (
                        <div className="mt-2 text-muted small border-top pt-2">
                          CLI Version: {authStatus.status.version} (Protocol v
                          {authStatus.status.protocolVersion})
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {models.length > 0 && (
          <div className="mt-4 border-top pt-4">
            <h6 className="mb-3 fw-semibold">
              <i className="fas fa-list me-2 text-primary"></i>Available Models
            </h6>
            <div className="table-responsive border rounded bg-body">
              <table className="table table-hover align-middle mb-0 small">
                <thead className="table-light">
                  <tr>
                    <th>Model Name</th>
                    <th>Key</th>
                    <th style={{ width: '130px' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {models.map((model) => (
                    <tr key={model.id}>
                      <td className="fw-semibold text-body">{model.name}</td>
                      <td>
                        <div className="d-flex align-items-center gap-2">
                          <code className="text-muted font-monospace">
                            {model.id}
                          </code>
                          <button
                            type="button"
                            className="btn btn-link btn-sm p-0 text-secondary d-flex align-items-center"
                            onClick={() => handleCopy(model.id)}
                            title={
                              copiedModelId === model.id
                                ? 'Copied!'
                                : 'Copy model key'
                            }
                            style={{ textDecoration: 'none' }}
                          >
                            {copiedModelId === model.id ? (
                              <i className="fas fa-check text-success"></i>
                            ) : (
                              <i className="fas fa-copy"></i>
                            )}
                          </button>
                        </div>
                      </td>
                      <td>
                        {selectedModel === model.id ? (
                          <span className="badge bg-success-subtle text-success border border-success-subtle py-1.5 px-2 fw-semibold">
                            <i className="fas fa-check-circle me-1"></i>Default
                          </span>
                        ) : (
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-primary py-1 px-2 d-flex align-items-center gap-1"
                            onClick={() => setSelectedModel(model.id)}
                          >
                            <i className="fas fa-star"></i>
                            <span>Set Default</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="form-text mt-2">
              Use these keys in your phase markdown files under the{' '}
              <code>model</code> frontmatter property to override the model for
              specific review phases.
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CopilotSettings;
