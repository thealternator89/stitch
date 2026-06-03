import React, { useState } from 'react';

interface PromptSettingsProps {
  storyGeneral: string;
  setStoryGeneral: (val: string) => void;
  storyTitle: string;
  setStoryTitle: (val: string) => void;
  storyDescription: string;
  setStoryDescription: (val: string) => void;
  storyAcceptanceCriteria: string;
  setStoryAcceptanceCriteria: (val: string) => void;
  storyNotes: string;
  setStoryNotes: (val: string) => void;

  testCaseGeneral: string;
  setTestCaseGeneral: (val: string) => void;
  testCaseId: string;
  setTestCaseId: (val: string) => void;
  testCaseDescription: string;
  setTestCaseDescription: (val: string) => void;
  testCasePreConditions: string;
  setTestCasePreConditions: (val: string) => void;
  testCaseSteps: string;
  setTestCaseSteps: (val: string) => void;
  testCaseExpectedResult: string;
  setTestCaseExpectedResult: (val: string) => void;
}

const PromptSettings: React.FC<PromptSettingsProps> = ({
  storyGeneral,
  setStoryGeneral,
  storyTitle,
  setStoryTitle,
  storyDescription,
  setStoryDescription,
  storyAcceptanceCriteria,
  setStoryAcceptanceCriteria,
  storyNotes,
  setStoryNotes,

  testCaseGeneral,
  setTestCaseGeneral,
  testCaseId,
  setTestCaseId,
  testCaseDescription,
  setTestCaseDescription,
  testCasePreConditions,
  setTestCasePreConditions,
  testCaseSteps,
  setTestCaseSteps,
  testCaseExpectedResult,
  setTestCaseExpectedResult,
}) => {
  const [subTab, setSubTab] = useState<'story' | 'testcase'>('story');

  const handleResetStoryDefaults = () => {
    setStoryGeneral('');
    setStoryTitle('');
    setStoryDescription('');
    setStoryAcceptanceCriteria('');
    setStoryNotes('');
  };

  const handleResetTestCaseDefaults = () => {
    setTestCaseGeneral('');
    setTestCaseId('');
    setTestCaseDescription('');
    setTestCasePreConditions('');
    setTestCaseSteps('');
    setTestCaseExpectedResult('');
  };

  return (
    <div className="card shadow-sm border-0 bg-body-tertiary">
      <div className="card-header bg-transparent border-0 pt-4 px-4 pb-0">
        <div className="d-flex justify-content-between align-items-center mb-3">
          <h5 className="mb-0 fw-semibold">
            <i className="fas fa-wand-magic-sparkles me-2 text-primary"></i>
            Prompt Customization
          </h5>
          {subTab === 'story' ? (
            <button
              type="button"
              className="btn btn-outline-secondary btn-sm"
              onClick={handleResetStoryDefaults}
            >
              <i className="fas fa-undo me-2"></i>Reset Story Defaults
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-outline-secondary btn-sm"
              onClick={handleResetTestCaseDefaults}
            >
              <i className="fas fa-undo me-2"></i>Reset Test Case Defaults
            </button>
          )}
        </div>

        <ul className="nav nav-tabs border-bottom">
          <li className="nav-item">
            <button
              type="button"
              className={`nav-link px-4 py-2 border-0 ${subTab === 'story' ? 'active border-bottom border-primary fw-semibold text-primary' : 'text-muted bg-transparent'}`}
              onClick={() => setSubTab('story')}
            >
              <i className="fas fa-file-signature me-2"></i>Story Writer
            </button>
          </li>
          <li className="nav-item">
            <button
              type="button"
              className={`nav-link px-4 py-2 border-0 ${subTab === 'testcase' ? 'active border-bottom border-primary fw-semibold text-primary' : 'text-muted bg-transparent'}`}
              onClick={() => setSubTab('testcase')}
            >
              <i className="fas fa-vial me-2"></i>Test Case Writer
            </button>
          </li>
        </ul>
      </div>

      <div className="card-body p-4 pt-3">
        {subTab === 'story' && (
          <div key="story-writer-panel" className="settings-content p-0">
            <p className="text-muted small mb-4">
              Customize the guidelines and instructions used when generating
              user stories.
            </p>

            <div className="mb-4">
              <label className="form-label fw-semibold">
                General Instructions
              </label>
              <textarea
                className="form-control"
                rows={3}
                value={storyGeneral}
                onChange={(e) => setStoryGeneral(e.target.value)}
                placeholder="Optional general instructions inserted between the default header context and story details (e.g., 'Target a React & TypeScript architecture. Focus on clear boundary cases.')"
              />
              <div className="form-text">
                This prompt is inserted right after the main goal description to
                influence overall behavior.
              </div>
            </div>

            <h6 className="mb-3 border-bottom pb-2 fw-semibold text-primary mt-4">
              Field Customization
            </h6>

            <div className="mb-3">
              <label className="form-label fw-semibold">Title</label>
              <textarea
                className="form-control"
                rows={2}
                value={storyTitle}
                onChange={(e) => setStoryTitle(e.target.value)}
                placeholder="The title of the story"
              />
              <div className="form-text">
                Instruct how to generate the story title.
              </div>
            </div>

            <div className="mb-3">
              <label className="form-label fw-semibold">Description</label>
              <textarea
                className="form-control"
                rows={3}
                value={storyDescription}
                onChange={(e) => setStoryDescription(e.target.value)}
                placeholder='Description. This should contain a statement in the format "As a... I want to... So that..." followed by 2 blank lines and then a longer description of the changes required for story.'
              />
              <div className="form-text">
                Define format constraints or detail levels for descriptions.
              </div>
            </div>

            <div className="mb-3">
              <label className="form-label fw-semibold">
                Acceptance Criteria
              </label>
              <textarea
                className="form-control"
                rows={3}
                value={storyAcceptanceCriteria}
                onChange={(e) => setStoryAcceptanceCriteria(e.target.value)}
                placeholder="Formatted as a markdown list."
              />
              <div className="form-text">
                Specify formatting rules for the acceptance criteria checklist.
              </div>
            </div>

            <div className="mb-3">
              <label className="form-label fw-semibold">Notes</label>
              <textarea
                className="form-control"
                rows={2}
                value={storyNotes}
                onChange={(e) => setStoryNotes(e.target.value)}
                placeholder="Any additional notes or assumptions (Optional, can be empty)"
              />
              <div className="form-text">
                Instruct what extra warnings, assumptions, or notes to include.
              </div>
            </div>
          </div>
        )}

        {subTab === 'testcase' && (
          <div key="testcase-writer-panel" className="settings-content p-0">
            <p className="text-muted small mb-4">
              Customize the guidelines and instructions used when generating
              test cases.
            </p>

            <div className="mb-4">
              <label className="form-label fw-semibold">
                General Instructions
              </label>
              <textarea
                className="form-control"
                rows={3}
                value={testCaseGeneral}
                onChange={(e) => setTestCaseGeneral(e.target.value)}
                placeholder="Optional general instructions inserted between the default header context and ticket details (e.g., 'Emphasize accessibility testing (ARIA attributes) and responsiveness.')"
              />
              <div className="form-text">
                This prompt is inserted right after the main goal description to
                influence overall behavior.
              </div>
            </div>

            <h6 className="mb-3 border-bottom pb-2 fw-semibold text-primary mt-4">
              Field Customization
            </h6>

            <div className="mb-3">
              <label className="form-label fw-semibold">Test Case ID</label>
              <textarea
                className="form-control"
                rows={2}
                value={testCaseId}
                onChange={(e) => setTestCaseId(e.target.value)}
                placeholder='Test Case ID (e.g., "TC01")'
              />
              <div className="form-text">
                Define ID naming conventions or serial formats.
              </div>
            </div>

            <div className="mb-3">
              <label className="form-label fw-semibold">Description</label>
              <textarea
                className="form-control"
                rows={2}
                value={testCaseDescription}
                onChange={(e) => setTestCaseDescription(e.target.value)}
                placeholder="Brief description of the test scenario"
              />
              <div className="form-text">
                Define scenario structure requirements.
              </div>
            </div>

            <div className="mb-3">
              <label className="form-label fw-semibold">Preconditions</label>
              <textarea
                className="form-control"
                rows={2}
                value={testCasePreConditions}
                onChange={(e) => setTestCasePreConditions(e.target.value)}
                placeholder="Any preconditions required before running the test"
              />
              <div className="form-text">
                Instruct how to detail environment states or prerequisites.
              </div>
            </div>

            <div className="mb-3">
              <label className="form-label fw-semibold">Steps</label>
              <textarea
                className="form-control"
                rows={3}
                value={testCaseSteps}
                onChange={(e) => setTestCaseSteps(e.target.value)}
                placeholder="Bullet-pointed or numbered steps to execute the test"
              />
              <div className="form-text">
                Customize the format of steps (e.g. Gherkin Given/When/Then,
                numbered list).
              </div>
            </div>

            <div className="mb-3">
              <label className="form-label fw-semibold">Expected Result</label>
              <textarea
                className="form-control"
                rows={2}
                value={testCaseExpectedResult}
                onChange={(e) => setTestCaseExpectedResult(e.target.value)}
                placeholder="The expected result"
              />
              <div className="form-text">
                Specify detail requirements for validation expectations.
              </div>
            </div>

            <div className="mb-3">
              <div className="d-flex align-items-center justify-content-between mb-2">
                <label className="form-label fw-semibold mb-0">Priority</label>
                <span className="badge bg-warning-subtle text-warning border border-warning-subtle small px-2 py-1">
                  <i className="fas fa-lock me-1"></i>System Required
                </span>
              </div>
              <textarea
                className="form-control bg-body-secondary text-muted"
                rows={2}
                readOnly
                value='Priority of the test (e.g., "High", "Medium", "Low")'
              />
              <div className="form-text">
                This field is fixed to match downstream categorization logic and
                cannot be customized.
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PromptSettings;
