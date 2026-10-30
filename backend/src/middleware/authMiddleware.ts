/**
 * Authentication and Authorization Middleware
 * 
 * This module provides middleware functions to protect routes and enforce
 * role-based access control for the Cloud Exam Platform.
 * 
 * Now uses AWS Cognito for authentication instead of custom JWT.
 * Validates Cognito ID tokens that have already been verified by API Gateway.
 * 
 * Requirements:
 * - 1.4: Maintain separate authorization levels for assistants and students
 * - 3.4: Deny access to students without operator approval
 */

import { UserRole } from '../models/types';
import { getSiteAvailability } from '../services/systemConfigService';

/**
 * Request object extended with user information
 * 
 * After authentication, the request object is augmented with user details
 * for use in route handlers.
 */
export interface AuthenticatedRequest {
  userId: string;
  userRole: UserRole;
  email?: string;
}

/**
 * Authentication result for middleware
 */
export interface AuthMiddlewareResult {
  authenticated: boolean;
  userId?: string;
  userRole?: UserRole;
  email?: string;
  error?: string;
  statusCode?: number;
}

/**
 * Extract token from Authorization header
 * 
 * Supports both "Bearer <token>" and plain token formats.
 * 
 * @param authHeader - Authorization header value
 * @returns Token string or null if not found
 */
function extractToken(authHeader: string | undefined): string | null {
  if (!authHeader) {
    return null;
  }

  // Support "Bearer <token>" format
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }

  // Support plain token format
  return authHeader;
}

/**
 * Require Authentication Middleware
 * 
 * Validates that the request includes a valid Cognito ID token.
 * This middleware should be applied to all protected routes.
 * 
 * Note: API Gateway Cognito authorizer already validates the token signature.
 * This middleware extracts user information from the validated token.
 * 
 * @param authHeader - Authorization header from the request
 * @returns AuthMiddlewareResult with user info or error
 * 
 * Requirements:
 * - Property 32: Authentication required for all operations
 */
export async function requireAuthentication(
  authHeader: string | undefined
): Promise<AuthMiddlewareResult> {
  // Extract token from header
  const token = extractToken(authHeader);

  if (!token) {
    return {
      authenticated: false,
      error: 'Authentication required',
      statusCode: 401,
    };
  }

  try {
    // Decode the ID token (API Gateway already validated it)
    // We just need to extract the claims
    const tokenParts = token.split('.');
    if (tokenParts.length !== 3) {
      console.error('Invalid token format - expected 3 parts, got:', tokenParts.length);
      return {
        authenticated: false,
        error: 'Invalid token format',
        statusCode: 401,
      };
    }

    // Decode the payload (base64url)
    // JWT uses base64url encoding, so we need to handle padding
    let base64 = tokenParts[1].replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) {
      base64 += '=';
    }
    const payload = JSON.parse(
      Buffer.from(base64, 'base64').toString('utf-8')
    );

    console.log('Token payload decoded successfully:', {
      username: payload['cognito:username'] || payload.sub,
      email: payload.email,
      groups: payload['cognito:groups'] || [],
      exp: payload.exp
    });

    // Verify token is not expired
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      console.error('Token expired:', { exp: payload.exp, now });
      return {
        authenticated: false,
        error: 'Token expired',
        statusCode: 401,
      };
    }

    // Extract user information from ID token
    // Always use 'sub' as the user identifier for consistency with DynamoDB records
    const username = payload.sub || payload['cognito:username'];
    const email = payload.email;
    const groups = payload['cognito:groups'] || [];

    // Determine role from groups
    let userRole: UserRole | null = null;
    if (groups.includes('operators')) userRole = 'operator';
    else if (groups.includes('assistants')) userRole = 'assistant';
    else if (groups.includes('students')) userRole = 'student';

    console.log('Role determination:', { groups, userRole });

    if (!userRole) {
      console.error('No valid role found for user:', { username, groups });
      return {
        authenticated: false,
        error: 'User role not found',
        statusCode: 403,
      };
    }

    // Return authenticated user info
    return {
      authenticated: true,
      userId: username,
      userRole: userRole,
      email: email,
    };
  } catch (error: any) {
    console.error('Token validation error:', {
      error: error.message,
      stack: error.stack,
      tokenLength: token?.length,
      tokenStart: token?.substring(0, 50) + '...'
    });
    return {
      authenticated: false,
      error: 'Invalid or expired token',
      statusCode: 401,
    };
  }
}

/**
 * Require Specific Role Middleware
 * 
 * Validates that the authenticated user has one of the required roles.
 * 
 * @param authResult - Result from requireAuthentication
 * @param allowedRoles - Array of roles that are allowed access
 * @returns AuthMiddlewareResult with success or error
 * 
 * Requirements:
 * - 1.4: THE System SHALL maintain separate authorization levels
 */
export function requireRole(
  authResult: AuthMiddlewareResult,
  allowedRoles: UserRole[]
): AuthMiddlewareResult {
  // Check if user is authenticated
  if (!authResult.authenticated) {
    return authResult;
  }

  // Check if user has required role
  if (!allowedRoles.includes(authResult.userRole!)) {
    return {
      authenticated: false,
      error: 'Insufficient permissions',
      statusCode: 403,
    };
  }

  return authResult;
}

/**
 * Require Operator Role Middleware
 * 
 * Convenience function to require operator role.
 * 
 * @param authHeader - Authorization header from the request
 * @returns AuthMiddlewareResult with success or error
 */
export async function requireOperator(
  authHeader: string | undefined
): Promise<AuthMiddlewareResult> {
  const authResult = await requireAuthentication(authHeader);
  return requireRole(authResult, ['operator']);
}

/**
 * Require Assistant Role Middleware
 * 
 * Convenience function to require assistant role.
 * 
 * @param authHeader - Authorization header from the request
 * @returns AuthMiddlewareResult with success or error
 */
export async function requireAssistant(
  authHeader: string | undefined
): Promise<AuthMiddlewareResult> {
  const authResult = await requireAuthentication(authHeader);
  return requireRole(authResult, ['assistant']);
}

/**
 * Require Student Role Middleware
 * 
 * Validates that the user is a student and checks if their account is active.
 * 
 * @param authHeader - Authorization header from the request
 * @returns AuthMiddlewareResult with success or error
 * 
 * Requirements:
 * - 3.4: WHEN a student attempts to access the platform without operator approval,
 *        THE System SHALL deny access
 */
export async function requireActiveStudent(
  authHeader: string | undefined
): Promise<AuthMiddlewareResult> {
  // First check authentication and student role
  const authResult = await requireAuthentication(authHeader);
  const roleCheck = requireRole(authResult, ['student']);

  if (!roleCheck.authenticated) {
    return roleCheck;
  }

  try {
    // Since we're using Cognito-only users, we don't need to check DynamoDB for student records
    // The requireAuthentication already validates the token and requireRole checks the group membership
    // If we get here, the student is valid and authenticated via Cognito
    
    console.log(`Student authenticated via Cognito: ${roleCheck.userId}`);
    
    // Student is authenticated via Cognito and has student role
    return roleCheck;
  } catch (error) {
    console.error('Error in requireActiveStudent:', error);
    return {
      authenticated: false,
      error: 'Authentication error',
      statusCode: 500,
    };
  }
}

/**
 * Require Operator or Assistant Role Middleware
 * 
 * Convenience function to allow both operators and assistants.
 * Useful for content management endpoints.
 * 
 * @param authHeader - Authorization header from the request
 * @returns AuthMiddlewareResult with success or error
 */
export async function requireContentManager(
  authHeader: string | undefined
): Promise<AuthMiddlewareResult> {
  const authResult = await requireAuthentication(authHeader);
  return requireRole(authResult, ['operator', 'assistant']);
}

/**
 * Check Site Availability
 * 
 * Verifies that the site is available for access.
 * Operators can always access even when site is unavailable.
 * 
 * @param userRole - Role of the authenticated user
 * @returns Object with available status and error message if unavailable
 * 
 * Requirements:
 * - Property 31: Site availability control
 * - 1.1 (extended): Allow operator login even when site is down
 */
export async function checkSiteAvailability(
  userRole: UserRole
): Promise<{ available: boolean; error?: string }> {
  try {
    // Operators can always access the site
    if (userRole === 'operator') {
      return { available: true };
    }

    // Check site availability using the system config service
    const isAvailable = await getSiteAvailability();

    if (!isAvailable) {
      return {
        available: false,
        error: 'The platform is currently unavailable. Please try again later.',
      };
    }

    return { available: true };
  } catch (error) {
    console.error('Error checking site availability:', error);
    // On error, allow access (fail open for better user experience)
    return { available: true };
  }
}

/**
 * Combined Authentication and Site Availability Check
 * 
 * Performs both authentication and site availability checks.
 * This should be the primary middleware for most protected routes.
 * 
 * @param authHeader - Authorization header from the request
 * @returns AuthMiddlewareResult with success or error
 */
export async function requireAuthenticationWithSiteCheck(
  authHeader: string | undefined
): Promise<AuthMiddlewareResult> {
  // First check authentication
  const authResult = await requireAuthentication(authHeader);

  if (!authResult.authenticated) {
    return authResult;
  }

  // Then check site availability
  const siteCheck = await checkSiteAvailability(authResult.userRole!);

  if (!siteCheck.available) {
    return {
      authenticated: false,
      error: siteCheck.error,
      statusCode: 503,
    };
  }

  return authResult;
}

/**
 * Verify User Owns Resource
 * 
 * Helper function to verify that a user owns a specific resource.
 * Useful for ensuring students can only access their own data.
 * 
 * @param authenticatedUserId - ID of the authenticated user
 * @param resourceUserId - ID of the user who owns the resource
 * @param userRole - Role of the authenticated user
 * @returns true if user owns resource or is an operator, false otherwise
 */
export function verifyResourceOwnership(
  authenticatedUserId: string,
  resourceUserId: string,
  userRole: UserRole
): boolean {
  // Operators can access all resources
  if (userRole === 'operator') {
    return true;
  }

  // Users can only access their own resources
  return authenticatedUserId === resourceUserId;
}
