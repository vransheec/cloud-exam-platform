/**
 * Backend Entry Point
 * 
 * This is the main entry point for the backend application.
 * It exports all handlers and services for use in serverless functions.
 */

// Export configuration
export { env } from './config/env';

// Export data models and types
export * from './models/types';

// Export API handlers (these are the Lambda function handlers)
export * from './handlers';
