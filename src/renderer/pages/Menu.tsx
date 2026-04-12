import React from 'react';
import { Link } from 'react-router-dom';
import logo from '../../../assets/logo-full.png';

const Menu: React.FC = () => {
  return (
    <div className="container mt-4 position-relative">
      <div className="position-absolute top-0 end-0">
        <Link to="/settings" className="btn btn-outline-secondary">
          <i className="fas fa-cog me-2"></i>
          Settings
        </Link>
      </div>

      <div className="text-center mb-5 mt-2">
        <img
          src={logo}
          alt="Stitch Logo"
          className="img-fluid"
          style={{ maxHeight: '240px' }}
        />
      </div>

      <div className="row justify-content-center">
        <div className="col-md-4 mb-4">
          <div className="card shadow-sm h-100">
            <div className="card-body d-flex flex-column">
              <h5 className="card-title text-primary">
                <i className="fas fa-pen-to-square me-2"></i>
                Test Case Writer
              </h5>
              <p className="card-text text-muted">
                Create and manage test cases for your features.
              </p>
              <div className="mt-auto">
                <Link
                  to="/test-case-writer"
                  className="btn btn-outline-primary w-100"
                >
                  Open Tool
                </Link>
              </div>
            </div>
          </div>
        </div>
        <div className="col-md-4 mb-4">
          <div className="card shadow-sm h-100">
            <div className="card-body d-flex flex-column">
              <h5 className="card-title text-primary">
                <i className="fas fa-book-open me-2"></i>
                Story Writer
              </h5>
              <p className="card-text text-muted">
                Generate stories from Confluence requirements.
              </p>
              <div className="mt-auto">
                <Link
                  to="/story-writer"
                  className="btn btn-outline-primary w-100"
                >
                  Open Tool
                </Link>
              </div>
            </div>
          </div>
        </div>
        {/* Placeholder for future tools */}
        <div className="col-md-4 mb-4">
          <div className="card shadow-sm h-100 border-dashed">
            <div className="card-body d-flex flex-column justify-content-center align-items-center opacity-50">
              <i className="fas fa-plus-circle fa-2x mb-2"></i>
              <p className="card-text">More tools coming soon...</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Menu;
