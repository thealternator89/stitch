import React, { useState, useEffect } from 'react';
import { useCopilotModels } from '../hooks/useCopilotModels';
import PageLayout from '../components/PageLayout';
import { CopilotAuth } from '../../types';

import GeneralSettings from '../components/settings/GeneralSettings';
import AzureSettings from '../components/settings/AzureSettings';
import ConfluenceSettings from '../components/settings/ConfluenceSettings';
import CopilotSettings from '../components/settings/CopilotSettings';
import PromptSettings from '../components/settings/PromptSettings';

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

  const [activeTab, setActiveTab] = useState<
    'general' | 'azure' | 'confluence' | 'copilot' | 'prompts'
  >('general');

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

  const renderActiveTab = () => {
    switch (activeTab) {
      case 'general':
        return <GeneralSettings theme={theme} setTheme={setTheme} />;
      case 'azure':
        return (
          <AzureSettings
            azureOrg={azureOrg}
            setAzureOrg={setAzureOrg}
            azureProject={azureProject}
            setAzureProject={setAzureProject}
            azurePat={azurePat}
            setAzurePat={setAzurePat}
          />
        );
      case 'confluence':
        return (
          <ConfluenceSettings
            confluenceUrl={confluenceUrl}
            setConfluenceUrl={setConfluenceUrl}
            confluenceUser={confluenceUser}
            setConfluenceUser={setConfluenceUser}
            confluenceToken={confluenceToken}
            setConfluenceToken={setConfluenceToken}
          />
        );
      case 'copilot':
        return (
          <CopilotSettings
            copilotToken={copilotToken}
            setCopilotToken={setCopilotToken}
            models={models}
            selectedModel={selectedModel}
            setSelectedModel={setSelectedModel}
            loadingModels={loadingModels}
            authStatus={authStatus}
            checkingAuth={checkingAuth}
            handleCheckAuth={handleCheckAuth}
          />
        );
      case 'prompts':
        return <PromptSettings />;
      default:
        return null;
    }
  };

  return (
    <PageLayout title="Settings" actions={actions} maxWidth="960px">
      {statusMessage && (
        <div
          className={`alert ${statusMessage.includes('Error') ? 'alert-danger' : 'alert-success'} mb-4`}
        >
          {statusMessage}
        </div>
      )}

      <form id="settings-form" onSubmit={handleSave}>
        <div className="settings-container">
          <div className="settings-sidebar">
            <button
              type="button"
              className={`settings-nav-item ${activeTab === 'general' ? 'active' : ''}`}
              onClick={() => setActiveTab('general')}
            >
              <i className="fas fa-palette"></i>
              General
            </button>
            <button
              type="button"
              className={`settings-nav-item ${activeTab === 'azure' ? 'active' : ''}`}
              onClick={() => setActiveTab('azure')}
            >
              <i className="fab fa-microsoft"></i>
              Azure DevOps
            </button>
            <button
              type="button"
              className={`settings-nav-item ${activeTab === 'confluence' ? 'active' : ''}`}
              onClick={() => setActiveTab('confluence')}
            >
              <i className="fas fa-book"></i>
              Confluence
            </button>
            <button
              type="button"
              className={`settings-nav-item ${activeTab === 'copilot' ? 'active' : ''}`}
              onClick={() => setActiveTab('copilot')}
            >
              <i className="fas fa-robot"></i>
              GitHub Copilot
            </button>
            <button
              type="button"
              className={`settings-nav-item ${activeTab === 'prompts' ? 'active' : ''}`}
              onClick={() => setActiveTab('prompts')}
            >
              <i className="fas fa-wand-magic-sparkles"></i>
              Prompts
            </button>
          </div>

          <div key={activeTab} className="settings-content">
            {renderActiveTab()}
          </div>
        </div>
      </form>
    </PageLayout>
  );
};

export default Settings;
