import React, { useState, useEffect } from 'react';
import { useCopilotModels } from '../../../hooks/useCopilotModels';
import PageLayout from '../../../components/PageLayout';
import { CopilotAuth, Persona } from '../../../../types';

import GeneralSettings from './GeneralSettings';
import ConnectorsSettings from './ConnectorsSettings';
import CopilotSettings from './CopilotSettings';
import PromptSettings from './PromptSettings';
import PRReviewerSettings from './PRReviewerSettings';

const Settings: React.FC = () => {
  const [version, setVersion] = useState<number>(1);
  const [featureType, setFeatureType] = useState('Feature');
  const [storyType, setStoryType] = useState('Product Backlog Item');
  const [taskType, setTaskType] = useState('Task');
  const [testTaskTitle, setTestTaskTitle] = useState('Testing');
  const [azureOrg, setAzureOrg] = useState('');
  const [azureProject, setAzureProject] = useState('');
  const [azurePat, setAzurePat] = useState('');
  const [copilotToken, setCopilotToken] = useState('');
  const [confluenceUrl, setConfluenceUrl] = useState('');
  const [confluenceUser, setConfluenceUser] = useState('');
  const [confluenceToken, setConfluenceToken] = useState('');
  const [issuesSource, setIssuesSource] = useState('azureDevOps');
  const [codeSource, setCodeSource] = useState('azureDevOps');
  const [docsSource, setDocsSource] = useState('atlassian');
  const [theme, setTheme] = useState<'auto' | 'light' | 'dark'>('auto');
  const [gitWorktreeEnabled, setGitWorktreeEnabled] = useState(false);
  const [gitWorktreeBaseDir, setGitWorktreeBaseDir] = useState('');
  const [maxParallelism, setMaxParallelism] = useState<number>(2);
  const [cpuCount, setCpuCount] = useState<number>(4);
  const [statusMessage, setStatusMessage] = useState('');
  const [authStatus, setAuthStatus] = useState<CopilotAuth | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(false);
  const { models, selectedModel, setSelectedModel } = useCopilotModels();

  const [activeTab, setActiveTab] = useState<
    'general' | 'connectors' | 'copilot' | 'prompts' | 'pr-reviewer'
  >('general');

  const [personas, setPersonas] = useState<Persona[]>([]);

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
        const cpus = await window.electronAPI.getCpuCount();
        setCpuCount(cpus);

        const settings = await window.electronAPI.getSettings();
        if (settings) {
          setVersion(settings.version || 1);
          setFeatureType(settings.featureType || 'Feature');
          setStoryType(settings.storyType || 'Product Backlog Item');
          setTaskType(settings.taskType || 'Task');
          setTestTaskTitle(settings.testTaskTitle || 'Testing');
          const azureConn = settings.connectors?.azureDevOps;
          const atlassianConn = settings.connectors?.atlassian;
          setAzureOrg(azureConn?.org || '');
          setAzureProject(azureConn?.project || '');
          setAzurePat(azureConn?.pat || '');
          setCopilotToken(settings.copilotToken || '');
          setConfluenceUrl(atlassianConn?.url || '');
          setConfluenceUser(atlassianConn?.username || '');
          setConfluenceToken(atlassianConn?.token || '');
          setIssuesSource(settings.sources?.issues || 'azureDevOps');
          setCodeSource(settings.sources?.code || 'azureDevOps');
          setDocsSource(settings.sources?.docs || 'atlassian');
          setTheme(settings.theme || 'auto');
          setGitWorktreeEnabled(settings.gitWorktreeEnabled || false);
          setGitWorktreeBaseDir(settings.gitWorktreeBaseDir || '');

          if (settings.maxParallelism !== undefined) {
            setMaxParallelism(settings.maxParallelism);
          } else {
            if (cpus < 4) {
              setMaxParallelism(1);
            } else {
              setMaxParallelism(Math.max(1, Math.floor(cpus / 2)));
            }
          }

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

          const prReviewer = settings.prReviewer || {};
          setPersonas(prReviewer.personas || []);
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
      // Validate personas
      if (personas.length > 5) {
        setStatusMessage('Error: You can configure up to 5 personas.');
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
      const nameSet = new Set<string>();
      for (let i = 0; i < personas.length; i++) {
        const p = personas[i];
        const name = p.name.trim();
        const content = p.content.trim();
        if (!name) {
          setStatusMessage(`Error: Persona #${i + 1} has an empty name.`);
          window.scrollTo({ top: 0, behavior: 'smooth' });
          return;
        }
        if (name.toLowerCase() === 'none') {
          setStatusMessage(`Error: "None" is a reserved name for personas.`);
          window.scrollTo({ top: 0, behavior: 'smooth' });
          return;
        }
        if (name.length > 20) {
          setStatusMessage(
            `Error: Persona "${name}" name exceeds 20 characters.`,
          );
          window.scrollTo({ top: 0, behavior: 'smooth' });
          return;
        }
        if (nameSet.has(name.toLowerCase())) {
          setStatusMessage(
            `Error: Persona name "${name}" is a duplicate. Names must be unique.`,
          );
          window.scrollTo({ top: 0, behavior: 'smooth' });
          return;
        }
        nameSet.add(name.toLowerCase());
        if (!content) {
          setStatusMessage(`Error: Persona "${name}" has empty guidelines.`);
          window.scrollTo({ top: 0, behavior: 'smooth' });
          return;
        }
        if (content.length > 160) {
          setStatusMessage(
            `Error: Persona "${name}" guidelines exceed 160 characters.`,
          );
          window.scrollTo({ top: 0, behavior: 'smooth' });
          return;
        }
      }

      await window.electronAPI.saveSettings({
        version: version,
        featureType: featureType,
        storyType: storyType,
        taskType: taskType,
        testTaskTitle: testTaskTitle,
        copilotToken: copilotToken,
        copilotModel: selectedModel,
        theme: theme,
        gitWorktreeEnabled: gitWorktreeEnabled,
        gitWorktreeBaseDir: gitWorktreeBaseDir,
        maxParallelism: maxParallelism,
        connectors: {
          atlassian: {
            url: confluenceUrl,
            username: confluenceUser,
            token: confluenceToken,
          },
          azureDevOps: {
            org: azureOrg,
            project: azureProject,
            pat: azurePat,
          },
        },
        sources: {
          issues: issuesSource,
          code: codeSource,
          docs: docsSource,
        },
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
        prReviewer: {
          personas: personas,
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
      const errMsg = error instanceof Error ? error.message : String(error);
      setAuthStatus({ error: errMsg });
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
      case 'connectors':
        return (
          <ConnectorsSettings
            azureOrg={azureOrg}
            setAzureOrg={setAzureOrg}
            azureProject={azureProject}
            setAzureProject={setAzureProject}
            azurePat={azurePat}
            setAzurePat={setAzurePat}
            featureType={featureType}
            setFeatureType={setFeatureType}
            storyType={storyType}
            setStoryType={setStoryType}
            taskType={taskType}
            setTaskType={setTaskType}
            testTaskTitle={testTaskTitle}
            setTestTaskTitle={setTestTaskTitle}
            confluenceUrl={confluenceUrl}
            setConfluenceUrl={setConfluenceUrl}
            confluenceUser={confluenceUser}
            setConfluenceUser={setConfluenceUser}
            confluenceToken={confluenceToken}
            setConfluenceToken={setConfluenceToken}
            issuesSource={issuesSource}
            setIssuesSource={setIssuesSource}
            codeSource={codeSource}
            setCodeSource={setCodeSource}
            docsSource={docsSource}
            setDocsSource={setDocsSource}
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
      case 'pr-reviewer':
        return (
          <PRReviewerSettings
            personas={personas}
            setPersonas={setPersonas}
            maxParallelism={maxParallelism}
            setMaxParallelism={setMaxParallelism}
            cpuCount={cpuCount}
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
              <i className="fas fa-sliders"></i>
              General
            </button>
            <button
              type="button"
              className={`settings-nav-item ${activeTab === 'connectors' ? 'active' : ''}`}
              onClick={() => setActiveTab('connectors')}
            >
              <i className="fas fa-plug"></i>
              Connectors
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
            <button
              type="button"
              className={`settings-nav-item ${activeTab === 'pr-reviewer' ? 'active' : ''}`}
              onClick={() => setActiveTab('pr-reviewer')}
            >
              <i className="fas fa-code-pull-request"></i>
              PR Reviewer
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
