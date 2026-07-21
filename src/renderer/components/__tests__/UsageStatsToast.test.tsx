// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import UsageStatsToast from '../UsageStatsToast';

describe('UsageStatsToast Component', () => {
  const mockStats = {
    inputTokens: 42023,
    outputTokens: 2381,
    cacheReadTokens: 30976,
    cost: 0.1234,
  };

  it('renders stats correctly and calculates cache percentage', () => {
    render(<UsageStatsToast stats={mockStats} onClose={vi.fn()} />);

    expect(screen.getByText('Usage Stats')).toBeInTheDocument();
    expect(screen.getByText('42,023')).toBeInTheDocument();
    expect(screen.getByText('2,381')).toBeInTheDocument();
    expect(screen.getByText('30,976')).toBeInTheDocument();
    expect(
      screen.getByText('74% of input tokens served from the cache'),
    ).toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', () => {
    const onCloseSpy = vi.fn();
    render(<UsageStatsToast stats={mockStats} onClose={onCloseSpy} />);

    const closeBtn = screen.getByRole('button', { name: /close/i });
    expect(closeBtn).toBeInTheDocument();

    fireEvent.click(closeBtn);
    expect(onCloseSpy).toHaveBeenCalledOnce();
  });

  it('does not render cache message if inputTokens is 0', () => {
    const zeroInputStats = {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cost: 0,
    };

    render(<UsageStatsToast stats={zeroInputStats} onClose={vi.fn()} />);

    expect(
      screen.queryByText(/of input tokens served from the cache/),
    ).not.toBeInTheDocument();
  });

  it('does not render More Details button when phases are not provided', () => {
    render(<UsageStatsToast stats={mockStats} onClose={vi.fn()} />);

    expect(
      screen.queryByRole('button', { name: /more details/i }),
    ).not.toBeInTheDocument();
  });

  it('renders More Details button and opens modal with phase breakdown', () => {
    const statsWithPhases = {
      ...mockStats,
      phases: [
        {
          phaseTitle: 'Phase 1: Architecture',
          model: 'Claude 3.5 Sonnet',
          inputTokens: 20000,
          outputTokens: 1000,
          cacheReadTokens: 15000,
          cost: 1.5,
          multiplier: 1.5,
        },
        {
          phaseTitle: 'Phase 2: Security',
          model: 'GPT-4o',
          inputTokens: 22023,
          outputTokens: 1381,
          cacheReadTokens: 15976,
          cost: 1,
          multiplier: 1,
        },
      ],
    };

    render(<UsageStatsToast stats={statsWithPhases} onClose={vi.fn()} />);

    const moreDetailsBtn = screen.getByRole('button', {
      name: /more details/i,
    });
    expect(moreDetailsBtn).toBeInTheDocument();

    // Modal initially not visible
    expect(screen.queryByText('Phase Usage Breakdown')).not.toBeInTheDocument();

    // Click More Details
    fireEvent.click(moreDetailsBtn);

    // Modal now open
    expect(screen.getByText('Phase Usage Breakdown')).toBeInTheDocument();
    expect(screen.getByText('Phase 1: Architecture')).toBeInTheDocument();
    expect(screen.getByText('Claude 3.5 Sonnet')).toBeInTheDocument();
    expect(screen.getByText('Phase 2: Security')).toBeInTheDocument();
    expect(screen.getByText('GPT-4o')).toBeInTheDocument();
    expect(screen.getByText('×1.5')).toBeInTheDocument();

    // Close modal
    const closeBtn = screen.getByRole('button', { name: /close modal/i });
    fireEvent.click(closeBtn);

    expect(screen.queryByText('Phase Usage Breakdown')).not.toBeInTheDocument();
  });
});
