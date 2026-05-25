// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import ModelDropdown from '../ModelDropdown';
import { CopilotModel } from '../../../types';

const mockModels: CopilotModel[] = [
  { id: 'gpt-4o', name: 'GPT-4o', billing: { multiplier: 1 } },
  { id: 'claude-3.5', name: 'Claude 3.5 Sonnet', billing: { multiplier: 1.5 } },
];

describe('ModelDropdown Component', () => {
  it('renders loading state correctly', () => {
    render(
      <ModelDropdown
        models={mockModels}
        selectedModel="gpt-4o"
        onSelect={vi.fn()}
        loading={true}
      />,
    );

    const button = screen.getByRole('button', { name: /loading models/i });
    expect(button).toBeInTheDocument();
    expect(button).toBeDisabled();
  });

  it('renders empty models state correctly', () => {
    render(
      <ModelDropdown
        models={[]}
        selectedModel=""
        onSelect={vi.fn()}
        loading={false}
      />,
    );

    const button = screen.getByRole('button', { name: /no models available/i });
    expect(button).toBeInTheDocument();
  });

  it('renders placeholder state when selected model is missing', () => {
    render(
      <ModelDropdown
        models={mockModels}
        selectedModel=""
        onSelect={vi.fn()}
        loading={false}
      />,
    );

    const button = screen.getByRole('button', { name: /select a model/i });
    expect(button).toBeInTheDocument();
  });

  it('renders the selected model name on the trigger button', () => {
    render(
      <ModelDropdown
        models={mockModels}
        selectedModel="claude-3.5"
        onSelect={vi.fn()}
        loading={false}
      />,
    );

    // Find the toggle button specifically using class list checking
    const buttons = screen.getAllByRole('button');
    const trigger = buttons.find((btn) =>
      btn.classList.contains('dropdown-toggle'),
    );

    expect(trigger).toBeInTheDocument();
    expect(trigger).toHaveTextContent('Claude 3.5 Sonnet');
  });

  it('supports buttonVariant and disabled props', () => {
    render(
      <ModelDropdown
        models={mockModels}
        selectedModel="gpt-4o"
        onSelect={vi.fn()}
        loading={false}
        buttonVariant="outline-secondary"
        disabled={true}
      />,
    );

    const buttons = screen.getAllByRole('button');
    const trigger = buttons.find((btn) =>
      btn.classList.contains('dropdown-toggle'),
    );

    expect(trigger).toBeInTheDocument();
    expect(trigger).toHaveClass('btn-outline-secondary');
    expect(trigger).toBeDisabled();
  });

  it('renders dropdown list items with correct names and multipliers', () => {
    const { container } = render(
      <ModelDropdown
        models={mockModels}
        selectedModel="gpt-4o"
        onSelect={vi.fn()}
        loading={false}
      />,
    );

    const dropdownMenu = container.querySelector(
      '.dropdown-menu',
    ) as HTMLElement;
    expect(dropdownMenu).toBeInTheDocument();

    const firstItemName = within(dropdownMenu).getByText('GPT-4o');
    const firstItemMultiplier = within(dropdownMenu).getByText('×1');
    const secondItemName = within(dropdownMenu).getByText('Claude 3.5 Sonnet');
    const secondItemMultiplier = within(dropdownMenu).getByText('×1.5');

    expect(firstItemName).toBeInTheDocument();
    expect(firstItemMultiplier).toBeInTheDocument();
    expect(secondItemName).toBeInTheDocument();
    expect(secondItemMultiplier).toBeInTheDocument();
  });

  it('triggers onSelect with correct model ID when clicked', () => {
    const onSelectSpy = vi.fn();
    const { container } = render(
      <ModelDropdown
        models={mockModels}
        selectedModel="gpt-4o"
        onSelect={onSelectSpy}
        loading={false}
      />,
    );

    const dropdownMenu = container.querySelector(
      '.dropdown-menu',
    ) as HTMLElement;

    // Find the item buttons inside the dropdown menu
    const itemButtons = within(dropdownMenu).getAllByRole('button');
    const claudeItem = itemButtons.find((btn) =>
      btn.textContent?.includes('Claude 3.5 Sonnet'),
    );

    expect(claudeItem).toBeInTheDocument();
    fireEvent.click(claudeItem!);

    expect(onSelectSpy).toHaveBeenCalledWith('claude-3.5');
  });
});
