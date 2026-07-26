import React from 'react';
import { PRMetadata } from '../../../../types';

interface PRReviewHeaderProps {
  selectedPR: PRMetadata;
  setIsHeaderCollapsed: (collapsed: boolean) => void;
}

const PRReviewHeader: React.FC<PRReviewHeaderProps> = ({
  selectedPR,
  setIsHeaderCollapsed,
}) => {
  return (
    <div className="col-12">
      <div className="card shadow-sm border-0 bg-body-tertiary">
        <div className="card-body p-3 d-flex flex-wrap align-items-center justify-content-between gap-3">
          <div className="d-flex align-items-center gap-3">
            <div
              className="d-flex align-items-center justify-content-center bg-primary text-white rounded-circle"
              style={{ width: '40px', height: '40px', flexShrink: 0 }}
            >
              <i className="fas fa-code-pull-request"></i>
            </div>
            <div>
              <div className="d-flex align-items-center flex-wrap gap-2">
                <span className="fw-bold text-primary font-monospace small">
                  PR #{selectedPR.id}
                </span>
                <span className="badge bg-secondary-subtle text-secondary-emphasis font-monospace small">
                  {selectedPR.repositoryName}
                </span>
                <span className="text-muted small">
                  | By {selectedPR.author}
                </span>
              </div>
              <h5 className="fw-bold mb-0 text-body mt-1">
                {selectedPR.title}
              </h5>
            </div>
          </div>

          <div className="d-flex align-items-center flex-wrap gap-3">
            <div className="text-muted small">
              <strong>Branches:</strong>{' '}
              <span className="font-monospace bg-body-secondary text-body px-2 py-1 rounded border">
                {selectedPR.sourceBranch}
              </span>{' '}
              &rarr;{' '}
              <span className="font-monospace bg-body-secondary text-body px-2 py-1 rounded border">
                {selectedPR.targetBranch}
              </span>
            </div>
            {selectedPR.url && (
              <button
                className="btn btn-sm btn-outline-secondary fw-semibold shadow-sm"
                onClick={() => window.electronAPI.openExternal(selectedPR.url!)}
              >
                <i className="fas fa-external-link-alt me-1"></i>
                Open
              </button>
            )}
            <button
              className="btn btn-sm btn-outline-primary fw-semibold shadow-sm"
              onClick={() => setIsHeaderCollapsed(false)}
            >
              <i className="fas fa-expand me-1"></i>
              Expand Settings
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PRReviewHeader;
