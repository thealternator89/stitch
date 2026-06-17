// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import {
  TimeoutProvider,
  useTimeoutModal,
  isTimeoutError,
} from '../TimeoutContext';

const TestComponent: React.FC = () => {
  const { showTimeout } = useTimeoutModal();
  return (
    <div>
      <button
        onClick={() =>
          showTimeout(new Error('[TIMEOUT_ERROR] Timeout waiting for response'))
        }
      >
        Trigger Timeout Error
      </button>
      <button onClick={() => showTimeout('[TIMEOUT_ERROR] Timeout string')}>
        Trigger Timeout String
      </button>
      <button
        onClick={() =>
          showTimeout({ message: '[TIMEOUT_ERROR] A generic timeout occurred' })
        }
      >
        Trigger Timeout Object
      </button>
      <button onClick={() => showTimeout(new Error('Generic other error'))}>
        Trigger Other Error
      </button>
    </div>
  );
};

describe('TimeoutContext & isTimeoutError', () => {
  describe('isTimeoutError', () => {
    it('should identify Error instances with [TIMEOUT_ERROR] in message', () => {
      expect(
        isTimeoutError(
          new Error('[TIMEOUT_ERROR] Timeout waiting for response'),
        ),
      ).toBe(true);
      expect(isTimeoutError(new Error('Timeout waiting for response'))).toBe(
        false,
      );
      expect(isTimeoutError(new Error('Some other error'))).toBe(false);
    });

    it('should identify strings containing [TIMEOUT_ERROR]', () => {
      expect(isTimeoutError('[TIMEOUT_ERROR] A timeout occurred')).toBe(true);
      expect(isTimeoutError('timed out')).toBe(false);
      expect(isTimeoutError('other error')).toBe(false);
    });

    it('should identify objects with a message containing [TIMEOUT_ERROR]', () => {
      expect(
        isTimeoutError({ message: '[TIMEOUT_ERROR] Request timeout' }),
      ).toBe(true);
      expect(isTimeoutError({ message: 'Request timeout' })).toBe(false);
      expect(isTimeoutError({ message: 'Generic error' })).toBe(false);
      expect(isTimeoutError({})).toBe(false);
      expect(isTimeoutError(null)).toBe(false);
    });
  });

  describe('TimeoutProvider & TimeoutModal integration', () => {
    it('should display the modal with details when trigger button is clicked, and hide it on dismiss', async () => {
      render(
        <TimeoutProvider>
          <TestComponent />
        </TimeoutProvider>,
      );

      // Verify modal is not in the document initially
      expect(screen.queryByText('Request Timed Out')).not.toBeInTheDocument();

      // Trigger error
      const triggerBtn = screen.getByText('Trigger Timeout Error');
      fireEvent.click(triggerBtn);

      // Modal should be shown
      expect(screen.getByText('Request Timed Out')).toBeInTheDocument();
      expect(
        screen.getByText(
          /The GitHub Copilot service is taking too long to respond/i,
        ),
      ).toBeInTheDocument();

      // Click "Show Technical Details"
      const toggleDetailsBtn = screen.getByText('Show Technical Details');
      fireEvent.click(toggleDetailsBtn);

      // Technical details should contain the stack/error message
      expect(
        screen.getByText(/Timeout waiting for response/i),
      ).toBeInTheDocument();

      // Click "Hide Technical Details"
      fireEvent.click(screen.getByText('Hide Technical Details'));
      expect(
        screen.queryByText(/Timeout waiting for response/i),
      ).not.toBeInTheDocument();

      // Dismiss the modal
      const dismissBtn = screen.getByText('Dismiss');
      fireEvent.click(dismissBtn);

      // Modal should be closed
      expect(screen.queryByText('Request Timed Out')).not.toBeInTheDocument();
    });
  });
});
