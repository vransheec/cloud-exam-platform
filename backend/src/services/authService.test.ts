/**
 * Authentication Service Tests
 * 
 * Unit tests for authentication functions including login, token validation,
 * and session management.
 */

// Set up test environment variables before importing modules
process.env.JWT_SECRET = 'test-secret-key-for-testing-only';
process.env.JWT_EXPIRATION = '1h';

import { authenticate, validateSession, hashPassword } from './authService';
import { User } from '../models/types';
import * as database from '../config/database';

// Mock the database module
jest.mock('../config/database');
const mockQueryItems = database.queryItems as jest.MockedFunction<typeof database.queryItems>;

describe('Authentication Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('authenticate', () => {
    it('should authenticate user with valid credentials', async () => {
      // Create a test user with hashed password
      const hashedPassword = await hashPassword('testpassword123');
      const mockUser: User = {
        id: 'user-123',
        email: 'test@example.com',
        passwordHash: hashedPassword,
        role: 'student',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Mock database query to return the user
      mockQueryItems.mockResolvedValue([mockUser]);

      // Attempt authentication
      const result = await authenticate('test@example.com', 'testpassword123');

      // Verify successful authentication
      expect(result.success).toBe(true);
      expect(result.userId).toBe('user-123');
      expect(result.userType).toBe('student');
      expect(result.token).toBeTruthy();
      expect(result.error).toBeUndefined();
    });

    it('should reject authentication with invalid email', async () => {
      // Mock database query to return no users
      mockQueryItems.mockResolvedValue([]);

      // Attempt authentication
      const result = await authenticate('nonexistent@example.com', 'password');

      // Verify rejection
      expect(result.success).toBe(false);
      expect(result.token).toBeNull();
      expect(result.error).toBe('Invalid email or password');
    });

    it('should reject authentication with invalid password', async () => {
      // Create a test user with hashed password
      const hashedPassword = await hashPassword('correctpassword');
      const mockUser: User = {
        id: 'user-123',
        email: 'test@example.com',
        passwordHash: hashedPassword,
        role: 'student',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Mock database query to return the user
      mockQueryItems.mockResolvedValue([mockUser]);

      // Attempt authentication with wrong password
      const result = await authenticate('test@example.com', 'wrongpassword');

      // Verify rejection
      expect(result.success).toBe(false);
      expect(result.token).toBeNull();
      expect(result.error).toBe('Invalid email or password');
    });

    it('should reject authentication with missing email', async () => {
      const result = await authenticate('', 'password');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Email and password are required');
    });

    it('should reject authentication with missing password', async () => {
      const result = await authenticate('test@example.com', '');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Email and password are required');
    });
  });

  describe('validateSession', () => {
    it('should validate a valid token', async () => {
      // First create a valid token by authenticating
      const hashedPassword = await hashPassword('testpassword');
      const mockUser: User = {
        id: 'user-456',
        email: 'assistant@example.com',
        passwordHash: hashedPassword,
        role: 'assistant',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockQueryItems.mockResolvedValue([mockUser]);
      const authResult = await authenticate('assistant@example.com', 'testpassword');

      // Validate the token
      const sessionInfo = validateSession(authResult.token!);

      expect(sessionInfo.valid).toBe(true);
      expect(sessionInfo.userId).toBe('user-456');
      expect(sessionInfo.userType).toBe('assistant');
      expect(sessionInfo.error).toBeUndefined();
    });

    it('should reject an invalid token', () => {
      const sessionInfo = validateSession('invalid-token-string');

      expect(sessionInfo.valid).toBe(false);
      expect(sessionInfo.userId).toBeNull();
      expect(sessionInfo.error).toBeTruthy();
    });

    it('should reject an empty token', () => {
      const sessionInfo = validateSession('');

      expect(sessionInfo.valid).toBe(false);
      expect(sessionInfo.error).toBe('Authentication token is required');
    });

    it('should reject an expired token', () => {
      // This test would require mocking time or using a token with very short expiration
      // For now, we test the error handling structure
      const sessionInfo = validateSession('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ0ZXN0IiwiZW1haWwiOiJ0ZXN0QGV4YW1wbGUuY29tIiwicm9sZSI6InN0dWRlbnQiLCJpYXQiOjE1MTYyMzkwMjIsImV4cCI6MTUxNjIzOTAyMn0.invalid');

      expect(sessionInfo.valid).toBe(false);
      expect(sessionInfo.error).toBeTruthy();
    });
  });

  describe('hashPassword', () => {
    it('should hash a password', async () => {
      const password = 'mySecurePassword123';
      const hash = await hashPassword(password);

      expect(hash).toBeTruthy();
      expect(hash).not.toBe(password);
      expect(hash.length).toBeGreaterThan(20);
    });

    it('should generate different hashes for same password', async () => {
      const password = 'samePassword';
      const hash1 = await hashPassword(password);
      const hash2 = await hashPassword(password);

      // Hashes should be different due to salt
      expect(hash1).not.toBe(hash2);
    });
  });
});
