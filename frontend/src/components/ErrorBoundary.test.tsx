/**
 * ErrorBoundary Component Tests
 * 
 * Tests error boundary functionality
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ErrorBoundary from './ErrorBoundary';

// Component that throws an error
const ThrowError = () => {
  throw new Error('Test error');
};

// Component that works fine
const WorkingComponent = () => <div>Working</div>;

describe('ErrorBoundary', () => {
  it('renders children when there is no error', () => {
    render(
      <ErrorBoundary>
        <WorkingComponent />
      </ErrorBoundary>
    );
    
    expect(screen.getByText('Working')).toBeDefined();
  });

  it('renders error UI when child component throws', () => {
    // Suppress console.error for this test
    const originalError = console.error;
    console.error = () => {};

    render(
      <ErrorBoundary>
        <ThrowError />
      </ErrorBoundary>
    );

    expect(screen.getByText(/Something went wrong/i)).toBeDefined();
    expect(screen.getByRole('button', { name: /Try Again/i })).toBeDefined();

    // Restore console.error
    console.error = originalError;
  });

  it('renders custom fallback when provided', () => {
    const CustomFallback = () => <div>Custom Error UI</div>;

    // Suppress console.error for this test
    const originalError = console.error;
    console.error = () => {};

    render(
      <ErrorBoundary fallback={<CustomFallback />}>
        <ThrowError />
      </ErrorBoundary>
    );

    expect(screen.getByText('Custom Error UI')).toBeDefined();

    // Restore console.error
    console.error = originalError;
  });
});
