/**
 * useToast Hook
 * 
 * Custom hook for managing toast notifications.
 * Provides methods to show success, error, warning, and info messages.
 * 
 * Requirements:
 * - 7.2: Provide immediate feedback and clear status indicators
 */

import { useState, useCallback } from 'react';
import { ToastMessage, ToastType } from '../components/Toast';

let toastId = 0;

export const useToast = () => {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  /**
   * Show a toast notification
   */
  const showToast = useCallback((
    type: ToastType,
    message: string,
    title?: string,
    duration?: number
  ) => {
    const id = `toast-${++toastId}`;
    const newToast: ToastMessage = {
      id,
      type,
      message,
      title,
      duration,
    };

    setToasts((prev) => [...prev, newToast]);
    return id;
  }, []);

  /**
   * Show a success toast
   */
  const success = useCallback((message: string, title?: string) => {
    return showToast('success', message, title || 'Success');
  }, [showToast]);

  /**
   * Show an error toast
   */
  const error = useCallback((message: string, title?: string) => {
    return showToast('error', message, title || 'Error', 7000); // Longer duration for errors
  }, [showToast]);

  /**
   * Show a warning toast
   */
  const warning = useCallback((message: string, title?: string) => {
    return showToast('warning', message, title || 'Warning');
  }, [showToast]);

  /**
   * Show an info toast
   */
  const info = useCallback((message: string, title?: string) => {
    return showToast('info', message, title || 'Info');
  }, [showToast]);

  /**
   * Close a specific toast
   */
  const closeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  /**
   * Close all toasts
   */
  const closeAll = useCallback(() => {
    setToasts([]);
  }, []);

  return {
    toasts,
    success,
    error,
    warning,
    info,
    closeToast,
    closeAll,
  };
};
