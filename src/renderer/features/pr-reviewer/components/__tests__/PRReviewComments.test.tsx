// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import PRReviewComments from '../PRReviewComments';
import { ReviewComment } from '../../../../../types';

describe('PRReviewComments Component', () => {
  const baseProps = {
    comments: [],
    displayedComments: [],
    hasCritiqued: true,
    commentViewMode: 'critiqued' as const,
    setCommentViewMode: vi.fn(),
    activeCritiquedComments: [],
    isReviewing: false,
    hasReviewed: true,
    getGeneralStatusText: () => 'Done',
    lastStatusTime: null,
    rejectedCritiquedComments: [],
    collapsedComments: {},
    onToggleCollapse: vi.fn(),
    isPostingComment: {},
    onDismissComment: vi.fn(),
    onPostComment: vi.fn(),
    onStartEditComment: vi.fn(),
    isHeaderCollapsed: false,
  };

  it('renders Reply badge and Reply button for a comment with reply status', () => {
    const replyComment: ReviewComment = {
      id: 'comment-1',
      type: 'general',
      comment:
        'Replying to existing discussion regarding authorization tokens.',
      status: 'reply',
      threadId: 1042,
    };

    render(
      <PRReviewComments
        {...baseProps}
        displayedComments={[replyComment]}
        activeCritiquedComments={[replyComment]}
      />,
    );

    // Verify badge
    expect(screen.getByText('Reply to Thread #1042')).toBeInTheDocument();

    // Verify button says "Reply" instead of "Post"
    const replyButton = screen.getByRole('button', { name: /^Reply$/i });
    expect(replyButton).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /^Post$/i }),
    ).not.toBeInTheDocument();
  });

  it('renders collapsed Reply badge when comment is collapsed', () => {
    const replyComment: ReviewComment = {
      id: 'comment-1',
      type: 'line',
      file: 'src/main.ts',
      line: 42,
      comment: 'Line reply comment.',
      status: 'reply',
      threadId: 555,
    };

    render(
      <PRReviewComments
        {...baseProps}
        displayedComments={[replyComment]}
        activeCritiquedComments={[replyComment]}
        collapsedComments={{ 'comment-1': true }}
      />,
    );

    expect(screen.getByText('Reply #555')).toBeInTheDocument();
  });
});
