/**
 * LoadingSpinner Component Tests
 * 
 * Tests loading spinner functionality
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import LoadingSpinner from './LoadingSpinner';

describe('LoadingSpinner', () => {
  it('renders with default message', () => {
    render(<LoadingSpinner />);
    expect(screen.getByText('Loading...')).toBeDefined();
  });

  it('renders with custom message', () => {
    render(<LoadingSpinner message="Please wait..." />);
    expect(screen.getByText('Please wait...')).toBeDefined();
  });

  it('renders inline spinner without message', () => {
    const { container } = render(<LoadingSpinner inline />);
    expect(container.querySelector('.inline-spinner')).toBeDefined();
  });

  it('applies correct size class', () => {
    const { container } = render(<LoadingSpinner size="large" />);
    expect(container.querySelector('.spinner-large')).toBeDefined();
  });
});
