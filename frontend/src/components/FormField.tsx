/**
 * FormField Component
 * 
 * Reusable form field component with built-in validation display.
 * Shows validation errors inline and provides visual feedback.
 * 
 * Requirements:
 * - 2.1: Validate question structure
 * - 5.1: Validate student profile data
 * - 7.5: Display helpful error messages
 */

import React, { InputHTMLAttributes, TextareaHTMLAttributes } from 'react';

interface BaseFormFieldProps {
  label: string;
  name: string;
  error?: string;
  required?: boolean;
  helpText?: string;
}

type InputFormFieldProps = BaseFormFieldProps & InputHTMLAttributes<HTMLInputElement> & {
  type?: 'text' | 'email' | 'password' | 'tel' | 'url' | 'number';
  as?: 'input';
};

type TextareaFormFieldProps = BaseFormFieldProps & TextareaHTMLAttributes<HTMLTextAreaElement> & {
  as: 'textarea';
};

type SelectFormFieldProps = BaseFormFieldProps & InputHTMLAttributes<HTMLSelectElement> & {
  as: 'select';
  options: Array<{ value: string; label: string }>;
};

type FormFieldProps = InputFormFieldProps | TextareaFormFieldProps | SelectFormFieldProps;

/**
 * FormField renders an input, textarea, or select with label and validation
 */
const FormField: React.FC<FormFieldProps> = (props) => {
  const { label, name, error, required, helpText, as = 'input', ...fieldProps } = props;

  const hasError = !!error;
  const fieldClassName = `form-group ${hasError ? 'has-error' : ''}`;

  const renderField = () => {
    if (as === 'textarea') {
      const textareaProps = fieldProps as TextareaHTMLAttributes<HTMLTextAreaElement>;
      return (
        <textarea
          id={name}
          name={name}
          {...textareaProps}
          aria-invalid={hasError}
          aria-describedby={hasError ? `${name}-error` : helpText ? `${name}-help` : undefined}
        />
      );
    }

    if (as === 'select') {
      const selectProps = props as SelectFormFieldProps;
      return (
        <select
          id={name}
          name={name}
          {...(fieldProps as any)}
          aria-invalid={hasError}
          aria-describedby={hasError ? `${name}-error` : helpText ? `${name}-help` : undefined}
        >
          <option value="">Select {label}</option>
          {selectProps.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      );
    }

    const inputProps = fieldProps as InputHTMLAttributes<HTMLInputElement>;
    return (
      <input
        id={name}
        name={name}
        type={(props as InputFormFieldProps).type || 'text'}
        {...inputProps}
        aria-invalid={hasError}
        aria-describedby={hasError ? `${name}-error` : helpText ? `${name}-help` : undefined}
      />
    );
  };

  return (
    <div className={fieldClassName}>
      <label htmlFor={name} className={required ? 'required' : ''}>
        {label}
      </label>
      {renderField()}
      {helpText && !hasError && (
        <span id={`${name}-help`} className="form-help">
          {helpText}
        </span>
      )}
      {hasError && (
        <span id={`${name}-error`} className="validation-error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
};

export default FormField;
