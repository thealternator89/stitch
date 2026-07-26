import React from 'react';

export interface PhaseProgress {
  id: string;
  title: string;
  status: 'pending' | 'in-progress' | 'completed' | 'skipped';
  reason?: string;
  statusText?: string;
  group?: string;
}

interface PRReviewProgressProps {
  phaseProgress: PhaseProgress[];
}

const PRReviewProgress: React.FC<PRReviewProgressProps> = ({
  phaseProgress,
}) => {
  const activeProgress = phaseProgress.filter((p) => p.status !== 'skipped');
  const skippedProgress = phaseProgress.filter((p) => p.status === 'skipped');

  const total = activeProgress.length;
  const completed = activeProgress.filter(
    (p) => p.status === 'completed',
  ).length;
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <div className="card shadow-sm border-0 mb-4 bg-body">
      <div className="card-body p-4">
        <div className="d-flex align-items-center justify-content-between mb-4 pb-3 border-bottom flex-wrap gap-2">
          <div>
            <h4 className="fw-bold mb-1 d-flex align-items-center gap-2">
              <i className="fas fa-microchip text-primary"></i>
              PR Review Progress
            </h4>
            <p className="text-muted small mb-0">
              Running automated review phases and Critic refinement.
            </p>
          </div>
          <div className="text-end">
            <span className="badge bg-primary-subtle text-primary border border-primary-subtle px-3 py-2 fs-6 rounded-pill">
              {percent}% Complete
            </span>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="progress mb-4" style={{ height: '10px' }}>
          <div
            className="progress-bar progress-bar-striped progress-bar-animated bg-primary"
            role="progressbar"
            style={{ width: `${percent}%` }}
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
          />
        </div>

        {/* Active Cards Grid */}
        <div className="row row-cols-1 row-cols-md-2 row-cols-lg-3 g-3">
          {activeProgress.map((p) => {
            let cardBg = 'bg-body';
            let borderClass = 'border';
            let icon = <i className="far fa-circle text-muted fs-5"></i>;
            let statusTextClass = 'text-muted';
            let badgeColor = 'bg-secondary-subtle text-secondary-emphasis';
            let displayStatus = 'Pending';
            let statusMsg = p.statusText || '';
            let inlineStyle: React.CSSProperties = {};

            if (p.status === 'in-progress') {
              cardBg = 'bg-primary-subtle bg-opacity-10';
              borderClass = 'border-primary shadow-sm';
              icon = (
                <i className="fas fa-circle-notch fa-spin text-primary fs-5"></i>
              );
              statusTextClass = 'text-primary-emphasis fw-semibold';
              badgeColor =
                'bg-primary-subtle text-primary-emphasis border border-primary-subtle';
              displayStatus = 'Active';
              if (!statusMsg) statusMsg = 'Analyzing diffs...';
            } else if (p.status === 'completed') {
              cardBg = 'bg-success-subtle bg-opacity-5';
              borderClass = 'border-success-subtle';
              icon = <i className="fas fa-check-circle text-success fs-5"></i>;
              statusTextClass = 'text-success-emphasis';
              badgeColor =
                'bg-success-subtle text-success-emphasis border border-success-subtle';
              displayStatus = 'Complete';
              statusMsg = 'Phase complete';
            } else if (p.id === 'critic-phase' && p.status === 'pending') {
              cardBg = 'bg-body-tertiary opacity-75';
              borderClass = 'border-secondary-subtle';
              inlineStyle = { borderStyle: 'dashed' };
              icon = <i className="far fa-clock text-muted fs-5"></i>;
              statusTextClass = 'text-muted fst-italic';
              badgeColor = 'bg-light text-secondary border border-light-subtle';
              displayStatus = 'Queued';
              statusMsg = 'Will run once the review phases have completed';
            }

            return (
              <div key={p.id} className="col">
                <div
                  className={`card h-100 ${cardBg} ${borderClass} rounded-3`}
                  style={inlineStyle}
                >
                  <div className="card-body p-3 d-flex flex-column justify-content-between">
                    <div>
                      <div className="d-flex align-items-center justify-content-between mb-2 flex-wrap gap-2">
                        <div className="d-flex align-items-center gap-2">
                          <span className="small font-monospace text-muted">
                            Phase
                          </span>
                          {(p.group ||
                            (p.id !== 'critic-phase' && 'Ungrouped')) && (
                            <span className="badge bg-secondary-subtle text-secondary-emphasis border border-secondary-subtle font-monospace rounded-pill tiny-badge">
                              {p.group || 'Ungrouped'}
                            </span>
                          )}
                        </div>
                        <span
                          className={`badge ${badgeColor} font-monospace rounded-pill tiny-badge`}
                        >
                          {displayStatus}
                        </span>
                      </div>
                      <h6
                        className="card-title fw-bold text-truncate mb-2"
                        title={p.title}
                      >
                        {p.title}
                      </h6>
                    </div>

                    <div className="mt-2 border-top pt-2">
                      <div className="d-flex align-items-start gap-2">
                        <div className="mt-1 flex-shrink-0">{icon}</div>
                        <p
                          className={`small mb-0 flex-grow-1 ${statusTextClass}`}
                          style={{ minHeight: '40px', fontSize: '0.8rem' }}
                        >
                          {statusMsg}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Skipped Cards (Rendered smaller below the active cards grid) */}
        {skippedProgress.length > 0 && (
          <div className="mt-4 pt-3 border-top">
            <h6 className="fw-bold text-muted small mb-3 d-flex align-items-center gap-2">
              <i className="fas fa-forward text-warning"></i>
              Skipped Phases ({skippedProgress.length})
            </h6>
            <div className="row row-cols-2 row-cols-md-4 row-cols-lg-6 g-2">
              {skippedProgress.map((p) => (
                <div key={p.id} className="col">
                  <div className="card h-100 bg-body-tertiary border-light-subtle rounded-3 shadow-none">
                    <div
                      className="card-body p-2 d-flex flex-column justify-content-between"
                      style={{ minHeight: '75px' }}
                    >
                      <div>
                        <div className="d-flex align-items-center justify-content-between mb-1 flex-wrap gap-1">
                          <div className="d-flex align-items-center gap-1">
                            <span
                              className="font-monospace text-muted"
                              style={{ fontSize: '0.65rem' }}
                            >
                              Phase
                            </span>
                            {(p.group ||
                              (p.id !== 'critic-phase' && 'Ungrouped')) && (
                              <span
                                className="badge bg-secondary-subtle text-secondary-emphasis border border-secondary-subtle font-monospace rounded-pill"
                                style={{
                                  fontSize: '0.6rem',
                                  padding: '0.1rem 0.3rem',
                                }}
                              >
                                {p.group || 'Ungrouped'}
                              </span>
                            )}
                          </div>
                          <span
                            className="badge bg-warning-subtle text-warning border border-warning-subtle font-monospace rounded-pill"
                            style={{
                              fontSize: '0.6rem',
                              padding: '0.1rem 0.3rem',
                            }}
                          >
                            Skipped
                          </span>
                        </div>
                        <h6
                          className="fw-bold text-truncate mb-1 text-body-secondary"
                          style={{ fontSize: '0.75rem' }}
                          title={p.title}
                        >
                          {p.title}
                        </h6>
                      </div>
                      <p
                        className="text-muted text-truncate mb-0"
                        style={{ fontSize: '0.65rem' }}
                        title={
                          p.reason ||
                          'Skipped (no matching files or conditions).'
                        }
                      >
                        {p.reason || 'Skipped'}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PRReviewProgress;
