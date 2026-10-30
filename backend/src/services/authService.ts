/**
 * Authentication Service
 * 
 * This module handles user authentication, JWT token generation and validation,
 * and session management for the Cloud Exam Platform.
 * 
 * Requirements:
 * - 1.1: Authenticate users with valid credentials
 * - 1.2: Reject invalid credentials with appropriate error messages
 * - 1.3: Handle session expiration and require re-authentication
 */

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { getItem, queryItems } from '../config/database';
import { User, AuthResult, SessionInfo, UserRole } from '../models/types';

/**
 * JWT Payload Structure
 * 
 * Contains the user information encoded in the JWT token
 */
interface JWTPayload {
  userId: string;
  email: string;
  role: UserRole;
  iat?: number;  // Issued at
  exp?: number;  // Expiration time
}

/**
 * Authenticate a user with email and password
 * 
 * Validates credentials and returns an authentication result with JWT token on success.
 * 
 * @param email - User's email address
 * @param password - User's plain text password
 * @returns AuthResult with token and user info on success, or error message on failure
 * 
 * Requirements:
 * - 1.1: WHEN an assistant provides valid credentials, THE System SHALL authenticate them
 * - 1.2: WHEN an assistant provides invalid credentials, THE System SHALL reject the login attempt
 */
export async function authenticate(
  email: string,
  password: string
): Promise<AuthResult> {
  try {
    // Validate input
    if (!email || !password) {
      return {
        success: false,
        userType: null,
        token: null,
        userId: null,
        error: 'Email and password are required',
      };
    }

    // Query user by email using GSI (Global Secondary Index)
    // Note: This assumes a GSI on email field exists in the users table
    const users = await queryItems<User>(
      env.usersTable,
      '#email = :email',
      { ':email': email },
      'email-index',  // GSI name for email lookups
      { '#email': 'email' }
    );

    // Check if user exists
    if (!users || users.length === 0) {
      return {
        success: false,
        userType: null,
        token: null,
        userId: null,
        error: 'Invalid email or password',
      };
    }

    const user = users[0];

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    
    if (!isPasswordValid) {
      return {
        success: false,
        userType: null,
        token: null,
        userId: null,
        error: 'Invalid email or password',
      };
    }

    // Generate JWT token
    const token = generateToken(user);

    // Return successful authentication result
    return {
      success: true,
      userType: user.role,
      token,
      userId: user.id,
    };
  } catch (error) {
    console.error('Authentication error:', error);
    return {
      success: false,
      userType: null,
      token: null,
      userId: null,
      error: 'Authentication failed. Please try again.',
    };
  }
}

/**
 * Generate a JWT token for an authenticated user
 * 
 * Creates a signed JWT token containing user information and expiration time.
 * 
 * @param user - The authenticated user
 * @returns JWT token string
 */
function generateToken(user: User): string {
  const payload: JWTPayload = {
    userId: user.id,
    email: user.email,
    role: user.role,
  };

  // Sign token with expiration time from environment config
  return jwt.sign(payload, env.jwtSecret, {
    expiresIn: env.jwtExpiration,
  } as jwt.SignOptions);
}

/**
 * Validate a JWT token and extract session information
 * 
 * Verifies the token signature and expiration, returning session info on success.
 * 
 * @param token - JWT token string
 * @returns SessionInfo with user details if valid, or error if invalid/expired
 * 
 * Requirements:
 * - 1.3: WHEN an assistant session expires, THE System SHALL require re-authentication
 */
export function validateSession(token: string): SessionInfo {
  try {
    // Validate input
    if (!token) {
      return {
        valid: false,
        userId: null,
        userType: null,
        error: 'Authentication token is required',
      };
    }

    // Verify and decode token
    const decoded = jwt.verify(token, env.jwtSecret) as JWTPayload;

    // Return session information
    return {
      valid: true,
      userId: decoded.userId,
      userType: decoded.role,
    };
  } catch (error) {
    // Handle specific JWT errors
    if (error instanceof jwt.TokenExpiredError) {
      return {
        valid: false,
        userId: null,
        userType: null,
        error: 'Session expired, please log in again',
      };
    }

    if (error instanceof jwt.JsonWebTokenError) {
      return {
        valid: false,
        userId: null,
        userType: null,
        error: 'Invalid authentication token',
      };
    }

    // Generic error
    return {
      valid: false,
      userId: null,
      userType: null,
      error: 'Authentication validation failed',
    };
  }
}

/**
 * Logout a user (client-side token removal)
 * 
 * Note: JWT tokens are stateless, so logout is primarily handled client-side
 * by removing the token. This function is provided for consistency and future
 * enhancements (e.g., token blacklisting).
 * 
 * @param _token - JWT token to invalidate (unused for stateless JWT)
 * @returns true (logout is always successful as tokens are stateless)
 */
export function logout(_token: string): boolean {
  // For stateless JWT, logout is handled client-side by removing the token
  // In the future, we could implement token blacklisting here if needed
  return true;
}

/**
 * Hash a password for storage
 * 
 * Utility function to hash passwords before storing in the database.
 * Uses bcrypt with a salt round of 10.
 * 
 * @param password - Plain text password
 * @returns Hashed password string
 */
export async function hashPassword(password: string): Promise<string> {
  const saltRounds = 10;
  return bcrypt.hash(password, saltRounds);
}

/**
 * Verify if a user has a specific role
 * 
 * Helper function to check user permissions.
 * 
 * @param userId - User ID to check
 * @param requiredRole - Role required for access
 * @returns true if user has the required role, false otherwise
 */
export async function hasRole(
  userId: string,
  requiredRole: UserRole
): Promise<boolean> {
  try {
    const user = await getItem<User>(env.usersTable, { id: userId });
    
    if (!user) {
      return false;
    }

    return user.role === requiredRole;
  } catch (error) {
    console.error('Error checking user role:', error);
    return false;
  }
}

/**
 * Get user by ID
 * 
 * Retrieves a user record from the database.
 * 
 * @param userId - User ID
 * @returns User object or null if not found
 */
export async function getUserById(userId: string): Promise<User | null> {
  try {
    return await getItem<User>(env.usersTable, { id: userId });
  } catch (error) {
    console.error('Error getting user by ID:', error);
    return null;
  }
}
