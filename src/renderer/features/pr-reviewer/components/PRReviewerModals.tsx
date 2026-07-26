import React from 'react';
import { ReviewComment } from '../../../../types';

interface EditCommentModalProps {
  editingCommentIndex: number;
  editedCommentText: string;
  setEditedCommentText: (text: string) => void;
  onCancel: () => void;
  onPostComment: (
    comment: ReviewComment,
    index: number,
    updatedText: string,
  ) => void;
  comments: ReviewComment[];
  isPostingComment: Record<number, boolean>;
}

export const EditCommentModal: React.FC<EditCommentModalProps> = ({
  editingCommentIndex,
  editedCommentText,
  setEditedCommentText,
  onCancel,
  onPostComment,
  comments,
  isPostingComment,
}) => {
  return (
    <div className="env-error-overlay">
      <div
        className="near-full-modal text-start"
        style={{
          textAlign: 'left',
          alignItems: 'stretch',
          padding: '30px',
        }}
      >
        <h4 className="fw-semibold mb-3">Edit Comment</h4>
        <div className="mb-4 flex-grow-1 d-flex flex-column">
          <label className="form-label text-muted small fw-semibold">
            Comment Content (Markdown Supported)
          </label>
          <textarea
            className="form-control flex-grow-1"
            rows={10}
            style={{
              minHeight: '200px',
              fontFamily: 'var(--bs-font-monospace)',
            }}
            placeholder="Write your comment here..."
            value={editedCommentText}
            onChange={(e) => setEditedCommentText(e.target.value)}
          />
        </div>
        <div className="d-flex justify-content-end gap-2 pt-2 border-top border-secondary-subtle">
          <button
            className="btn btn-sm btn-outline-secondary px-4"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            className="btn btn-sm btn-primary px-4"
            onClick={() =>
              onPostComment(
                comments[editingCommentIndex],
                editingCommentIndex,
                editedCommentText,
              )
            }
            disabled={isPostingComment[editingCommentIndex]}
          >
            {isPostingComment[editingCommentIndex] ? (
              <>
                <span className="spinner-border spinner-border-sm me-1"></span>
                Posting...
              </>
            ) : (
              <>
                <i className="fas fa-paper-plane me-1"></i>
                Post
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

interface DirtyRepoModalProps {
  onDismiss: () => void;
}

export const DirtyRepoModal: React.FC<DirtyRepoModalProps> = ({
  onDismiss,
}) => {
  return (
    <div className="env-error-overlay">
      <div className="env-error-modal">
        <div className="env-error-icon bg-warning text-white">
          <i className="fas fa-exclamation-triangle"></i>
        </div>
        <h4 className="env-error-title mt-3">Local Repository is Dirty</h4>
        <p className="env-error-message text-center text-muted px-3">
          The local git repository has uncommitted changes. To prevent loss of
          work or merge conflicts, you must commit, stash, or reset your local
          changes before continuing.
        </p>
        <div className="env-error-actions mt-4 w-100 d-flex justify-content-center">
          <button
            className="btn btn-indigo btn-lg px-5 shadow-sm"
            onClick={onDismiss}
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
};

interface GeneralErrorModalProps {
  errorTitle: string;
  errorMessage: string;
  onDismiss: () => void;
}

export const GeneralErrorModal: React.FC<GeneralErrorModalProps> = ({
  errorTitle,
  errorMessage,
  onDismiss,
}) => {
  return (
    <div className="env-error-overlay">
      <div className="env-error-modal">
        <div className="env-error-icon bg-danger text-white">
          <i className="fas fa-xmark"></i>
        </div>
        <h4 className="env-error-title mt-3">{errorTitle}</h4>
        <p className="env-error-message text-center text-muted px-3 text-break max-h-150 overflow-y-auto small">
          {errorMessage}
        </p>
        <div className="env-error-actions mt-4 w-100 d-flex justify-content-center">
          <button
            className="btn btn-indigo btn-lg px-5 shadow-sm"
            onClick={onDismiss}
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
};

interface NoPhasesModalProps {
  onBack: () => void;
  onViewDirectory: () => void;
  onCheckAgain: () => void;
}

export const NoPhasesModal: React.FC<NoPhasesModalProps> = ({
  onBack,
  onViewDirectory,
  onCheckAgain,
}) => {
  return (
    <div className="env-error-overlay">
      <div className="near-full-modal">
        <button
          className="btn btn-link text-decoration-none text-secondary position-absolute d-flex align-items-center"
          style={{ top: '20px', left: '20px', fontSize: '14px' }}
          onClick={onBack}
        >
          <i className="fas fa-arrow-left me-2"></i>
          Back
        </button>
        <div className="env-error-icon info">
          <i className="fas fa-sliders-h"></i>
        </div>
        <h3 className="env-error-title mt-3">Set Up Review Phases</h3>
        <p
          className="env-error-message text-center text-muted px-4 mb-4"
          style={{ maxWidth: '600px' }}
        >
          To use the PR Reviewer, you must configure at least one review phase.
          Review phases define the guidelines and checkpoints used during your
          reviews. We've automatically scaffolded the configuration folders on
          your system.
        </p>

        <div className="env-error-details w-100 mb-4 text-start font-monospace small">
          <div className="mb-2 fw-semibold text-body">Required Setup:</div>
          <div className="d-flex align-items-center gap-2 mb-3">
            <i className="far fa-folder text-warning"></i>
            <span className="text-secondary">
              ~/.stitch/pr-reviewer/phases/
            </span>
            <span className="badge bg-danger-subtle text-danger-emphasis ms-auto">
              Add .md files here
            </span>
          </div>

          <div className="mb-2 fw-semibold text-body">
            Optional Scaffolding:
          </div>
          <div className="d-flex align-items-center gap-2">
            <i className="far fa-folder text-muted"></i>
            <span className="text-secondary">
              ~/.stitch/pr-reviewer/templates/
            </span>
          </div>
        </div>

        <div className="d-flex flex-column flex-sm-row gap-3 mt-2 w-100 justify-content-center">
          <button
            className="btn btn-outline-secondary px-4 py-2"
            onClick={() =>
              window.electronAPI.openExternal(
                'https://github.com/thealternator89/stitch/blob/main/docs/pr-reviewer/README.md',
              )
            }
          >
            <i className="fas fa-book me-2"></i>
            Documentation
          </button>
          <button
            className="btn btn-outline-primary px-4 py-2"
            onClick={onViewDirectory}
          >
            <i className="fas fa-folder-open me-2"></i>
            View Directory
          </button>
          <button
            className="btn btn-indigo px-4 py-2 shadow-sm"
            onClick={onCheckAgain}
          >
            <i className="fas fa-sync-alt me-2"></i>
            Check Again
          </button>
        </div>
      </div>
    </div>
  );
};
