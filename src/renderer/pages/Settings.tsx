import React, { useState, useEffect } from 'react';
import { useCopilotModels } from '../hooks/useCopilotModels';
import ModelDropdown from '../components/ModelDropdown';
import PageLayout from '../components/PageLayout';
import { CopilotAuth } from '../../types';

const Settings: React.FC = () => {
  const [azureOrg, setAzureOrg] = useState('');
  const [azureProject, setAzureProject] = useState('');
  const [azurePat, setAzurePat] = useState('');
  const [copilotToken, setCopilotToken] = useState('');
  const [confluenceUrl, setConfluenceUrl] = useState('');
  const [confluenceUser, setConfluenceUser] = useState('');
  const [confluenceToken, setConfluenceToken] = useState('');
  const [theme, setTheme] = useState<'auto' | 'light' | 'dark'>('auto');
  const [statusMessage, setStatusMessage] = useState('');
  const [authStatus, setAuthStatus] = useState<CopilotAuth | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(false);
  const { models, selectedModel, setSelectedModel, loadingModels } =
    useCopilotModels();

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const settings = await window.electronAPI.getSettings();
        if (settings) {
          setAzureOrg(settings.azureOrg || '');
          setAzureProject(settings.azureProject || '');
          setAzurePat(settings.azurePat || '');
          setCopilotToken(settings.copilotToken || '');
          setConfluenceUrl(settings.confluenceUrl || '');
          setConfluenceUser(settings.confluenceUser || '');
          setConfluenceToken(settings.confluenceToken || '');
          setTheme(settings.theme || 'auto');
        }
      } catch (error) {
        console.error('Failed to load settings:', error);
      }
    };
    loadSettings();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await window.electronAPI.saveSettings({
        azureOrg: azureOrg,
        azureProject: azureProject,
        azurePat: azurePat,
        copilotToken: copilotToken,
        copilotModel: selectedModel,
        confluenceUrl: confluenceUrl,
        confluenceUser: confluenceUser,
        confluenceToken: confluenceToken,
        theme: theme,
      });
      setStatusMessage('Settings saved successfully!');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      setTimeout(() => setStatusMessage(''), 3000);
    } catch (error) {
      setStatusMessage('Error saving settings.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      console.error(error);
    }
  };

  const handleCheckAuth = async () => {
    try {
      setCheckingAuth(true);
      setAuthStatus(null);
      const res = await window.electronAPI.checkCopilotAuth();
      setAuthStatus(res);
    } catch (error) {
      setAuthStatus({ error: error.message || 'Unknown error' });
    } finally {
      setCheckingAuth(false);
    }
  };

  const actions = (
    <button type="submit" form="settings-form" className="btn btn-primary">
      <i className="fas fa-save me-2"></i>
      Save
    </button>
  );

  return (
    <PageLayout title="Settings" actions={actions} maxWidth="848px">
      {statusMessage && (
        <div
          className={`alert ${statusMessage.includes('Error') ? 'alert-danger' : 'alert-success'} mb-4`}
        >
          {statusMessage}
        </div>
      )}

      <form id="settings-form" onSubmit={handleSave}>
        <div className="card shadow-sm mb-4">
          <div className="card-body p-4">
            <h5 className="mb-3 border-bottom pb-2">Appearance</h5>
            <div className="mb-4">
              <label className="form-label d-block">Theme</label>
              <div
                className="btn-group"
                role="group"
                aria-label="Theme selection"
              >
                <button
                  type="button"
                  className={`btn ${theme === 'auto' ? 'btn-secondary' : 'btn-outline-secondary'}`}
                  onClick={() => setTheme('auto')}
                >
                  <i className="fas fa-circle-half-stroke me-2"></i>
                  Auto
                </button>
                <button
                  type="button"
                  className={`btn ${theme === 'light' ? 'btn-secondary' : 'btn-outline-secondary'}`}
                  onClick={() => setTheme('light')}
                >
                  <i className="fas fa-sun me-2"></i>
                  Light
                </button>
                <button
                  type="button"
                  className={`btn ${theme === 'dark' ? 'btn-secondary' : 'btn-outline-secondary'}`}
                  onClick={() => setTheme('dark')}
                >
                  <i className="fas fa-moon me-2"></i>
                  Dark
                </button>
              </div>
            </div>

            <h5 className="mb-3 border-bottom pb-2 mt-4">
              Azure DevOps Configuration
            </h5>
            <div className="mb-3">
              <label className="form-label">Organization URL</label>
              <input
                type="text"
                className="form-control"
                placeholder="https://dev.azure.com/your-org"
                value={azureOrg}
                onChange={(e) => setAzureOrg(e.target.value)}
              />
            </div>
            <div className="mb-3">
              <label className="form-label">Project Name</label>
              <input
                type="text"
                className="form-control"
                placeholder="YourProject"
                value={azureProject}
                onChange={(e) => setAzureProject(e.target.value)}
              />
            </div>
            <div className="mb-4">
              <label className="form-label">Personal Access Token (PAT)</label>
              <input
                type="password"
                className="form-control"
                value={azurePat}
                onChange={(e) => setAzurePat(e.target.value)}
              />
            </div>

            <h5 className="mb-3 border-bottom pb-2 mt-4">
              Confluence Configuration
            </h5>
            <div className="mb-3">
              <label className="form-label">Confluence URL</label>
              <input
                type="text"
                className="form-control"
                placeholder="https://your-domain.atlassian.net/wiki"
                value={confluenceUrl}
                onChange={(e) => setConfluenceUrl(e.target.value)}
              />
            </div>
            <div className="mb-3">
              <label className="form-label">Email / User (Optional)</label>
              <input
                type="text"
                className="form-control"
                placeholder="user@example.com"
                value={confluenceUser}
                onChange={(e) => setConfluenceUser(e.target.value)}
              />
              <div className="form-text">
                Leave blank if using a Personal Access Token (Bearer Auth).
                Enter email if using an Atlassian API Token (Basic Auth).
              </div>
            </div>
            <div className="mb-4">
              <label className="form-label">API Token</label>
              <input
                type="password"
                className="form-control"
                value={confluenceToken}
                onChange={(e) => setConfluenceToken(e.target.value)}
              />
              <div className="form-text">
                Your API token or Personal Access Token (PAT).
              </div>
            </div>

            <h5 className="mb-3 border-bottom pb-2 mt-4">
              GitHub Copilot Configuration
            </h5>
            <div className="mb-3">
              <label className="form-label">Copilot API Token</label>
              <input
                type="password"
                className="form-control"
                value={copilotToken}
                onChange={(e) => setCopilotToken(e.target.value)}
              />
              <div className="form-text">
                Your Copilot session or API token for authentication.
              </div>
            </div>
            <div className="mb-4">
              <label className="form-label">Default Model</label>
              <ModelDropdown
                models={models}
                selectedModel={selectedModel}
                onSelect={setSelectedModel}
                loading={loadingModels}
                className="w-25"
                buttonVariant="outline-secondary"
              />
            </div>

            <div className="mb-4 p-3 rounded border">
              <div className="d-flex justify-content-between align-items-center mb-2">
                <h6 className="mb-0">Copilot CLI Status</h6>
                <button
                  type="button"
                  className="btn btn-outline-info btn-sm"
                  onClick={handleCheckAuth}
                  disabled={checkingAuth}
                >
                  {checkingAuth ? (
                    <>
                      <span
                        className="spinner-border spinner-border-sm me-2"
                        role="status"
                        aria-hidden="true"
                      ></span>
                      Checking...
                    </>
                  ) : (
                    <>
                      <i className="fas fa-sync-alt me-2"></i>Check Status
                    </>
                  )}
                </button>
              </div>

              {authStatus && (
                <div
                  className={`alert mt-2 mb-0 ${authStatus.error || !authStatus.authStatus?.isAuthenticated ? 'alert-danger' : 'alert-success'}`}
                >
                  {authStatus.error ? (
                    <div>
                      <strong>Error:</strong> {authStatus.error}
                    </div>
                  ) : (
                    <>
                      <div>
                        <strong>Authenticated:</strong>{' '}
                        {authStatus.authStatus?.isAuthenticated ? 'Yes' : 'No'}
                      </div>
                      {authStatus.authStatus?.isAuthenticated && (
                        <>
                          <div>
                            <strong>User:</strong>{' '}
                            {authStatus.authStatus?.login}
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
                            <div className="mt-2 text-muted small">
                              CLI Version: {authStatus.status.version} v
                              {authStatus.status.protocolVersion}
                            </div>
                          )}
                        </>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </form>
    </PageLayout>
  );
};

export default Settings;
