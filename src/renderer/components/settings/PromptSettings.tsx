import React from 'react';

const PromptSettings: React.FC = () => {
  return (
    <div className="card shadow-sm border-0 bg-body-tertiary">
      <div className="card-body p-4">
        <h5 className="mb-4 border-bottom pb-2">
          <i className="fas fa-wand-magic-sparkles me-2 text-primary"></i>Prompt
          Customization
        </h5>

        <p className="text-muted small mb-4">
          Customize the AI prompts, templates, and instruction guidelines used
          to generate your user stories and test cases.
        </p>

        <div className="alert alert-info border-0 bg-info-subtle d-flex align-items-start gap-3 mb-4">
          <i className="fas fa-info-circle mt-1 fs-5 text-info"></i>
          <div>
            <h6 className="alert-heading fw-semibold mb-1">
              Coming Soon (Next Step)
            </h6>
            <p className="mb-0 small text-muted">
              You will be able to customize system instructions and templates
              here to adapt generation outputs to your specific coding style,
              team rules, and formats.
            </p>
          </div>
        </div>

        <div className="mb-4 opacity-75">
          <label className="form-label fw-semibold text-muted">
            Story Writer System Instructions
          </label>
          <textarea
            className="form-control"
            rows={4}
            disabled
            defaultValue="You are an expert product manager. Generate comprehensive user stories and acceptance criteria based on the provided requirements documentation..."
          />
          <div className="form-text">
            Define the persona and global instructions for generating user
            stories.
          </div>
        </div>

        <div className="mb-4 opacity-75">
          <label className="form-label fw-semibold text-muted">
            Test Case Writer System Instructions
          </label>
          <textarea
            className="form-control"
            rows={4}
            disabled
            defaultValue="You are a senior QA engineer. Generate detailed step-by-step test cases, including edge cases and negative validation scenarios, based on the provided story description..."
          />
          <div className="form-text">
            Define the persona and global instructions for generating test
            cases.
          </div>
        </div>
      </div>
    </div>
  );
};

export default PromptSettings;
