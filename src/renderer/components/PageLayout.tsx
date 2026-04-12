import React from 'react';
import { useNavigate } from 'react-router-dom';

interface PageLayoutProps {
  title: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
  maxWidth?: string;
}

const PageLayout: React.FC<PageLayoutProps> = ({
  title,
  children,
  actions,
  maxWidth = '1200px',
}) => {
  const navigate = useNavigate();

  return (
    <div className="container-fluid p-0">
      <div className="p-3 bg-body-tertiary border-bottom shadow-sm d-flex align-items-center sticky-top z-3">
        {/* Left: Back Button */}
        <div className="flex-grow-1" style={{ flexBasis: 0 }}>
          <button
            type="button"
            className="btn btn-outline-secondary"
            onClick={() => navigate('/')}
          >
            <i className="fas fa-arrow-left me-2"></i>
            Back
          </button>
        </div>

        {/* Center: Title */}
        <h6 className="mb-0 text-center px-3 fw-bold">{title}</h6>

        {/* Right: Actions */}
        <div
          className="d-flex align-items-center gap-2 justify-content-end flex-grow-1"
          style={{ flexBasis: 0 }}
        >
          {actions}
        </div>
      </div>

      <div className="container p-4" style={{ maxWidth }}>
        {children}
      </div>
    </div>
  );
};

export default PageLayout;
