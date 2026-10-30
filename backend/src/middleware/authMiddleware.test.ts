/**
 * Authorization Middleware Tests
 * 
 * Unit tests for authentication and authorization middleware functions.
 */

// Set up test environment variables
process.env.JWT_SECRET = 'test-secret-key-for-testing-only';
process.env.JWT_EXPIRATION = '1h';

import {
  requireAuthentication,
  requireRole,
  requireOperator,
  requireAssistant,
  requireActiveStudent,
  requireContentManager,
  checkSiteAvailability,
  verifyResourceOwnership,
} from './authMiddleware';
import { authenticate, hashPassword } from '../services/authService';
import { User, Student } from '../models/types';
import * as database from '../config/database';
import * as systemConfigService from '../services/systemConfigService';

// Mock the database module
jest.mock('../config/database');
// Mock the system config service
jest.mock('../services/systemConfigService');

const mockQueryItems = database.queryItems as jest.MockedFunction<typeof database.queryItems>;
const mockGetItem = database.getItem as jest.MockedFunction<typeof database.getItem>;
const mockGetSiteAvailability = systemConfigService.getSiteAvailability as jest.MockedFunction<
  typeof systemConfigService.getSiteAvailability
>;

describe('Authorization Middleware', () => {
  let validToken: string;
  let operatorToken: string;
  let assistantToken: string;
  let studentToken: string;

  beforeAll(async () => {
    // Create test tokens for different roles
    const hashedPassword = await hashPassword('testpass');

    // Student token
    const studentUser: User = {
      id: 'student-123',
      email: 'student@example.com',
      passwordHash: hashedPassword,
      role: 'student',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    mockQueryItems.mockResolvedValueOnce([studentUser]);
    const studentAuth = await authenticate('student@example.com', 'testpass');
    studentToken = studentAuth.token!;

    // Operator token
    const operatorUser: User = {
      id: 'operator-123',
      email: 'operator@example.com',
      passwordHash: hashedPassword,
      role: 'operator',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    mockQueryItems.mockResolvedValueOnce([operatorUser]);
    const operatorAuth = await authenticate('operator@example.com', 'testpass');
    operatorToken = operatorAuth.token!;

    // Assistant token
    const assistantUser: User = {
      id: 'assistant-123',
      email: 'assistant@example.com',
      passwordHash: hashedPassword,
      role: 'assistant',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    mockQueryItems.mockResolvedValueOnce([assistantUser]);
    const assistantAuth = await authenticate('assistant@example.com', 'testpass');
    assistantToken = assistantAuth.token!;

    validToken = studentToken;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('requireAuthentication', () => {
    it('should authenticate with valid Bearer token', () => {
      const result = requireAuthentication(`Bearer ${validToken}`);

      expect(result.authenticated).toBe(true);
      expect(result.userId).toBeTruthy();
      expect(result.userRole).toBe('student');
    });

    it('should authenticate with plain token', () => {
      const result = requireAuthentication(validToken);

      expect(result.authenticated).toBe(true);
      expect(result.userId).toBeTruthy();
    });

    it('should reject missing authorization header', () => {
      const result = requireAuthentication(undefined);

      expect(result.authenticated).toBe(false);
      expect(result.error).toBe('Authentication required');
      expect(result.statusCode).toBe(401);
    });

    it('should reject invalid token', () => {
      const result = requireAuthentication('invalid-token');

      expect(result.authenticated).toBe(false);
      expect(result.statusCode).toBe(401);
    });
  });

  describe('requireRole', () => {
    it('should allow access for matching role', () => {
      const authResult = requireAuthentication(`Bearer ${studentToken}`);
      const roleResult = requireRole(authResult, ['student']);

      expect(roleResult.authenticated).toBe(true);
    });

    it('should deny access for non-matching role', () => {
      const authResult = requireAuthentication(`Bearer ${studentToken}`);
      const roleResult = requireRole(authResult, ['operator']);

      expect(roleResult.authenticated).toBe(false);
      expect(roleResult.error).toBe('Insufficient permissions');
      expect(roleResult.statusCode).toBe(403);
    });

    it('should allow access for multiple allowed roles', () => {
      const authResult = requireAuthentication(`Bearer ${assistantToken}`);
      const roleResult = requireRole(authResult, ['operator', 'assistant']);

      expect(roleResult.authenticated).toBe(true);
    });
  });

  describe('requireOperator', () => {
    it('should allow operator access', () => {
      const result = requireOperator(`Bearer ${operatorToken}`);

      expect(result.authenticated).toBe(true);
      expect(result.userRole).toBe('operator');
    });

    it('should deny non-operator access', () => {
      const result = requireOperator(`Bearer ${studentToken}`);

      expect(result.authenticated).toBe(false);
      expect(result.error).toBe('Insufficient permissions');
    });
  });

  describe('requireAssistant', () => {
    it('should allow assistant access', () => {
      const result = requireAssistant(`Bearer ${assistantToken}`);

      expect(result.authenticated).toBe(true);
      expect(result.userRole).toBe('assistant');
    });

    it('should deny non-assistant access', () => {
      const result = requireAssistant(`Bearer ${studentToken}`);

      expect(result.authenticated).toBe(false);
    });
  });

  describe('requireActiveStudent', () => {
    it('should allow active student access', async () => {
      const activeStudent: Student = {
        userId: 'student-123',
        name: 'Test Student',
        phone: '123-456-7890',
        linkedin: 'linkedin.com/in/test',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockGetItem.mockResolvedValue(activeStudent);

      const result = await requireActiveStudent(`Bearer ${studentToken}`);

      expect(result.authenticated).toBe(true);
    });

    it('should deny inactive student access', async () => {
      const inactiveStudent: Student = {
        userId: 'student-123',
        name: 'Test Student',
        phone: '123-456-7890',
        linkedin: 'linkedin.com/in/test',
        isActive: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockGetItem.mockResolvedValue(inactiveStudent);

      const result = await requireActiveStudent(`Bearer ${studentToken}`);

      expect(result.authenticated).toBe(false);
      expect(result.error).toBe('Account is not active, please contact administrator');
      expect(result.statusCode).toBe(403);
    });

    it('should deny access if student profile not found', async () => {
      mockGetItem.mockResolvedValue(null);

      const result = await requireActiveStudent(`Bearer ${studentToken}`);

      expect(result.authenticated).toBe(false);
      expect(result.error).toBe('Student profile not found');
      expect(result.statusCode).toBe(404);
    });
  });

  describe('requireContentManager', () => {
    it('should allow operator access', () => {
      const result = requireContentManager(`Bearer ${operatorToken}`);

      expect(result.authenticated).toBe(true);
    });

    it('should allow assistant access', () => {
      const result = requireContentManager(`Bearer ${assistantToken}`);

      expect(result.authenticated).toBe(true);
    });

    it('should deny student access', () => {
      const result = requireContentManager(`Bearer ${studentToken}`);

      expect(result.authenticated).toBe(false);
    });
  });

  describe('checkSiteAvailability', () => {
    it('should always allow operator access', async () => {
      const result = await checkSiteAvailability('operator');

      expect(result.available).toBe(true);
    });

    it('should allow access when site is available', async () => {
      mockGetSiteAvailability.mockResolvedValue(true);

      const result = await checkSiteAvailability('student');

      expect(result.available).toBe(true);
    });

    it('should deny access when site is unavailable', async () => {
      mockGetSiteAvailability.mockResolvedValue(false);

      const result = await checkSiteAvailability('student');

      expect(result.available).toBe(false);
      expect(result.error).toBe('The platform is currently unavailable. Please try again later.');
    });

    it('should allow access when config does not exist', async () => {
      // Mock getSiteAvailability to return true (default when config doesn't exist)
      mockGetSiteAvailability.mockResolvedValue(true);

      const result = await checkSiteAvailability('student');

      expect(result.available).toBe(true);
    });
  });

  describe('verifyResourceOwnership', () => {
    it('should allow operator to access any resource', () => {
      const result = verifyResourceOwnership('operator-123', 'student-456', 'operator');

      expect(result).toBe(true);
    });

    it('should allow user to access their own resource', () => {
      const result = verifyResourceOwnership('student-123', 'student-123', 'student');

      expect(result).toBe(true);
    });

    it('should deny user access to another user resource', () => {
      const result = verifyResourceOwnership('student-123', 'student-456', 'student');

      expect(result).toBe(false);
    });
  });
});
