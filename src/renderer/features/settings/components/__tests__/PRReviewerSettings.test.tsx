// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import PRReviewerSettings from '../PRReviewerSettings';
import { Persona } from '../../../../../types';

describe('PRReviewerSettings Component', () => {
  it('renders empty state correctly', () => {
    render(
      <PRReviewerSettings
        personas={[]}
        setPersonas={vi.fn()}
        maxParallelism={2}
        setMaxParallelism={vi.fn()}
        cpuCount={4}
      />,
    );

    expect(screen.getByText(/No Personas Configured/i)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Add Persona/i }),
    ).toBeInTheDocument();
  });

  it('triggers setPersonas when Add Persona button is clicked', () => {
    const setPersonasMock = vi.fn();
    render(
      <PRReviewerSettings
        personas={[]}
        setPersonas={setPersonasMock}
        maxParallelism={2}
        setMaxParallelism={vi.fn()}
        cpuCount={4}
      />,
    );

    const addButton = screen.getByRole('button', { name: /Add Persona/i });
    fireEvent.click(addButton);

    expect(setPersonasMock).toHaveBeenCalledWith([{ name: '', content: '' }]);
  });

  it('renders existing personas correctly', () => {
    const mockPersonas: Persona[] = [
      { name: 'Security Auditor', content: 'Check for SQL injection and XSS' },
      {
        name: 'Performance Specialist',
        content: 'Check for memory leaks and async optimization',
      },
    ];

    render(
      <PRReviewerSettings
        personas={mockPersonas}
        setPersonas={vi.fn()}
        maxParallelism={2}
        setMaxParallelism={vi.fn()}
        cpuCount={4}
      />,
    );

    expect(screen.getByDisplayValue('Security Auditor')).toBeInTheDocument();
    expect(
      screen.getByDisplayValue('Check for SQL injection and XSS'),
    ).toBeInTheDocument();
    expect(
      screen.getByDisplayValue('Performance Specialist'),
    ).toBeInTheDocument();

    // Verification of character counters
    expect(screen.getByText('16/20')).toBeInTheDocument();
    expect(screen.getByText('31/160')).toBeInTheDocument();
  });

  it('updates persona name and guidelines on change', () => {
    const mockPersonas: Persona[] = [
      { name: 'Reviewer A', content: 'Original content' },
    ];
    const setPersonasMock = vi.fn();

    render(
      <PRReviewerSettings
        personas={mockPersonas}
        setPersonas={setPersonasMock}
        maxParallelism={2}
        setMaxParallelism={vi.fn()}
        cpuCount={4}
      />,
    );

    // Change Name
    const nameInput = screen.getByDisplayValue('Reviewer A');
    fireEvent.change(nameInput, { target: { value: 'Updated Reviewer' } });
    expect(setPersonasMock).toHaveBeenCalledWith([
      { name: 'Updated Reviewer', content: 'Original content' },
    ]);

    // Change Content/Guidelines
    const contentInput = screen.getByDisplayValue('Original content');
    fireEvent.change(contentInput, { target: { value: 'New Guidelines' } });
    expect(setPersonasMock).toHaveBeenLastCalledWith([
      { name: 'Reviewer A', content: 'New Guidelines' },
    ]);
  });

  it('deletes a persona when the delete button is clicked', () => {
    const mockPersonas: Persona[] = [
      { name: 'Reviewer A', content: 'Content A' },
      { name: 'Reviewer B', content: 'Content B' },
    ];
    const setPersonasMock = vi.fn();

    render(
      <PRReviewerSettings
        personas={mockPersonas}
        setPersonas={setPersonasMock}
        maxParallelism={2}
        setMaxParallelism={vi.fn()}
        cpuCount={4}
      />,
    );

    const deleteButtons = screen.getAllByTitle('Delete Persona');
    expect(deleteButtons).toHaveLength(2);

    fireEvent.click(deleteButtons[0]);
    expect(setPersonasMock).toHaveBeenCalledWith([
      { name: 'Reviewer B', content: 'Content B' },
    ]);
  });

  it('limits personas to 5 and displays info message', () => {
    const mockPersonas: Persona[] = Array(5).fill({
      name: 'Name',
      content: 'Content',
    });
    const setPersonasMock = vi.fn();

    render(
      <PRReviewerSettings
        personas={mockPersonas}
        setPersonas={setPersonasMock}
        maxParallelism={2}
        setMaxParallelism={vi.fn()}
        cpuCount={4}
      />,
    );

    expect(
      screen.queryByRole('button', { name: /Add Persona/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/Maximum limit of 5 personas reached/i),
    ).toBeInTheDocument();
  });

  it('shows validation errors for empty fields and duplicate names', () => {
    const mockPersonas: Persona[] = [
      { name: 'Duplicate', content: '' },
      { name: 'Duplicate', content: 'Guidelines' },
    ];

    render(
      <PRReviewerSettings
        personas={mockPersonas}
        setPersonas={vi.fn()}
        maxParallelism={2}
        setMaxParallelism={vi.fn()}
        cpuCount={4}
      />,
    );

    // First persona has empty content
    expect(screen.getByText('Guidelines are required.')).toBeInTheDocument();
    // Both have duplicate name
    const duplicateErrors = screen.getAllByText('Persona name must be unique.');
    expect(duplicateErrors).toHaveLength(2);
  });

  it('shows validation errors for reserved name None', () => {
    const mockPersonas: Persona[] = [
      { name: 'None', content: 'Some guidelines' },
      { name: 'none', content: 'Other guidelines' },
    ];
    render(
      <PRReviewerSettings
        personas={mockPersonas}
        setPersonas={vi.fn()}
        maxParallelism={2}
        setMaxParallelism={vi.fn()}
        cpuCount={4}
      />,
    );

    const noneErrors = screen.getAllByText('"None" is a reserved name.');
    expect(noneErrors).toHaveLength(2);
  });

  it('swallows the Enter keypress on the guidelines content input', () => {
    const mockPersonas: Persona[] = [
      { name: 'Reviewer A', content: 'Original content' },
    ];
    render(
      <PRReviewerSettings
        personas={mockPersonas}
        setPersonas={vi.fn()}
        maxParallelism={2}
        setMaxParallelism={vi.fn()}
        cpuCount={4}
      />,
    );

    const contentInput = screen.getByDisplayValue('Original content');

    const preventDefaultSpy = vi.fn();
    const event = new KeyboardEvent('keydown', {
      key: 'Enter',
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperty(event, 'preventDefault', {
      value: preventDefaultSpy,
      writable: true,
    });

    contentInput.dispatchEvent(event);

    expect(preventDefaultSpy).toHaveBeenCalled();
  });

  it('renders concurrency settings correctly when cpuCount < 4', () => {
    render(
      <PRReviewerSettings
        personas={[]}
        setPersonas={vi.fn()}
        maxParallelism={1}
        setMaxParallelism={vi.fn()}
        cpuCount={2}
      />,
    );

    expect(
      screen.getByText(
        (_, element) =>
          element?.tagName === 'SPAN' &&
          (element?.textContent?.includes('Parallelism is locked to 1') ??
            false),
      ),
    ).toBeInTheDocument();
  });

  it('renders concurrency settings correctly when cpuCount >= 4', () => {
    const setMaxParallelismMock = vi.fn();
    render(
      <PRReviewerSettings
        personas={[]}
        setPersonas={vi.fn()}
        maxParallelism={2}
        setMaxParallelism={setMaxParallelismMock}
        cpuCount={8}
      />,
    );

    expect(
      screen.queryByText(/Parallelism is locked to 1/i),
    ).not.toBeInTheDocument();
    expect(screen.getByText('2 Workers')).toBeInTheDocument();
    expect(
      screen.getByText(/Allowing between 1 and 6 parallel agents/i),
    ).toBeInTheDocument();

    const slider = screen.getByRole('slider');
    expect(slider).toBeInTheDocument();
    expect(slider).toHaveAttribute('min', '1');
    expect(slider).toHaveAttribute('max', '6');
    expect(slider).toHaveValue('2');

    fireEvent.change(slider, { target: { value: '4' } });
    expect(setMaxParallelismMock).toHaveBeenCalledWith(4);
  });
});
