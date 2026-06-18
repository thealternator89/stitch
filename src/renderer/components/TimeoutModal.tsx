import React, { useState } from 'react';

interface TimeoutModalProps {
  technicalDetails: string;
  onClose: () => void;
}

const TimeoutModal: React.FC<TimeoutModalProps> = ({
  technicalDetails,
  onClose,
}) => {
  const [showDetails, setShowDetails] = useState(false);

  return (
    <div className="env-error-overlay">
      <div className="env-error-modal">
        <div className="timeout-error-icon">
          <i className="fas fa-hourglass-end"></i>
        </div>
        <h4 className="env-error-title">Request Timed Out</h4>
        <p className="env-error-message text-center">
          The GitHub Copilot service is taking too long to respond. This can
          happen due to high server load, a temporary network interruption, or a
          slow connection.
        </p>
        <div className="w-100 d-flex flex-column align-items-center mb-3">
          <button
            type="button"
            className="timeout-details-toggle"
            onClick={() => setShowDetails(!showDetails)}
          >
            <i
              className={`fas fa-chevron-${showDetails ? 'down' : 'right'}`}
            ></i>
            {showDetails ? 'Hide Technical Details' : 'Show Technical Details'}
          </button>
          {showDetails && (
            <div className="env-error-details timeout-details-content w-100 text-start mb-0">
              <pre
                className="mb-0 text-break font-monospace small"
                style={{ whiteSpace: 'pre-wrap' }}
              >
                {technicalDetails}
              </pre>
            </div>
          )}
        </div>
        <div className="env-error-actions">
          <button className="btn btn-indigo btn-lg" onClick={onClose}>
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
};

export default TimeoutModal;
