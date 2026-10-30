/**
 * Loading Spinner Component
 * 
 * Displays a loading spinner with optional message.
 * Used to provide feedback during async operations.
 * 
 * Requirements:
 * - 7.2: Provide immediate feedback and clear status indicators
 */

import React from 'react';

interface LoadingSpinnerProps {
  message?: string;
  size?: 'small' | 'medium' | 'large';
  inline?: boolean;
}

/**
 * LoadingSpinner shows a spinning animation to indicate loading state
 */
const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ 
  message = 'Loading...', 
  size = 'medium',
  inline = false 
}) => {
  const sizeClasses = {
    small: 'spinner-small',
    medium: 'spinner-medium',
    large: 'spinner-large',
  };

  if (inline) {
    return (
      <span className="inline-spinner">
        <span className={`spinner ${sizeClasses[size]}`} />
      </span>
    );
  }

  return (
    <div className="loading-spinner">
      <div className={`spinner ${sizeClasses[size]}`} />
      {message && <p>{message}</p>}
    </div>
  );
};

export default LoadingSpinner;
