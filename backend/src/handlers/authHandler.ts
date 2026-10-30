/**
 * Authentication API Handlers
 * 
 * Provides HTTP endpoints for user authentication operations using AWS Cognito.
 * These handlers are designed to be deployed as serverless functions (AWS Lambda).
 * 
 * Endpoints:
 * - POST /api/auth/login - User login via Cognito
 * - POST /api/auth/logout - User logout (client-side token removal)
 * - GET /api/auth/me - Get current user info
 * 
 * Requirements:
 * - 1.1: Authenticate users with valid credentials
 * - 1.2: Reject invalid credentials with appropriate error messages
 * - 1.3: Handle session expiration and require re-authentication
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { CognitoIdentityProviderClient, AdminInitiateAuthCommand, AdminGetUserCommand, AdminListGroupsForUserCommand, AuthFlowType } from '@aws-sdk/client-cognito-identity-provider';
import { requireAuthentication } from '../middleware/authMiddleware';
import { getStudent } from '../services/studentService';

const cognito = new CognitoIdentityProviderClient({ region: process.env.COGNITO_REGION || 'us-east-1' });

/**
 * Login Request Body
 */
interface LoginRequest {
  email: string;
  password: string;
}

/**
 * Login Response Body
 */
interface LoginResponse {
  success: boolean;
  token?: string;
  idToken?: string;
  refreshToken?: string;
  userId?: string;
  userType?: string;
  error?: string;
}

/**
 * User Info Response Body
 */
interface UserInfoResponse {
  userId: string;
  email: string;
  role: string;
  name?: string;
  isActive?: boolean;
}

/**
 * Create a standardized API Gateway response
 * 
 * @param statusCode - HTTP status code
 * @param body - Response body object
 * @returns APIGatewayProxyResult
 */
function createResponse(
  statusCode: number,
  body: Record<string, any>
): APIGatewayProxyResult {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*', // Configure CORS as needed
      'Access-Control-Allow-Credentials': true,
    },
    body: JSON.stringify(body),
  };
}

/**
 * POST /api/auth/login
 * 
 * Authenticates a user with email and password using AWS Cognito.
 * Returns Cognito tokens on successful authentication.
 * 
 * Request Body:
 * {
 *   "email": "user@example.com",
 *   "password": "password123"
 * }
 * 
 * Response (Success - 200):
 * {
 *   "success": true,
 *   "token": "access_token",
 *   "idToken": "id_token",
 *   "refreshToken": "refresh_token",
 *   "userId": "username",
 *   "userType": "student" | "assistant" | "operator"
 * }
 * 
 * Response (Failure - 401):
 * {
 *   "success": false,
 *   "error": "Invalid email or password"
 * }
 * 
 * Requirements:
 * - 1.1: WHEN a user provides valid credentials, THE System SHALL authenticate them
 * - 1.2: WHEN a user provides invalid credentials, THE System SHALL reject the login attempt
 */
export async function login(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  const sourceIp = event.requestContext?.identity?.sourceIp || 'unknown';
  const userAgent = event.headers?.['User-Agent'] || event.headers?.['user-agent'] || 'unknown';

  try {
    // Parse request body
    if (!event.body) {
      return createResponse(400, {
        success: false,
        error: 'Request body is required',
      });
    }

    const requestBody: LoginRequest = JSON.parse(event.body);

    // Validate required fields
    if (!requestBody.email || !requestBody.password) {
      console.log(JSON.stringify({ event: 'login_attempt', email: requestBody.email || '(empty)', result: 'rejected', reason: 'missing_fields', ip: sourceIp }));
      return createResponse(400, {
        success: false,
        error: 'Email and password are required',
      });
    }

    // Authenticate with Cognito using ADMIN_NO_SRP_AUTH flow
    const params = {
      AuthFlow: AuthFlowType.ADMIN_NO_SRP_AUTH,
      UserPoolId: process.env.COGNITO_USER_POOL_ID!,
      ClientId: process.env.COGNITO_CLIENT_ID!,
      AuthParameters: {
        USERNAME: requestBody.email,
        PASSWORD: requestBody.password,
      },
    };

    const authResult = await cognito.send(new AdminInitiateAuthCommand(params));

    if (!authResult.AuthenticationResult) {
      console.log(JSON.stringify({ event: 'login_attempt', email: requestBody.email, result: 'failed', reason: 'no_auth_result', ip: sourceIp }));
      return createResponse(401, {
        success: false,
        error: 'Authentication failed',
      });
    }

    // Get user details to determine role
    const userParams = {
      UserPoolId: process.env.COGNITO_USER_POOL_ID!,
      Username: requestBody.email,
    };

    const userDetails = await cognito.send(new AdminGetUserCommand(userParams));
    
    // Get user groups to determine role
    const groupsResult = await cognito.send(new AdminListGroupsForUserCommand(userParams));
    
    let userType = 'student'; // default
    if (groupsResult.Groups && groupsResult.Groups.length > 0) {
      // Get the group with highest precedence (lowest number)
      const sortedGroups = groupsResult.Groups.sort((a: any, b: any) => {
        const precA = a.Precedence || 999;
        const precB = b.Precedence || 999;
        return precA - precB;
      });
      
      const groupName = sortedGroups[0].GroupName;
      if (groupName === 'operators') userType = 'operator';
      else if (groupName === 'assistants') userType = 'assistant';
      else if (groupName === 'students') userType = 'student';
    }

    console.log(JSON.stringify({ event: 'login_attempt', email: requestBody.email, result: 'success', role: userType, userId: userDetails.Username, ip: sourceIp }));

    // Return successful response
    const response: LoginResponse = {
      success: true,
      token: authResult.AuthenticationResult.AccessToken!,
      idToken: authResult.AuthenticationResult.IdToken!,
      refreshToken: authResult.AuthenticationResult.RefreshToken,
      userId: userDetails.Username,
      userType: userType,
    };

    return createResponse(200, response);
  } catch (error: any) {
    const email = (() => { try { return JSON.parse(event.body || '{}').email || '(unknown)'; } catch { return '(parse_error)'; } })();
    const reason = error.name || error.code || 'unknown_error';
    console.log(JSON.stringify({ event: 'login_attempt', email, result: 'failed', reason, message: error.message, ip: sourceIp, userAgent }));
    
    if (error.name === 'NotAuthorizedException' || error.code === 'NotAuthorizedException') {
      return createResponse(401, {
        success: false,
        error: 'Invalid email or password',
      });
    }
    
    if (error.name === 'UserNotFoundException' || error.code === 'UserNotFoundException') {
      return createResponse(401, {
        success: false,
        error: 'Invalid email or password',
      });
    }
    
    return createResponse(500, {
      success: false,
      error: 'An error occurred during login. Please try again.',
    });
  }
}

/**
 * POST /api/auth/logout
 * 
 * Logs out a user. With Cognito, this is primarily handled client-side
 * by removing the tokens. This endpoint is provided for consistency.
 * 
 * Request Headers:
 * Authorization: Bearer <token>
 * 
 * Response (Success - 200):
 * {
 *   "success": true,
 *   "message": "Logged out successfully"
 * }
 * 
 * Requirements:
 * - 1.3: Handle session management
 */
export async function logoutHandler(
  _event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    // For Cognito, logout is primarily client-side
    // We could optionally revoke the token here, but it's not necessary
    // as tokens expire automatically
    
    return createResponse(200, {
      success: true,
      message: 'Logged out successfully',
    });
  } catch (error) {
    console.error('Logout error:', error);
    return createResponse(500, {
      success: false,
      error: 'An error occurred during logout. Please try again.',
    });
  }
}

/**
 * GET /api/auth/me
 * 
 * Returns information about the currently authenticated user.
 * Includes user profile data and role information.
 * 
 * Request Headers:
 * Authorization: Bearer <token>
 * 
 * Response (Success - 200):
 * {
 *   "userId": "username",
 *   "email": "user@example.com",
 *   "role": "student" | "assistant" | "operator",
 *   "name": "John Doe",  // For students
 *   "isActive": true  // For students
 * }
 * 
 * Response (Failure - 401):
 * {
 *   "error": "Authentication required"
 * }
 * 
 * Requirements:
 * - 1.3: WHEN a session expires, THE System SHALL require re-authentication
 */
export async function getCurrentUser(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    // Check authentication
    const authHeader = event.headers.Authorization || event.headers.authorization;
    const authResult = await requireAuthentication(authHeader);

    if (!authResult.authenticated) {
      return createResponse(authResult.statusCode || 401, {
        error: authResult.error || 'Authentication required',
      });
    }

    // Build base response
    const response: UserInfoResponse = {
      userId: authResult.userId!,
      email: authResult.email || '',
      role: authResult.userRole!,
    };

    // If user is a student, include student profile information
    if (authResult.userRole === 'student') {
      const student = await getStudent(authResult.userId!);
      if (student) {
        response.name = student.name;
        response.isActive = student.isActive;
      }
    }

    return createResponse(200, response);
  } catch (error) {
    console.error('Get current user error:', error);
    return createResponse(500, {
      error: 'An error occurred while retrieving user information. Please try again.',
    });
  }
}
