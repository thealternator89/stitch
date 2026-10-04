// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import PRReviewProgress, { PhaseProgress } from '../PRReviewProgress';

describe('PRReviewProgress Component', () => {
  it('renders overall progress and headers', () => {
    const mockProgress: PhaseProgress[] = [
      {
        id: 'p1',
        title: 'Security Review',
        status: 'completed',
        commentCount: 2,
      },
      {
        id: 'p2',
        title: 'Style Review',
        status: 'in-progress',
      },
      {
        id: 'critic-phase',
        title: 'Critic',
        status: 'pending',
      },
    ];

    render(<PRReviewProgress phaseProgress={mockProgress} />);

    expect(screen.getByText('PR Review Progress')).toBeInTheDocument();
    expect(screen.getByText('33% Complete')).toBeInTheDocument();
  });

  it('renders singular "1 draft comment written" when a completed phase has 1 comment', () => {
    const mockProgress: PhaseProgress[] = [
      {
        id: 'p1',
        title: 'Definition of Done',
        status: 'completed',
        commentCount: 1,
      },
    ];

    render(<PRReviewProgress phaseProgress={mockProgress} />);

    expect(screen.getByText('Definition of Done')).toBeInTheDocument();
    expect(screen.getByText('Phase complete')).toBeInTheDocument();
    expect(screen.getByText('1 draft comment written')).toBeInTheDocument();
  });

  it('renders plural "0 draft comments written" when a completed phase has 0 comments', () => {
    const mockProgress: PhaseProgress[] = [
      {
        id: 'p1',
        title: 'Code Formatting',
        status: 'completed',
        commentCount: 0,
      },
    ];

    render(<PRReviewProgress phaseProgress={mockProgress} />);

    expect(screen.getByText('Code Formatting')).toBeInTheDocument();
    expect(screen.getByText('Phase complete')).toBeInTheDocument();
    expect(screen.getByText('0 draft comments written')).toBeInTheDocument();
  });

  it('renders plural "3 draft comments written" when a completed phase has multiple comments', () => {
    const mockProgress: PhaseProgress[] = [
      {
        id: 'p1',
        title: 'Performance & Scalability',
        status: 'completed',
        commentCount: 3,
      },
    ];

    render(<PRReviewProgress phaseProgress={mockProgress} />);

    expect(screen.getByText('Performance & Scalability')).toBeInTheDocument();
    expect(screen.getByText('Phase complete')).toBeInTheDocument();
    expect(screen.getByText('3 draft comments written')).toBeInTheDocument();
  });

  it('defaults to 0 draft comments written if commentCount is undefined on a completed phase', () => {
    const mockProgress: PhaseProgress[] = [
      {
        id: 'p1',
        title: 'Lint Rules',
        status: 'completed',
      },
    ];

    render(<PRReviewProgress phaseProgress={mockProgress} />);

    expect(screen.getByText('Lint Rules')).toBeInTheDocument();
    expect(screen.getByText('Phase complete')).toBeInTheDocument();
    expect(screen.getByText('0 draft comments written')).toBeInTheDocument();
  });

  it('renders "Critic phase complete." without draft comments count for completed Critic phase', () => {
    const mockProgress: PhaseProgress[] = [
      {
        id: 'critic-phase',
        title: 'Critic',
        status: 'completed',
        statusText: 'Critic phase complete.',
      },
    ];

    render(<PRReviewProgress phaseProgress={mockProgress} />);

    expect(screen.getByText('Critic')).toBeInTheDocument();
    expect(screen.getByText('Critic phase complete.')).toBeInTheDocument();
    expect(
      screen.queryByText(/draft comments? written/i),
    ).not.toBeInTheDocument();
  });

  it('renders queued status for pending Critic phase', () => {
    const mockProgress: PhaseProgress[] = [
      {
        id: 'critic-phase',
        title: 'Critic',
        status: 'pending',
      },
    ];

    render(<PRReviewProgress phaseProgress={mockProgress} />);

    expect(screen.getByText('Queued')).toBeInTheDocument();
    expect(
      screen.getByText('Will run once the review phases have completed'),
    ).toBeInTheDocument();
  });

  it('renders active in-progress phase with status message', () => {
    const mockProgress: PhaseProgress[] = [
      {
        id: 'p1',
        title: 'Security',
        status: 'in-progress',
        statusText: 'Inspecting auth middleware...',
      },
    ];

    render(<PRReviewProgress phaseProgress={mockProgress} />);

    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(
      screen.getByText('Inspecting auth middleware...'),
    ).toBeInTheDocument();
  });

  it('renders skipped phases in the skipped section with reason', () => {
    const mockProgress: PhaseProgress[] = [
      {
        id: 'p1',
        title: 'Database Migrations',
        status: 'skipped',
        reason: 'No migration files touched',
      },
    ];

    render(<PRReviewProgress phaseProgress={mockProgress} />);

    expect(screen.getByText('Skipped Phases (1)')).toBeInTheDocument();
    expect(screen.getByText('Database Migrations')).toBeInTheDocument();
    expect(screen.getByText('No migration files touched')).toBeInTheDocument();
  });
});
