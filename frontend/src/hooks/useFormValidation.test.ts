/**
 * useFormValidation Hook Tests
 * 
 * Tests form validation functionality
 */

import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useFormValidation, validationPatterns } from './useFormValidation';

describe('useFormValidation', () => {
  it('validates required fields', () => {
    const { result } = renderHook(() =>
      useFormValidation({
        name: { required: true },
      })
    );

    act(() => {
      result.current.touch('name');
      result.current.validate('name', '');
    });

    expect(result.current.hasError('name')).toBe(true);
    expect(result.current.getError('name')).toContain('required');
  });

  it('validates min length', () => {
    const { result } = renderHook(() =>
      useFormValidation({
        name: { required: true, minLength: 3 },
      })
    );

    act(() => {
      result.current.touch('name');
      result.current.validate('name', 'ab');
    });

    expect(result.current.hasError('name')).toBe(true);
    expect(result.current.getError('name')).toContain('at least 3');
  });

  it('validates email pattern', () => {
    const { result } = renderHook(() =>
      useFormValidation({
        email: { required: true, pattern: validationPatterns.email },
      })
    );

    act(() => {
      result.current.touch('email');
      result.current.validate('email', 'invalid-email');
    });

    expect(result.current.hasError('email')).toBe(true);

    act(() => {
      result.current.validate('email', 'valid@email.com');
    });

    expect(result.current.hasError('email')).toBe(false);
  });

  it('validates all fields', () => {
    const { result } = renderHook(() =>
      useFormValidation({
        name: { required: true },
        email: { required: true, pattern: validationPatterns.email },
      })
    );

    let isValid: boolean;
    act(() => {
      isValid = result.current.validateAll({
        name: '',
        email: 'invalid',
      });
    });

    expect(isValid!).toBe(false);
    expect(Object.keys(result.current.errors).length).toBeGreaterThan(0);
  });

  it('clears errors', () => {
    const { result } = renderHook(() =>
      useFormValidation({
        name: { required: true },
      })
    );

    act(() => {
      result.current.touch('name');
      result.current.validate('name', '');
    });

    expect(result.current.hasError('name')).toBe(true);

    act(() => {
      result.current.clearErrors();
    });

    expect(Object.keys(result.current.errors).length).toBe(0);
  });

  it('resets validation state', () => {
    const { result } = renderHook(() =>
      useFormValidation({
        name: { required: true },
      })
    );

    act(() => {
      result.current.touch('name');
      result.current.validate('name', '');
    });

    expect(result.current.hasError('name')).toBe(true);

    act(() => {
      result.current.reset();
    });

    expect(Object.keys(result.current.errors).length).toBe(0);
    expect(Object.keys(result.current.touched).length).toBe(0);
  });

  it('only shows errors for touched fields', () => {
    const { result } = renderHook(() =>
      useFormValidation({
        name: { required: true },
      })
    );

    act(() => {
      result.current.validate('name', '');
    });

    // Error exists but field not touched
    expect(result.current.errors.name).toBeDefined();
    expect(result.current.getError('name')).toBeUndefined();

    act(() => {
      result.current.touch('name');
    });

    // Now error should be visible
    expect(result.current.getError('name')).toBeDefined();
  });
});
