import React from 'react';
import ModelDropdown from '../../../components/ModelDropdown';
import { CopilotModel, Persona } from '../../../../types';
import { PhaseProgress } from './PRReviewProgress';

interface PRReviewSettingsProps {
  phaseProgress: PhaseProgress[];
  isReviewing: boolean;
  setPhaseProgress: (progress: PhaseProgress[]) => void;
  getGeneralStatusText: () => string;
  models: CopilotModel[];
  selectedModel: string;
  setSelectedModel: (model: string) => void;
  loadingModels: boolean;
  cpuCount: number;
  maxParallelism: number;
  setMaxParallelism: (val: number) => void;
  personas: Persona[];
  selectedPersona: string;
  handlePersonaChange: (value: string) => void;
  customInstructions: string;
  setCustomInstructions: (val: string) => void;
  handleStartReview: () => void;
  commitSha: string;
  hasSelectedPhases: boolean;
}

const PRReviewSettings: React.FC<PRReviewSettingsProps> = ({
  phaseProgress,
  isReviewing,
  setPhaseProgress,
  getGeneralStatusText,
  models,
  selectedModel,
  setSelectedModel,
  loadingModels,
  cpuCount,
  maxParallelism,
  setMaxParallelism,
  personas,
  selectedPersona,
  handlePersonaChange,
  customInstructions,
  setCustomInstructions,
  handleStartReview,
  commitSha,
  hasSelectedPhases,
}) => {
  return (
    <div className="col-md-4">
      <div className="card shadow-sm border-0 h-100">
        <div
          className="card-body p-4 d-flex flex-column"
          style={{ minHeight: '300px' }}
        >
          <h5 className="card-title fw-bold mb-3">
            <i className="fas fa-robot me-2 text-primary"></i>
            {isReviewing || phaseProgress.length > 0
              ? 'Review Progress'
              : 'Review Settings'}
          </h5>

          {isReviewing || phaseProgress.length > 0 ? (
            /* Phase Progress Checklist */
            <div className="flex-grow-1 d-flex flex-column">
              <div
                className="list-group list-group-flush border rounded overflow-hidden flex-grow-1 overflow-y-auto mb-3"
                style={{ maxHeight: '300px' }}
              >
                {phaseProgress.map((p) => {
                  const isCriticPending =
                    p.id === 'critic-phase' && p.status === 'pending';
                  const statusTextVal = isCriticPending
                    ? 'Will run once the review phases have completed'
                    : p.statusText;
                  const showStatusText =
                    p.status === 'in-progress' ||
                    (isCriticPending && statusTextVal);

                  return (
                    <div
                      key={p.id}
                      className="list-group-item p-3"
                      style={{
                        backgroundColor:
                          p.status === 'in-progress'
                            ? 'rgba(13, 110, 253, 0.1)'
                            : 'transparent',
                        opacity: isCriticPending ? 0.75 : 1,
                        borderStyle: isCriticPending ? 'dashed' : 'solid',
                        borderColor: isCriticPending
                          ? 'var(--bs-border-color)'
                          : undefined,
                      }}
                    >
                      <div className="d-flex align-items-center justify-content-between">
                        <div
                          className="d-flex align-items-center gap-2 text-truncate"
                          style={{ maxWidth: '75%' }}
                        >
                          {p.status === 'pending' &&
                            (isCriticPending ? (
                              <i className="far fa-clock text-muted"></i>
                            ) : (
                              <i className="far fa-circle text-muted"></i>
                            ))}
                          {p.status === 'in-progress' && (
                            <i className="fas fa-circle-notch fa-spin text-primary"></i>
                          )}
                          {p.status === 'completed' && (
                            <i className="fas fa-check-circle text-success"></i>
                          )}
                          {p.status === 'skipped' && (
                            <i
                              className="fas fa-forward text-warning"
                              title={p.reason || 'Skipped'}
                            ></i>
                          )}
                          <span
                            className={`small text-truncate ${
                              p.status === 'completed'
                                ? 'text-decoration-line-through text-muted'
                                : p.status === 'skipped'
                                  ? 'text-muted'
                                  : isCriticPending
                                    ? 'text-muted fst-italic'
                                    : 'fw-semibold text-body'
                            }`}
                            title={p.title}
                          >
                            {p.title}
                          </span>
                        </div>
                        {p.status === 'skipped' && (
                          <span className="badge bg-warning-subtle text-warning-emphasis font-monospace tiny-badge">
                            Skipped
                          </span>
                        )}
                        {p.status === 'in-progress' && (
                          <span className="badge bg-primary-subtle text-primary-emphasis font-monospace tiny-badge">
                            Running
                          </span>
                        )}
                        {p.status === 'completed' && (
                          <span className="badge bg-success-subtle text-success-emphasis font-monospace tiny-badge">
                            Done
                          </span>
                        )}
                        {isCriticPending && (
                          <span className="badge bg-light text-secondary border font-monospace tiny-badge">
                            Queued
                          </span>
                        )}
                      </div>
                      {showStatusText && statusTextVal && (
                        <div
                          className="ps-4 mt-1 text-muted small text-truncate"
                          title={statusTextVal}
                          style={{
                            fontStyle: isCriticPending ? 'italic' : 'normal',
                          }}
                        >
                          {statusTextVal}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {isReviewing && (
                <div className="mt-auto text-center text-muted small py-2 bg-body-secondary rounded">
                  <span className="spinner-border spinner-border-sm me-2 text-primary"></span>
                  {getGeneralStatusText()}
                </div>
              )}

              {!isReviewing && (
                <div className="d-flex flex-column gap-2 mt-auto">
                  <button
                    className="btn btn-outline-primary btn-sm w-100 fw-semibold"
                    onClick={() => {
                      setPhaseProgress([]);
                    }}
                  >
                    <i className="fas fa-arrow-left me-2"></i>
                    Back to Settings
                  </button>
                </div>
              )}
            </div>
          ) : (
            /* Original Review Settings Inputs */
            <>
              {/* Model Selection */}
              <div className="mb-3">
                <label className="form-label text-muted small fw-semibold">
                  Copilot Model
                </label>
                <ModelDropdown
                  models={models}
                  selectedModel={selectedModel}
                  onSelect={setSelectedModel}
                  loading={loadingModels}
                />
              </div>

              {/* Max Parallelism */}
              <div className="mb-3">
                <label className="form-label text-muted small fw-semibold d-block mb-1">
                  Review Agent Parallelism
                </label>
                {cpuCount < 4 ? (
                  <div className="text-muted small">
                    Parallelism fixed at 1 (fewer than 4 CPU cores).
                  </div>
                ) : (
                  <div>
                    <div className="d-flex align-items-center gap-2">
                      <input
                        type="range"
                        className="form-range"
                        min="1"
                        max={cpuCount - 2}
                        value={maxParallelism}
                        onChange={(e) =>
                          setMaxParallelism(parseInt(e.target.value))
                        }
                        disabled={isReviewing}
                        style={{ flexGrow: 1 }}
                      />
                      <span className="badge bg-secondary font-monospace">
                        {maxParallelism}x
                      </span>
                    </div>
                    <span
                      className="text-muted tiny"
                      style={{ fontSize: '0.75rem' }}
                    >
                      Range: 1 to {cpuCount - 2} workers (CPUs: {cpuCount})
                    </span>
                  </div>
                )}
              </div>

              {/* Persona Selector */}
              <div className="mb-3">
                <label className="form-label text-muted small fw-semibold">
                  Review Persona (Optional)
                </label>
                <select
                  className="form-select form-select-sm"
                  value={selectedPersona}
                  onChange={(e) => handlePersonaChange(e.target.value)}
                  disabled={isReviewing}
                >
                  <option value="None">None (Default)</option>
                  {personas.map((p) => (
                    <option key={p.name} value={p.name}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Custom Review Instructions */}
              <div className="mb-4 flex-grow-1 d-flex flex-column">
                <label className="form-label text-muted small fw-semibold">
                  Specific Instructions (Optional)
                </label>
                <textarea
                  className="form-control flex-grow-1"
                  rows={3}
                  style={{ minHeight: '80px', resize: 'none' }}
                  placeholder="E.g., Focus on security, look out for proper error handling, verify database queries, etc."
                  value={customInstructions}
                  onChange={(e) => setCustomInstructions(e.target.value)}
                  disabled={isReviewing}
                />
              </div>

              {/* Action Button */}
              <button
                className="btn btn-primary w-100 py-2 fw-semibold shadow-sm mb-2"
                onClick={handleStartReview}
                disabled={isReviewing || !commitSha || !hasSelectedPhases}
              >
                <i className="fas fa-play me-2"></i>
                Start Code Review
              </button>
              {!hasSelectedPhases && (
                <div className="text-warning small text-center mt-1">
                  <i className="fas fa-exclamation-triangle me-1"></i>
                  Select at least one phase in PR settings to start review.
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default PRReviewSettings;
