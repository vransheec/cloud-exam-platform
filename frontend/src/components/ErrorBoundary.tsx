/**
 * Error Boundary Component
 * 
 * Catches React errors gracefully and displays user-friendly error messages.
 * Provides recovery options for users when errors occur.
 * 
 * Requirements:
 * - 7.2: Provide immediate feedback and clear status indicators
 * - 7.5: Display helpful error messages that guide users toward resolution
 */

import { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

/**
 * ErrorBoundary catches JavaScript errors anywhere in the child component tree,
 * logs those errors, and displays a fallback UI instead of crashing the whole app.
 */
class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  /**
   * Update state when an error is caught
   */
  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      errorInfo: null,
    };
  }

  /**
   * Log error details for debugging
   */
  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log error to console in development
    console.error('Error caught by ErrorBoundary:', error, errorInfo);
    
    // Update state with error info
    this.setState({
      error,
      errorInfo,
    });
    
    // In production, you might want to log to an error reporting service
    // Example: logErrorToService(error, errorInfo);
  }

  /**
   * Reset error state and try to recover
   */
  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  /**
   * Reload the page as a recovery option
   */
  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      // If a custom fallback is provided, use it
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default fallback UI
      return (
        <div className="error-boundary-fallback">
          <div className="error-boundary-content">
            <div className="error-icon">⚠️</div>
            <h1>Oops! Something went wrong</h1>
            <p className="error-message">
              We encountered an unexpected error. This has been logged and we'll look into it.
            </p>
            
            {/* Show error details in development */}
            {process.env.NODE_ENV === 'development' && this.state.error && (
              <details className="error-details">
                <summary>Error Details (Development Only)</summary>
                <pre className="error-stack">
                  <strong>Error:</strong> {this.state.error.toString()}
                  {this.state.errorInfo && (
                    <>
                      <br />
                      <br />
                      <strong>Component Stack:</strong>
                      {this.state.errorInfo.componentStack}
                    </>
                  )}
                </pre>
              </details>
            )}

            {/* Recovery options */}
            <div className="error-actions">
              <button 
                onClick={this.handleReset} 
                className="btn btn-primary"
              >
                Try Again
              </button>
              <button 
                onClick={this.handleReload} 
                className="btn btn-secondary"
              >
                Reload Page
              </button>
              <button 
                onClick={() => window.location.href = '/'} 
                className="btn btn-secondary"
              >
                Go to Home
              </button>
            </div>

            {/* Helpful guidance */}
            <div className="error-help">
              <p>
                <strong>What you can do:</strong>
              </p>
              <ul>
                <li>Try the action again by clicking "Try Again"</li>
                <li>Reload the page to start fresh</li>
                <li>Go back to the home page</li>
                <li>If the problem persists, please contact support</li>
              </ul>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
