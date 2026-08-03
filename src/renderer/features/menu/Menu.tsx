import React from 'react';
import { Link } from 'react-router-dom';
import logo from '../../../../assets/logo-full.png';
import logoDark from '../../../../assets/logo-full-dark.png';
import UpdateToast from '../../components/UpdateToast';
import { UpdateStatus } from '../../../types';

interface MenuProps {
  updateStatus: UpdateStatus | null;
  onCloseToast: () => void;
  onOpenChangelog: () => void;
}

const Menu: React.FC<MenuProps> = ({
  updateStatus,
  onCloseToast,
  onOpenChangelog,
}) => {
  return (
    <div className="container mt-2 p-3 menu-container">
      {/* Header section with left-aligned logo and right-aligned settings button */}
      <div className="d-flex justify-content-between align-items-center mb-4 mt-0 pb-3 border-bottom">
        <img
          src={logo}
          alt="Stitch Logo"
          className="img-fluid logo-light"
          style={{ maxHeight: '96px', objectFit: 'contain' }}
        />
        <img
          src={logoDark}
          alt="Stitch Logo"
          className="img-fluid logo-dark"
          style={{ maxHeight: '96px', objectFit: 'contain' }}
        />
        <div className="d-flex gap-2">
          <Link to="/history" className="btn btn-outline-secondary">
            <i className="fas fa-history me-2"></i>
            Usage History
          </Link>
          <Link to="/settings" className="btn btn-outline-secondary">
            <i className="fas fa-cog me-2"></i>
            Settings
          </Link>
        </div>
      </div>

      <div className="row g-4 menu-row">
        {/* Ideation Column */}
        <div className="col-sm-6 col-lg-3 mb-4">
          <div className="menu-column menu-column-ideation">
            <div className="menu-column-header">
              <i className="fas fa-lightbulb menu-column-icon"></i>
              <h3 className="menu-column-title">Ideation</h3>
            </div>
            <div className="d-flex flex-column gap-3">
              <div className="menu-tool-card">
                <h4 className="menu-tool-title">
                  <i className="fas fa-shirt me-2 text-secondary"></i>
                  T-Shirt Size Estimator
                </h4>
                <p className="menu-tool-desc">
                  Estimate the effort size and complexity of a proposed change.
                </p>
                <div className="mt-auto">
                  <Link
                    to="/tshirt-estimator"
                    className="btn btn-outline-indigo w-100 btn-sm"
                  >
                    Open
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Design Column */}
        <div className="col-sm-6 col-lg-3 mb-4">
          <div className="menu-column menu-column-design">
            <div className="menu-column-header">
              <i className="fas fa-pen-ruler menu-column-icon"></i>
              <h3 className="menu-column-title">Solution Design</h3>
            </div>
            <div className="d-flex flex-column gap-3">
              <div className="menu-tool-card">
                <h4 className="menu-tool-title">
                  <i className="fas fa-book-open me-2 text-secondary"></i>
                  Story Writer
                </h4>
                <p className="menu-tool-desc">
                  Generate stories from requirements.
                </p>
                <div className="mt-auto">
                  <Link
                    to="/story-writer"
                    className="btn btn-outline-indigo w-100 btn-sm"
                  >
                    Open
                  </Link>
                </div>
              </div>
              <div className="menu-tool-card">
                <h4 className="menu-tool-title">
                  <i className="fas fa-pen-to-square me-2 text-secondary"></i>
                  Test Case Writer
                </h4>
                <p className="menu-tool-desc">
                  Create test cases for your stories.
                </p>
                <div className="mt-auto">
                  <Link
                    to="/test-case-writer"
                    className="btn btn-outline-indigo w-100 btn-sm"
                  >
                    Open
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Build Column */}
        <div className="col-sm-6 col-lg-3 mb-4">
          <div className="menu-column menu-column-build">
            <div className="menu-column-header">
              <i className="fas fa-code menu-column-icon"></i>
              <h3 className="menu-column-title">Build</h3>
            </div>
            <div className="d-flex flex-column gap-3">
              <div className="menu-tool-card">
                <h4 className="menu-tool-title">
                  <i className="fas fa-brain me-2 text-secondary"></i>
                  Story Elaborator
                </h4>
                <p className="menu-tool-desc">
                  Reveal unclear story details and build an implementation plan.
                </p>
                <div className="mt-auto">
                  <Link
                    to="/story-elaborator"
                    className="btn btn-outline-indigo w-100 btn-sm"
                  >
                    Open
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Review Column */}
        <div className="col-sm-6 col-lg-3 mb-4">
          <div className="menu-column menu-column-review">
            <div className="menu-column-header">
              <i className="fas fa-clipboard-check menu-column-icon"></i>
              <h3 className="menu-column-title">Review</h3>
            </div>
            <div className="d-flex flex-column gap-3">
              <div className="menu-tool-card">
                <h4 className="menu-tool-title">
                  <i className="fas fa-code-pull-request me-2 text-secondary"></i>
                  PR Reviewer
                </h4>
                <p className="menu-tool-desc">
                  Review pull requests and branch differences locally.
                </p>
                <div className="mt-auto">
                  <Link
                    to="/pr-reviewer"
                    className="btn btn-outline-indigo w-100 btn-sm"
                  >
                    Open
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {updateStatus?.isUpdated && (
        <UpdateToast
          version={updateStatus.currentVersion}
          onClose={onCloseToast}
          onChangelog={onOpenChangelog}
        />
      )}
    </div>
  );
};

export default Menu;
