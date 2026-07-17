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
});
