import React, { createContext, useContext, useState, ReactNode } from 'react';
import TimeoutModal from '../components/TimeoutModal';

interface TimeoutContextType {
  showTimeout: (error: unknown) => void;
  closeTimeout: () => void;
}

const TimeoutContext = createContext<TimeoutContextType | undefined>(undefined);

export const TimeoutProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [technicalDetails, setTechnicalDetails] = useState('');

  const showTimeout = (error: unknown) => {
    let details = 'Unknown error';
    if (error instanceof Error) {
      details = error.stack || error.message;
    } else if (typeof error === 'string') {
      details = error;
    } else if (error && typeof error === 'object') {
      details = JSON.stringify(error, null, 2);
    }
    setTechnicalDetails(details);
    setIsOpen(true);
  };

  const closeTimeout = () => {
    setIsOpen(false);
    setTechnicalDetails('');
  };

  return (
    <TimeoutContext.Provider value={{ showTimeout, closeTimeout }}>
      {children}
      {isOpen && (
        <TimeoutModal
          technicalDetails={technicalDetails}
          onClose={closeTimeout}
        />
      )}
    </TimeoutContext.Provider>
  );
};

export const useTimeoutModal = (): TimeoutContextType => {
  const context = useContext(TimeoutContext);
  if (!context) {
    throw new Error('useTimeoutModal must be used within a TimeoutProvider');
  }
  return context;
};

export function isTimeoutError(err: unknown): boolean {
  if (err instanceof Error) {
    return err.message.includes('[TIMEOUT_ERROR]');
  }
  if (typeof err === 'string') {
    return err.includes('[TIMEOUT_ERROR]');
  }
  if (err && typeof err === 'object' && 'message' in err) {
    const objWithMsg = err as { message?: unknown };
    return String(objWithMsg.message ?? '').includes('[TIMEOUT_ERROR]');
  }
  return false;
}
