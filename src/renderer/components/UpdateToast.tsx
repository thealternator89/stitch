import React from 'react';

interface UpdateToastProps {
  version: string;
  onClose: () => void;
  onChangelog: () => void;
}

const UpdateToast: React.FC<UpdateToastProps> = ({
  version,
  onClose,
  onChangelog,
}) => {
  const isCalVer = /^\d{4}\.\d{1,2}\.\d{1,2}$/.test(version);

  return (
    <div className="update-toast" role="alert" aria-live="assertive">
      <div className="update-toast-header">
        <div className="update-toast-icon">
          <i className="fas fa-rocket"></i>
        </div>
        <h6 className="update-toast-title">Stitch Updated!</h6>
      </div>
      <p className="update-toast-body">
        The app has successfully updated to version <strong>v{version}</strong>.{' '}
        {isCalVer
          ? 'Check out the latest changes and improvements in the release notes.'
          : "You're running an unreleased build. Check out the git history for changes."}
      </p>
      <div className="update-toast-actions">
        <button
          type="button"
          className="update-toast-btn-close"
          onClick={onClose}
        >
          Close
        </button>
        {isCalVer && (
          <button
            type="button"
            className="update-toast-btn-changelog"
            onClick={onChangelog}
          >
            Changelog
          </button>
        )}
      </div>
    </div>
  );
};

export default UpdateToast;
