import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ReviewComment } from '../../../../types';

interface PRReviewCommentsProps {
  displayedComments: ReviewComment[];
  comments: ReviewComment[];
  hasCritiqued: boolean;
  commentViewMode: 'critiqued' | 'unvalidated';
  setCommentViewMode: (mode: 'critiqued' | 'unvalidated') => void;
  activeCritiquedComments: ReviewComment[];
  isReviewing: boolean;
  hasReviewed: boolean;
  getGeneralStatusText: () => string;
  lastStatusTime: Date | null;
  rejectedCritiquedComments: ReviewComment[];
  collapsedComments: Record<string | number, boolean>;
  onToggleCollapse: (key: string | number) => void;
  isPostingComment: Record<number, boolean>;
  onDismissComment: (index: number) => void;
  onPostComment: (comment: ReviewComment, index: number) => void;
  onStartEditComment: (index: number, commentText: string) => void;
  isHeaderCollapsed: boolean;
}

const PRReviewComments: React.FC<PRReviewCommentsProps> = ({
  displayedComments,
  comments,
  hasCritiqued,
  commentViewMode,
  setCommentViewMode,
  activeCritiquedComments,
  isReviewing,
  hasReviewed,
  getGeneralStatusText,
  lastStatusTime,
  rejectedCritiquedComments,
  collapsedComments,
  onToggleCollapse,
  isPostingComment,
  onDismissComment,
  onPostComment,
  onStartEditComment,
  isHeaderCollapsed,
}) => {
  return (
    <div className="col-md-8">
      <div className="card shadow-sm border-0 h-100">
        <div
          className="card-body p-4 d-flex flex-column"
          style={{
            height: isHeaderCollapsed ? 'calc(100vh - 365px)' : '450px',
            minHeight: '300px',
          }}
        >
          <div className="d-flex align-items-center justify-content-between mb-3 flex-wrap gap-2">
            <h5 className="card-title fw-bold mb-0">
              <i className="fas fa-comments me-2 text-primary"></i>
              Review Comments ({displayedComments.length})
            </h5>
            {hasCritiqued && (
              <div className="btn-group btn-group-sm" role="group">
                <button
                  type="button"
                  className={`btn ${commentViewMode === 'critiqued' ? 'btn-primary' : 'btn-outline-secondary'}`}
                  onClick={() => setCommentViewMode('critiqued')}
                >
                  <i className="fas fa-user-check me-1"></i>
                  Critiqued ({activeCritiquedComments.length})
                </button>
                <button
                  type="button"
                  className={`btn ${commentViewMode === 'unvalidated' ? 'btn-primary' : 'btn-outline-secondary'}`}
                  onClick={() => setCommentViewMode('unvalidated')}
                >
                  <i className="fas fa-list me-1"></i>
                  Unvalidated ({comments.length})
                </button>
              </div>
            )}
          </div>

          {isReviewing && comments.length > 0 && (
            <div className="alert alert-info py-2 px-3 mb-3 d-flex align-items-center justify-content-between shadow-sm border-0 bg-info-subtle text-info-emphasis small">
              <div className="d-flex align-items-center gap-2">
                <span
                  className="spinner-border spinner-border-sm text-info me-1"
                  style={{ width: '1rem', height: '1rem' }}
                ></span>
                <span>
                  <strong>Status:</strong> {getGeneralStatusText()}
                </span>
              </div>
              {lastStatusTime && (
                <span className="text-muted small font-monospace">
                  Last update: {lastStatusTime.toLocaleTimeString()}
                </span>
              )}
            </div>
          )}

          {!isReviewing && hasReviewed && comments.length > 0 && (
            <div className="alert alert-success py-2 px-3 mb-3 d-flex align-items-center justify-content-between shadow-sm border-0 bg-success-subtle text-success-emphasis small flex-wrap gap-2">
              <div className="d-flex align-items-center gap-2">
                <i className="fas fa-check-circle text-success me-1"></i>
                <span>
                  <strong>Review complete</strong>
                  {hasCritiqued && ' • Critic phase completed'}
                </span>
              </div>
              <div className="d-flex align-items-center gap-3">
                {lastStatusTime && (
                  <span className="text-muted small font-monospace">
                    Completed at: {lastStatusTime.toLocaleTimeString()}
                  </span>
                )}
              </div>
            </div>
          )}

          <div
            className="flex-grow-1 overflow-y-auto pe-1"
            style={{ maxHeight: 'none' }}
          >
            {displayedComments.length === 0 &&
            (!hasCritiqued ||
              commentViewMode === 'unvalidated' ||
              rejectedCritiquedComments.length === 0) ? (
              <div className="h-100 d-flex flex-column align-items-center justify-content-center py-5 text-muted">
                {isReviewing ? (
                  <>
                    <span
                      className="spinner-border text-primary mb-3"
                      style={{ width: '3rem', height: '3rem' }}
                    ></span>
                    <p className="fw-semibold text-body mb-1">
                      {getGeneralStatusText()}
                    </p>
                    {lastStatusTime && (
                      <p className="text-muted small mb-2">
                        Last update: {lastStatusTime.toLocaleTimeString()}
                      </p>
                    )}
                    <p className="small mb-0 text-center px-4">
                      Copilot is analyzing the repository. Comments will appear
                      here as they are generated.
                    </p>
                  </>
                ) : hasReviewed ? (
                  <>
                    <i className="fas fa-check-circle fa-3x mb-3 text-success"></i>
                    <p className="fw-bold text-success fs-5 mb-1">
                      Review complete
                    </p>
                    <p className="small mb-0 text-center px-4 text-muted">
                      No comments were suggested.
                    </p>
                  </>
                ) : (
                  <>
                    <i className="fas fa-clipboard-list fa-3x mb-3 text-secondary opacity-50"></i>
                    <p className="fw-semibold text-body mb-1">
                      No comments generated yet
                    </p>
                    <p className="small mb-0 text-center px-4">
                      Configure instructions on the left and click "Start Code
                      Review" to begin.
                    </p>
                  </>
                )}
              </div>
            ) : (
              <div className="comments-list">
                {displayedComments.map((comment, index) => {
                  const isLine = comment.type === 'line';
                  if (collapsedComments[index]) {
                    return (
                      <div
                        key={index}
                        className="card shadow-sm border-0 mb-2 bg-body-secondary opacity-75"
                      >
                        <div className="card-body p-2 d-flex align-items-center justify-content-between">
                          <div className="d-flex align-items-center gap-2">
                            {comment.phase && (
                              <span className="badge bg-info-subtle text-info-emphasis">
                                {comment.phase}
                              </span>
                            )}
                            {comment.status === 'approved' && (
                              <span className="badge bg-success-subtle text-success-emphasis">
                                <i className="fas fa-check me-1"></i>
                                Approved
                              </span>
                            )}
                            {comment.status === 'edited' && (
                              <span className="badge bg-warning-subtle text-warning-emphasis">
                                <i className="fas fa-edit me-1"></i>
                                Edited by Critic
                              </span>
                            )}
                            {comment.status === 'merged' && (
                              <span className="badge bg-primary-subtle text-primary-emphasis">
                                <i className="fas fa-code-merge me-1"></i>
                                Merged by Critic
                              </span>
                            )}
                            {comment.posted ? (
                              <span className="text-success small fw-semibold">
                                <i className="fas fa-check-circle me-1"></i>
                                Posted to PR
                              </span>
                            ) : (
                              <span className="text-muted small fw-semibold">
                                <i className="fas fa-times-circle me-1"></i>
                                Dismissed
                              </span>
                            )}
                            {isLine && comment.file && (
                              <span
                                className="font-monospace text-muted small text-truncate"
                                style={{ maxWidth: '300px' }}
                                title={`${comment.file}:${comment.line}`}
                              >
                                {comment.file}:{comment.line}
                              </span>
                            )}
                          </div>
                          <button
                            className="btn btn-sm btn-link text-decoration-none p-0 px-2"
                            onClick={() => onToggleCollapse(index)}
                          >
                            <i className="fas fa-chevron-down me-1"></i> Expand
                          </button>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={index}
                      className={`card shadow-sm border-0 mb-3 ${
                        isLine
                          ? 'border-start border-4 border-primary'
                          : 'bg-body-tertiary'
                      }`}
                    >
                      <div className="card-body p-3">
                        <div className="d-flex align-items-center justify-content-between mb-2 pb-2 border-bottom border-secondary-subtle">
                          <div className="d-flex align-items-center gap-2 flex-wrap">
                            {comment.phase && (
                              <span className="badge bg-info-subtle text-info-emphasis">
                                {comment.phase}
                              </span>
                            )}
                            {comment.status === 'approved' && (
                              <span className="badge bg-success-subtle text-success-emphasis">
                                <i className="fas fa-check me-1"></i>
                                Approved
                              </span>
                            )}
                            {comment.status === 'edited' && (
                              <span className="badge bg-warning-subtle text-warning-emphasis">
                                <i className="fas fa-edit me-1"></i>
                                Edited by Critic
                              </span>
                            )}
                            {comment.status === 'merged' && (
                              <span className="badge bg-primary-subtle text-primary-emphasis">
                                <i className="fas fa-code-merge me-1"></i>
                                Merged by Critic
                              </span>
                            )}
                          </div>
                          {isLine && comment.file && (
                            <span
                              className="font-monospace text-muted small text-truncate ms-2"
                              style={{ maxWidth: '70%' }}
                              title={`${comment.file}:${comment.line}`}
                            >
                              {comment.file}:{comment.line}
                            </span>
                          )}
                        </div>

                        {isLine &&
                          comment.codeLines &&
                          comment.codeLines.length > 0 && (
                            <div
                              className="mb-3 rounded overflow-hidden border border-secondary-subtle"
                              style={{ backgroundColor: '#1e1e1e' }}
                            >
                              <pre
                                className="m-0 p-2 text-white font-monospace small"
                                style={{
                                  overflowX: 'auto',
                                  whiteSpace: 'pre',
                                }}
                              >
                                {comment.codeLines.map(
                                  (
                                    lineObj: {
                                      line: number;
                                      text: string;
                                      isTarget: boolean;
                                    },
                                    idx: number,
                                  ) => (
                                    <div
                                      key={idx}
                                      style={{
                                        backgroundColor: lineObj.isTarget
                                          ? 'rgba(255, 235, 59, 0.15)'
                                          : 'transparent',
                                        borderLeft: lineObj.isTarget
                                          ? '3px solid #ffeb3b'
                                          : '3px solid transparent',
                                        paddingLeft: lineObj.isTarget
                                          ? '5px'
                                          : '8px',
                                        display: 'flex',
                                      }}
                                    >
                                      <span
                                        className="me-3 select-none"
                                        style={{
                                          width: '35px',
                                          display: 'inline-block',
                                          textAlign: 'right',
                                          flexShrink: 0,
                                          color: '#858585',
                                        }}
                                      >
                                        {lineObj.line}
                                      </span>
                                      <span className="text-break-none">
                                        {lineObj.text}
                                      </span>
                                    </div>
                                  ),
                                )}
                              </pre>
                            </div>
                          )}

                        <div className="markdown-content text-body small">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {comment.comment}
                          </ReactMarkdown>
                        </div>

                        {/* Card Actions */}
                        <div className="d-flex justify-content-end gap-2 mt-3 pt-2 border-top border-secondary-subtle">
                          <button
                            className="btn btn-sm btn-outline-secondary"
                            onClick={() => onDismissComment(index)}
                          >
                            <i className="fas fa-eye-slash me-1"></i>
                            Dismiss
                          </button>
                          <div className="btn-group" role="group">
                            <button
                              className="btn btn-sm btn-primary"
                              onClick={() => onPostComment(comment, index)}
                              disabled={isPostingComment[index]}
                            >
                              {isPostingComment[index] ? (
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
                            <button
                              className="btn btn-sm btn-primary"
                              onClick={() =>
                                onStartEditComment(index, comment.comment)
                              }
                              disabled={isPostingComment[index]}
                              title="Edit comment before posting"
                            >
                              <i className="fas fa-edit"></i>
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {hasCritiqued &&
                  commentViewMode === 'critiqued' &&
                  rejectedCritiquedComments.length > 0 && (
                    <div className="mt-4 pt-3 border-top border-secondary-subtle">
                      <h6 className="fw-bold text-muted mb-3 d-flex align-items-center">
                        <i className="fas fa-ban text-danger me-2"></i>
                        Rejected Comments ({rejectedCritiquedComments.length})
                      </h6>
                      {rejectedCritiquedComments.map((comment, rIdx) => {
                        const keyIndex = `rejected-${rIdx}`;
                        const isCollapsed =
                          collapsedComments[keyIndex] !== false;
                        const isLine = comment.type === 'line';
                        return (
                          <div
                            key={keyIndex}
                            className="card shadow-sm border-0 mb-2 bg-body-tertiary opacity-75"
                          >
                            <div className="card-body p-3">
                              <div className="d-flex align-items-center justify-content-between">
                                <div className="d-flex align-items-center gap-2 flex-wrap">
                                  <span className="badge bg-danger-subtle text-danger-emphasis fw-semibold">
                                    <i className="fas fa-times-circle me-1"></i>
                                    {comment.reason || 'Rejected'}
                                  </span>
                                  {comment.phase && (
                                    <span className="badge bg-secondary-subtle text-secondary-emphasis">
                                      {comment.phase}
                                    </span>
                                  )}
                                  {isLine && comment.file && (
                                    <span
                                      className="font-monospace text-muted small text-truncate"
                                      style={{ maxWidth: '250px' }}
                                      title={`${comment.file}:${comment.line}`}
                                    >
                                      {comment.file}:{comment.line}
                                    </span>
                                  )}
                                </div>
                                <button
                                  className="btn btn-sm btn-link text-decoration-none p-0 px-2 ms-2"
                                  onClick={() => onToggleCollapse(keyIndex)}
                                >
                                  <i
                                    className={`fas fa-chevron-${isCollapsed ? 'down' : 'up'} me-1`}
                                  ></i>
                                  {isCollapsed ? 'Expand' : 'Collapse'}
                                </button>
                              </div>
                              {!isCollapsed && (
                                <div className="mt-3 pt-2 border-top border-secondary-subtle">
                                  {isLine &&
                                    comment.codeLines &&
                                    comment.codeLines.length > 0 && (
                                      <div
                                        className="mb-2 rounded overflow-hidden border border-secondary-subtle"
                                        style={{ backgroundColor: '#1e1e1e' }}
                                      >
                                        <pre
                                          className="m-0 p-2 text-white font-monospace small"
                                          style={{
                                            overflowX: 'auto',
                                            whiteSpace: 'pre',
                                          }}
                                        >
                                          {comment.codeLines.map(
                                            (lineObj, idx) => (
                                              <div
                                                key={idx}
                                                style={{
                                                  backgroundColor:
                                                    lineObj.isTarget
                                                      ? 'rgba(255, 235, 59, 0.15)'
                                                      : 'transparent',
                                                  borderLeft: lineObj.isTarget
                                                    ? '3px solid #ffeb3b'
                                                    : '3px solid transparent',
                                                  paddingLeft: lineObj.isTarget
                                                    ? '5px'
                                                    : '8px',
                                                  display: 'flex',
                                                }}
                                              >
                                                <span
                                                  className="me-3 select-none"
                                                  style={{
                                                    width: '35px',
                                                    display: 'inline-block',
                                                    textAlign: 'right',
                                                    flexShrink: 0,
                                                    color: '#858585',
                                                  }}
                                                >
                                                  {lineObj.line}
                                                </span>
                                                <span className="text-break-none">
                                                  {lineObj.text}
                                                </span>
                                              </div>
                                            ),
                                          )}
                                        </pre>
                                      </div>
                                    )}
                                  <div className="markdown-content text-body small">
                                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                      {comment.comment}
                                    </ReactMarkdown>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PRReviewComments;
