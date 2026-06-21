import React from 'react';

interface GeneralSettingsProps {
  theme: 'auto' | 'light' | 'dark';
  setTheme: (theme: 'auto' | 'light' | 'dark') => void;
}

const GeneralSettings: React.FC<GeneralSettingsProps> = ({
  theme,
  setTheme,
}) => {
  return (
    <div className="card shadow-sm border-0 bg-body-tertiary">
      <div className="card-body p-4">
        <h5 className="mb-4 border-bottom pb-2">
          <i className="fas fa-palette me-2 text-primary"></i>Appearance
          Settings
        </h5>

        <div className="mb-4">
          <label className="form-label d-block fw-semibold text-muted small uppercase tracking-wider mb-3">
            Interface Theme
          </label>
          <p className="text-muted small mb-3">
            Choose how Stitch appears. Selecting "Auto" will sync with your
            macOS system theme settings.
          </p>
          <div className="btn-group" role="group" aria-label="Theme selection">
            <button
              type="button"
              className={`btn px-4 py-2 d-flex align-items-center gap-2 ${theme === 'auto' ? 'btn-primary' : 'btn-outline-secondary'}`}
              onClick={() => setTheme('auto')}
            >
              <i className="fas fa-circle-half-stroke"></i>
              Auto
            </button>
            <button
              type="button"
              className={`btn px-4 py-2 d-flex align-items-center gap-2 ${theme === 'light' ? 'btn-primary' : 'btn-outline-secondary'}`}
              onClick={() => setTheme('light')}
            >
              <i className="fas fa-sun"></i>
              Light
            </button>
            <button
              type="button"
              className={`btn px-4 py-2 d-flex align-items-center gap-2 ${theme === 'dark' ? 'btn-primary' : 'btn-outline-secondary'}`}
              onClick={() => setTheme('dark')}
            >
              <i className="fas fa-moon"></i>
              Dark
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GeneralSettings;
