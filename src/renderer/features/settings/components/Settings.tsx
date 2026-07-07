import React, { useState, useEffect } from 'react';
import { useCopilotModels } from '../../../hooks/useCopilotModels';
import PageLayout from '../../../components/PageLayout';
import { CopilotAuth } from '../../../../types';

import GeneralSettings from './GeneralSettings';
import AzureSettings from './AzureSettings';
import ConfluenceSettings from './ConfluenceSettings';
import CopilotSettings from './CopilotSettings';
import PromptSettings from './PromptSettings';

const Settings: React.FC = () => {
  const [azureOrg, setAzureOrg] = useState('');
  const [azureProject, setAzureProject] = useState('');
  const [azurePat, setAzurePat] = useState('');
  const [copilotToken, setCopilotToken] = useState('');
  const [confluenceUrl, setConfluenceUrl] = useState('');
  const [confluenceUser, setConfluenceUser] = useState('');
  const [confluenceToken, setConfluenceToken] = useState('');
  const [theme, setTheme] = useState<'auto' | 'light' | 'dark'>('auto');
  const [gitWorktreeEnabled, setGitWorktreeEnabled] = useState(false);
  const [gitWorktreeBaseDir, setGitWorktreeBaseDir] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [authStatus, setAuthStatus] = useState<CopilotAuth | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(false);
  const { models, selectedModel, setSelectedModel, loadingModels } =
    useCopilotModels();

  const [activeTab, setActiveTab] = useState<
    'general' | 'azure' | 'confluence' | 'copilot' | 'prompts'
  >('general');

  // Story Writer Custom Prompts
  const [storyGeneral, setStoryGeneral] = useState('');
  const [storyTitle, setStoryTitle] = useState('');
  const [storyDescription, setStoryDescription] = useState('');
  const [storyAcceptanceCriteria, setStoryAcceptanceCriteria] = useState('');
  const [storyNotes, setStoryNotes] = useState('');

  // Test Case Writer Custom Prompts
  const [testCaseGeneral, setTestCaseGeneral] = useState('');
  const [testCaseId, setTestCaseId] = useState('');
  const [testCaseDescription, setTestCaseDescription] = useState('');
  const [testCasePreConditions, setTestCasePreConditions] = useState('');
  const [testCaseSteps, setTestCaseSteps] = useState('');
  const [testCaseExpectedResult, setTestCaseExpectedResult] = useState('');

  // Story Elaborator Custom Prompts
  const [storyElaboratorGeneral, setStoryElaboratorGeneral] = useState('');

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
          setGitWorktreeEnabled(settings.gitWorktreeEnabled || false);
          setGitWorktreeBaseDir(settings.gitWorktreeBaseDir || '');

          // Load custom prompts
          const prompts = settings.prompts || {};
          const story = prompts.storyWriter || {};
          const tc = prompts.testCaseWriter || {};
          const elaborator = prompts.storyElaborator || {};

          setStoryGeneral(story.general || '');
          setStoryTitle(story.title || '');
          setStoryDescription(story.description || '');
          setStoryAcceptanceCriteria(story.acceptanceCriteria || '');
          setStoryNotes(story.notes || '');

          setTestCaseGeneral(tc.general || '');
          setTestCaseId(tc.id || '');
          setTestCaseDescription(tc.description || '');
          setTestCasePreConditions(tc.preConditions || '');
          setTestCaseSteps(tc.steps || '');
          setTestCaseExpectedResult(tc.expectedResult || '');

          setStoryElaboratorGeneral(elaborator.general || '');
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
        gitWorktreeEnabled: gitWorktreeEnabled,
        gitWorktreeBaseDir: gitWorktreeBaseDir,
        prompts: {
          storyWriter: {
            general: storyGeneral,
            title: storyTitle,
            description: storyDescription,
            acceptanceCriteria: storyAcceptanceCriteria,
            notes: storyNotes,
          },
          testCaseWriter: {
            general: testCaseGeneral,
            id: testCaseId,
            description: testCaseDescription,
            preConditions: testCasePreConditions,
            steps: testCaseSteps,
            expectedResult: testCaseExpectedResult,
          },
          storyElaborator: {
            general: storyElaboratorGeneral,
          },
        },
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
        return (
          <GeneralSettings
            theme={theme}
            setTheme={setTheme}
            gitWorktreeEnabled={gitWorktreeEnabled}
            setGitWorktreeEnabled={setGitWorktreeEnabled}
            gitWorktreeBaseDir={gitWorktreeBaseDir}
            setGitWorktreeBaseDir={setGitWorktreeBaseDir}
          />
        );
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
        return (
          <PromptSettings
            storyGeneral={storyGeneral}
            setStoryGeneral={setStoryGeneral}
            storyTitle={storyTitle}
            setStoryTitle={setStoryTitle}
            storyDescription={storyDescription}
            setStoryDescription={setStoryDescription}
            storyAcceptanceCriteria={storyAcceptanceCriteria}
            setStoryAcceptanceCriteria={setStoryAcceptanceCriteria}
            storyNotes={storyNotes}
            setStoryNotes={setStoryNotes}
            testCaseGeneral={testCaseGeneral}
            setTestCaseGeneral={setTestCaseGeneral}
            testCaseId={testCaseId}
            setTestCaseId={setTestCaseId}
            testCaseDescription={testCaseDescription}
            setTestCaseDescription={setTestCaseDescription}
            testCasePreConditions={testCasePreConditions}
            setTestCasePreConditions={setTestCasePreConditions}
            testCaseSteps={testCaseSteps}
            setTestCaseSteps={setTestCaseSteps}
            testCaseExpectedResult={testCaseExpectedResult}
            setTestCaseExpectedResult={setTestCaseExpectedResult}
            storyElaboratorGeneral={storyElaboratorGeneral}
            setStoryElaboratorGeneral={setStoryElaboratorGeneral}
          />
        );
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
