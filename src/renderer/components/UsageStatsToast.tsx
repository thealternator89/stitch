import React from 'react';
import { CopilotUsage } from '../../types';

interface UsageStatsToastProps {
  stats: CopilotUsage;
  onClose: () => void;
}

const UsageStatsToast: React.FC<UsageStatsToastProps> = ({
  stats,
  onClose,
}) => {
  const { inputTokens, outputTokens, cacheReadTokens } = stats;

  const cachePercentage =
    inputTokens > 0 ? Math.round((cacheReadTokens / inputTokens) * 100) : 0;

  return (
    <div className="usage-toast" role="alert" aria-live="polite">
      <div className="usage-toast-header">
        <div className="usage-toast-icon">
          <i className="fas fa-chart-bar"></i>
        </div>
        <h6 className="usage-toast-title">Usage Stats</h6>
        <button
          type="button"
          className="usage-toast-btn-x"
          onClick={onClose}
          aria-label="Close"
        >
          <i className="fas fa-times"></i>
        </button>
      </div>
      <div className="usage-toast-body">
        <ul className="usage-toast-list">
          <li>
            <span>Input tokens:</span>
            <strong>{inputTokens.toLocaleString()}</strong>
          </li>
          <li>
            <span>Output tokens:</span>
            <strong>{outputTokens.toLocaleString()}</strong>
          </li>
          <li>
            <span>Cached tokens:</span>
            <strong>{cacheReadTokens.toLocaleString()}</strong>
          </li>
        </ul>
        {inputTokens > 0 && (
          <p className="usage-toast-cache-msg">
            {cachePercentage}% of input tokens served from the cache
          </p>
        )}
      </div>
    </div>
  );
};

export default UsageStatsToast;
