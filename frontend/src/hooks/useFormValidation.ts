/**
 * useFormValidation Hook
 * 
 * Custom hook for managing form validation state and errors.
 * Provides validation for required fields and custom validation rules.
 * 
 * Requirements:
 * - 2.1: Validate question structure
 * - 5.1: Validate student profile data
 */

import { useState, useCallback } from 'react';

export interface ValidationRule {
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  pattern?: RegExp;
  custom?: (value: any) => string | null;
  message?: string;
}

export interface ValidationRules {
  [field: string]: ValidationRule;
}

export interface ValidationErrors {
  [field: string]: string;
}

export const useFormValidation = (rules: ValidationRules) => {
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [touched, setTouched] = useState<{ [field: string]: boolean }>({});

  /**
   * Validate a single field
   */
  const validateField = useCallback(
    (field: string, value: any): string | null => {
      const rule = rules[field];
      if (!rule) return null;

      // Required validation
      if (rule.required) {
        if (value === undefined || value === null || value === '') {
          return rule.message || `${field} is required`;
        }
        if (typeof value === 'string' && value.trim() === '') {
          return rule.message || `${field} is required`;
        }
      }

      // Skip other validations if value is empty and not required
      if (!value && !rule.required) {
        return null;
      }

      // Min length validation
      if (rule.minLength && typeof value === 'string') {
        if (value.length < rule.minLength) {
          return rule.message || `${field} must be at least ${rule.minLength} characters`;
        }
      }

      // Max length validation
      if (rule.maxLength && typeof value === 'string') {
        if (value.length > rule.maxLength) {
          return rule.message || `${field} must be at most ${rule.maxLength} characters`;
        }
      }

      // Pattern validation
      if (rule.pattern && typeof value === 'string') {
        if (!rule.pattern.test(value)) {
          return rule.message || `${field} format is invalid`;
        }
      }

      // Custom validation
      if (rule.custom) {
        return rule.custom(value);
      }

      return null;
    },
    [rules]
  );

  /**
   * Validate all fields
   */
  const validateAll = useCallback(
    (values: { [field: string]: any }): boolean => {
      const newErrors: ValidationErrors = {};
      let isValid = true;

      Object.keys(rules).forEach((field) => {
        const error = validateField(field, values[field]);
        if (error) {
          newErrors[field] = error;
          isValid = false;
        }
      });

      setErrors(newErrors);
      return isValid;
    },
    [rules, validateField]
  );

  /**
   * Validate a single field and update errors
   */
  const validate = useCallback(
    (field: string, value: any) => {
      const error = validateField(field, value);
      setErrors((prev) => {
        if (error) {
          return { ...prev, [field]: error };
        } else {
          const { [field]: _, ...rest } = prev;
          return rest;
        }
      });
      return error === null;
    },
    [validateField]
  );

  /**
   * Mark a field as touched
   */
  const touch = useCallback((field: string) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
  }, []);

  /**
   * Mark all fields as touched
   */
  const touchAll = useCallback(() => {
    const allTouched: { [field: string]: boolean } = {};
    Object.keys(rules).forEach((field) => {
      allTouched[field] = true;
    });
    setTouched(allTouched);
  }, [rules]);

  /**
   * Clear all errors
   */
  const clearErrors = useCallback(() => {
    setErrors({});
  }, []);

  /**
   * Clear a specific error
   */
  const clearError = useCallback((field: string) => {
    setErrors((prev) => {
      const { [field]: _, ...rest } = prev;
      return rest;
    });
  }, []);

  /**
   * Reset validation state
   */
  const reset = useCallback(() => {
    setErrors({});
    setTouched({});
  }, []);

  /**
   * Get error for a field (only if touched)
   */
  const getError = useCallback(
    (field: string): string | undefined => {
      return touched[field] ? errors[field] : undefined;
    },
    [errors, touched]
  );

  /**
   * Check if a field has an error
   */
  const hasError = useCallback(
    (field: string): boolean => {
      return touched[field] && !!errors[field];
    },
    [errors, touched]
  );

  return {
    errors,
    touched,
    validate,
    validateAll,
    validateField,
    touch,
    touchAll,
    clearErrors,
    clearError,
    reset,
    getError,
    hasError,
  };
};

/**
 * Common validation patterns
 */
export const validationPatterns = {
  email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  phone: /^\+?[\d\s-()]+$/,
  url: /^https?:\/\/.+/,
  linkedin: /^https?:\/\/(www\.)?linkedin\.com\/.+/,
};

/**
 * Common validation rules
 */
export const commonRules = {
  email: {
    required: true,
    pattern: validationPatterns.email,
    message: 'Please enter a valid email address',
  },
  phone: {
    required: true,
    pattern: validationPatterns.phone,
    message: 'Please enter a valid phone number',
  },
  linkedin: {
    required: true,
    pattern: validationPatterns.linkedin,
    message: 'Please enter a valid LinkedIn profile URL',
  },
  url: {
    pattern: validationPatterns.url,
    message: 'Please enter a valid URL',
  },
  required: {
    required: true,
    message: 'This field is required',
  },
};
