// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import UpdateToast from '../UpdateToast';

describe('UpdateToast Component', () => {
  it('renders correctly with the version number', () => {
    render(
      <UpdateToast
        version="2026.6.3"
        onClose={vi.fn()}
        onChangelog={vi.fn()}
      />,
    );

    expect(screen.getByText('Stitch Updated!')).toBeInTheDocument();
    expect(screen.getByText('v2026.6.3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /close/i })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /changelog/i }),
    ).toBeInTheDocument();
  });

  it('triggers onClose when Close button is clicked', () => {
    const onCloseSpy = vi.fn();
    render(
      <UpdateToast
        version="2026.6.3"
        onClose={onCloseSpy}
        onChangelog={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(onCloseSpy).toHaveBeenCalledOnce();
  });

  it('triggers onChangelog when Changelog button is clicked', () => {
    const onChangelogSpy = vi.fn();
    render(
      <UpdateToast
        version="2026.6.3"
        onClose={vi.fn()}
        onChangelog={onChangelogSpy}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /changelog/i }));
    expect(onChangelogSpy).toHaveBeenCalledOnce();
  });
});
