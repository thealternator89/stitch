import React from 'react';
import ModelDropdown from '../../../components/ModelDropdown';
import { CopilotAuth, CopilotModel } from '../../../../types';

interface CopilotSettingsProps {
  copilotToken: string;
  setCopilotToken: (val: string) => void;
  models: CopilotModel[];
  selectedModel: string;
  setSelectedModel: (val: string) => void;
  loadingModels: boolean;
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
  loadingModels,
  authStatus,
  checkingAuth,
  handleCheckAuth,
}) => {
  return (
    <div className="card shadow-sm border-0 bg-body-tertiary">
      <div className="card-body p-4">
        <h5 className="mb-4 border-bottom pb-2">
          <i className="fas fa-robot me-2 text-primary"></i>GitHub Copilot
          Configuration
        </h5>

        <p className="text-muted small mb-4">
          Configure integration with GitHub Copilot API to enable automated test
          case and story writing.
        </p>

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

        <div className="mb-4">
          <label className="form-label fw-semibold">Default Model</label>
          <ModelDropdown
            models={models}
            selectedModel={selectedModel}
            onSelect={setSelectedModel}
            loading={loadingModels}
            className="w-50"
            buttonVariant="outline-secondary"
          />
          <div className="form-text mt-1">
            Choose the language model used by Copilot for text generation tasks.
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
      </div>
    </div>
  );
};

export default CopilotSettings;
