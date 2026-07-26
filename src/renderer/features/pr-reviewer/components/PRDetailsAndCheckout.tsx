import React, { useMemo } from 'react';
import { PRMetadata, CopilotModel, ReviewPhase } from '../../../../types';

export interface LocalReviewPhase extends ReviewPhase {
  enabled: boolean;
}

interface PRDetailsAndCheckoutProps {
  selectedPR: PRMetadata;
  repoPath: string;
  repoPathModified: boolean;
  isLoadingCheckout: boolean;
  loadingStatus: string;
  onBrowseFolder: () => void;
  onCheckoutAndDiff: () => void;
  phases: LocalReviewPhase[];
  isLoadingPhases: boolean;
  models: CopilotModel[];
  loadingModels: boolean;
  toggleGroup: (groupName: string, checked: boolean) => void;
  togglePhase: (originalIndex: number, checked: boolean) => void;
  isCriticEnabled: boolean;
  setIsCriticEnabled: (enabled: boolean) => void;
  commitSha: string;
  setIsHeaderCollapsed: (collapsed: boolean) => void;
}

const PRDetailsAndCheckout: React.FC<PRDetailsAndCheckoutProps> = ({
  selectedPR,
  repoPath,
  repoPathModified,
  isLoadingCheckout,
  loadingStatus,
  onBrowseFolder,
  onCheckoutAndDiff,
  phases,
  isLoadingPhases,
  models,
  loadingModels,
  toggleGroup,
  togglePhase,
  isCriticEnabled,
  setIsCriticEnabled,
  commitSha,
  setIsHeaderCollapsed,
}) => {
  const checkIsModelMissing = (phase: ReviewPhase) => {
    if (!phase.model) return false;
    return (
      !loadingModels &&
      !models.some((m) => m.id.toLowerCase() === phase.model!.toLowerCase())
    );
  };

  const groupedPhases = useMemo(() => {
    const groups: {
      name: string;
      phases: { phase: LocalReviewPhase; originalIndex: number }[];
    }[] = [];
    phases.forEach((phase, index) => {
      const groupName = phase.group || 'Ungrouped';
      let g = groups.find((group) => group.name === groupName);
      if (!g) {
        g = { name: groupName, phases: [] };
        groups.push(g);
      }
      g.phases.push({ phase, originalIndex: index });
    });
    return groups;
  }, [phases]);

  return (
    <div className="col-md-7">
      <div className="card shadow-sm border-0">
        <div className="card-body p-4">
          <h5 className="card-title fw-bold mb-3 text-primary">
            PR Details & Checkout
          </h5>

          <div className="p-3 bg-body-tertiary rounded mb-4">
            <div className="d-flex align-items-center justify-content-between mb-2">
              <span className="badge bg-primary">
                Repo: {selectedPR.repositoryName}
              </span>
              <span className="badge bg-secondary-subtle text-secondary-emphasis">
                PR #{selectedPR.id}
              </span>
            </div>
            <h4 className="fw-bold text-body mb-2">{selectedPR.title}</h4>
            <div className="row g-2 text-muted small">
              <div className="col-6">
                <strong>Author:</strong> {selectedPR.author}
              </div>
              <div className="col-6">
                <strong>Branches:</strong> {selectedPR.sourceBranch} &rarr;{' '}
                {selectedPR.targetBranch}
              </div>
            </div>
          </div>

          {/* Local Repository Path Picker */}
          <div className="mb-4">
            <label className="form-label fw-semibold text-muted">
              Locally Cloned Repo Path for "{selectedPR.repositoryName}"
            </label>
            <div className="input-group">
              <input
                type="text"
                className="form-control text-muted"
                placeholder="Select the local clone directory..."
                value={repoPath}
                readOnly
              />
              <button
                className="btn btn-outline-secondary"
                type="button"
                onClick={onBrowseFolder}
                disabled={isLoadingCheckout}
              >
                <i className="fas fa-folder-open me-1"></i>
                Browse
              </button>
            </div>
            {repoPathModified && (
              <div className="text-warning small mt-1">
                <i className="fas fa-exclamation-triangle me-1"></i>
                Updated to repository root
              </div>
            )}
            <div className="form-text small">
              {repoPath
                ? 'Local clone matches mapping history.'
                : `Please select the directory where repository "${selectedPR.repositoryName}" is cloned.`}
            </div>
          </div>

          {/* Review Phases Checklist */}
          <div className="mb-4">
            <label className="form-label fw-semibold text-muted d-block">
              Active Review Phases
            </label>
            {isLoadingPhases ? (
              <div className="text-muted small">
                <span className="spinner-border spinner-border-sm me-2"></span>
                Loading phases...
              </div>
            ) : phases.length === 0 ? (
              <div className="text-muted small border rounded p-3 bg-body-tertiary">
                No custom review phases found in{' '}
                <code>~/.stitch/pr-reviewer/phases</code>. Standard single-phase
                review will be used.
              </div>
            ) : (
              <div
                className="border rounded p-3 bg-body-tertiary"
                style={{ maxHeight: '250px', overflowY: 'auto' }}
              >
                {groupedPhases.map((group) => {
                  const selectablePhases = group.phases.filter(
                    (p) => !checkIsModelMissing(p.phase),
                  );
                  const allChecked =
                    selectablePhases.length > 0 &&
                    selectablePhases.every((p) => p.phase.enabled);
                  const someChecked =
                    selectablePhases.some((p) => p.phase.enabled) &&
                    !allChecked;

                  return (
                    <div key={group.name} className="mb-3">
                      <div className="form-check mb-1">
                        <input
                          className="form-check-input"
                          type="checkbox"
                          id={`group-check-${group.name}`}
                          checked={allChecked}
                          disabled={selectablePhases.length === 0}
                          ref={(el) => {
                            if (el) {
                              el.indeterminate = someChecked;
                            }
                          }}
                          onChange={(e) =>
                            toggleGroup(group.name, e.target.checked)
                          }
                        />
                        <label
                          className="form-check-label small fw-bold text-body"
                          htmlFor={`group-check-${group.name}`}
                        >
                          {group.name}
                        </label>
                      </div>
                      <div className="ms-4 border-start ps-3 py-1">
                        {group.phases.map(({ phase, originalIndex }) => {
                          const modelMissing = checkIsModelMissing(phase);
                          const phaseModel = phase.model;
                          const matchedModel = phaseModel
                            ? models.find(
                                (m) =>
                                  m.id.toLowerCase() ===
                                  phaseModel.toLowerCase(),
                              )
                            : null;

                          return (
                            <div key={phase.id} className="form-check mb-1">
                              <input
                                className="form-check-input"
                                type="checkbox"
                                id={`phase-check-${phase.id}`}
                                checked={!modelMissing && phase.enabled}
                                disabled={modelMissing}
                                onChange={(e) =>
                                  togglePhase(originalIndex, e.target.checked)
                                }
                              />
                              <label
                                className={`form-check-label small text-body-secondary ${
                                  modelMissing ? 'text-muted opacity-50' : ''
                                }`}
                                htmlFor={`phase-check-${phase.id}`}
                              >
                                {phase.title}
                                {phase.templateError && (
                                  <span
                                    className="text-danger ms-2"
                                    title={phase.templateError}
                                    style={{ cursor: 'help' }}
                                  >
                                    <i className="fas fa-exclamation-circle"></i>
                                  </span>
                                )}
                                {phaseModel && matchedModel && (
                                  <span className="badge bg-secondary-subtle text-secondary-emphasis ms-2 font-monospace small">
                                    {matchedModel.name}
                                  </span>
                                )}
                                {phaseModel && modelMissing && (
                                  <span
                                    className="badge bg-danger-subtle text-danger border border-danger-subtle ms-2 font-monospace small"
                                    title="Model not available"
                                    style={{ cursor: 'help' }}
                                  >
                                    <i className="fas fa-times me-1"></i>
                                    {phaseModel}
                                  </span>
                                )}
                              </label>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}

                {/* Fixed Critic Phase Toggle */}
                <div
                  className={phases.length > 0 ? 'border-top pt-3 mt-3' : ''}
                >
                  <div className="form-check d-flex align-items-start gap-2">
                    <input
                      className="form-check-input mt-1"
                      type="checkbox"
                      id="critic-phase-toggle"
                      checked={isCriticEnabled}
                      onChange={(e) => {
                        setIsCriticEnabled(e.target.checked);
                        localStorage.setItem(
                          'pr_reviewer_critic_enabled',
                          String(e.target.checked),
                        );
                      }}
                    />
                    <div>
                      <label
                        className="form-check-label small fw-bold text-body"
                        htmlFor="critic-phase-toggle"
                      >
                        Critic
                      </label>
                      <div
                        className="text-muted small"
                        style={{ fontSize: '0.75rem' }}
                      >
                        Critiques and refines the generated comments once all
                        review phases are complete.
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="text-end">
            {commitSha && (
              <button
                className="btn btn-outline-secondary px-3 me-2 fw-semibold"
                onClick={() => setIsHeaderCollapsed(true)}
                type="button"
              >
                <i className="fas fa-compress me-1"></i>
                Collapse Settings
              </button>
            )}
            <button
              className="btn btn-primary px-4 shadow-sm fw-semibold"
              onClick={onCheckoutAndDiff}
              disabled={isLoadingCheckout || !repoPath}
            >
              {isLoadingCheckout ? (
                <>
                  <span className="spinner-border spinner-border-sm me-2"></span>
                  Checking Out...
                </>
              ) : (
                <>
                  <i className="fas fa-cloud-arrow-down me-2"></i>
                  Fetch & Checkout PR
                </>
              )}
            </button>
          </div>

          {isLoadingCheckout && loadingStatus && (
            <div className="mt-3 text-muted small d-flex align-items-center">
              <i className="fas fa-circle-notch fa-spin me-2 text-primary"></i>
              {loadingStatus}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PRDetailsAndCheckout;
