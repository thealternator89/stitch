import React from 'react';
import { PhaseUsage } from '../../types';

interface UsageDetailsModalProps {
  phases: PhaseUsage[];
  onClose: () => void;
}

const UsageDetailsModal: React.FC<UsageDetailsModalProps> = ({
  phases,
  onClose,
}) => {
  return (
    <div
      className="env-error-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="usage-details-title"
    >
      <div className="near-full-modal usage-details-modal text-start p-4">
        <div className="d-flex justify-content-between align-items-center w-100 mb-3 pb-2 border-bottom">
          <div className="d-flex align-items-center gap-2">
            <i className="fas fa-chart-pie text-primary fs-4"></i>
            <h5 id="usage-details-title" className="mb-0 fw-bold">
              Phase Usage Breakdown
            </h5>
          </div>
          <button
            type="button"
            className="btn-close"
            onClick={onClose}
            aria-label="Close modal"
          ></button>
        </div>

        <div className="w-100 overflow-x-auto mb-4">
          <table className="table table-sm table-hover align-middle usage-details-table mb-0">
            <thead>
              <tr>
                <th>Phase Name</th>
                <th>Model Name</th>
                <th className="text-end">Input Tokens</th>
                <th className="text-end">Output Tokens</th>
                <th className="text-end">Cached Tokens</th>
                <th className="text-end">% Cached</th>
                <th className="text-end">Multiplier</th>
              </tr>
            </thead>
            <tbody>
              {phases.map((phase, index) => {
                const cachePercentage =
                  phase.inputTokens > 0
                    ? Math.round(
                        (phase.cacheReadTokens / phase.inputTokens) * 100,
                      )
                    : 0;

                return (
                  <tr key={`${phase.phaseTitle}-${index}`}>
                    <td className="fw-semibold">{phase.phaseTitle}</td>
                    <td>
                      <span className="badge bg-secondary-subtle text-secondary border">
                        {phase.model}
                      </span>
                    </td>
                    <td className="text-end font-monospace">
                      {phase.inputTokens.toLocaleString()}
                    </td>
                    <td className="text-end font-monospace">
                      {phase.outputTokens.toLocaleString()}
                    </td>
                    <td className="text-end font-monospace">
                      {phase.cacheReadTokens.toLocaleString()}
                    </td>
                    <td className="text-end font-monospace">
                      {cachePercentage}%
                    </td>
                    <td className="text-end font-monospace text-muted">
                      {`×${phase.multiplier ?? 1}`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="d-flex justify-content-end w-100">
          <button className="btn btn-indigo px-4" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default UsageDetailsModal;
