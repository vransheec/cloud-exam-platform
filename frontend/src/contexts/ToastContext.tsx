/**
 * Toast Context
 * 
 * Provides toast notification functionality throughout the application.
 * Allows any component to show success, error, warning, or info messages.
 * 
 * Requirements:
 * - 7.2: Provide immediate feedback and clear status indicators
 */

import React, { createContext, useContext, ReactNode } from 'react';
import { useToast } from '../hooks/useToast';
import { ToastContainer } from '../components/Toast';

interface ToastContextType {
  success: (message: string, title?: string) => string;
  error: (message: string, title?: string) => string;
  warning: (message: string, title?: string) => string;
  info: (message: string, title?: string) => string;
  closeToast: (id: string) => void;
  closeAll: () => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

/**
 * Toast Provider Component
 * Wraps the application to provide toast functionality
 */
export const ToastProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const toast = useToast();

  return (
    <ToastContext.Provider
      value={{
        success: toast.success,
        error: toast.error,
        warning: toast.warning,
        info: toast.info,
        closeToast: toast.closeToast,
        closeAll: toast.closeAll,
      }}
    >
      {children}
      <ToastContainer toasts={toast.toasts} onClose={toast.closeToast} />
    </ToastContext.Provider>
  );
};

/**
 * Hook to use toast notifications
 * Must be used within ToastProvider
 */
export const useToastContext = (): ToastContextType => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToastContext must be used within ToastProvider');
  }
  return context;
};
