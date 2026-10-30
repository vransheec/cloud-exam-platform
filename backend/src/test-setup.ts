/**
 * Test Setup
 * 
 * Sets up environment variables and global configuration for tests
 */

// Set required environment variables for tests
process.env.JWT_SECRET = 'test-secret-key';
process.env.AWS_REGION = 'us-east-1';
process.env.NODE_ENV = 'test';
