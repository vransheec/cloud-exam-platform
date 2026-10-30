/**
 * Authentication Service
 * 
 * Handles all authentication-related API calls using AWS Cognito.
 * Provides login, logout, and user information retrieval.
 */

import {
  CognitoUserPool,
  CognitoUser,
  AuthenticationDetails,
  CognitoUserSession,
} from 'amazon-cognito-identity-js';
import { AuthResponse, User, LoginCredentials } from '../types/auth';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

// Cognito configuration from environment variables
const poolData = {
  UserPoolId: import.meta.env.VITE_COGNITO_USER_POOL_ID || '',
  ClientId: import.meta.env.VITE_COGNITO_CLIENT_ID || '',
};

const userPool = new CognitoUserPool(poolData);

/**
 * Logs in a user with email and password using Cognito
 * @param credentials - User email and password
 * @returns Authentication response with Cognito tokens and user info
 */
export async function login(credentials: LoginCredentials): Promise<AuthResponse> {
  return new Promise((resolve, reject) => {
    const authenticationDetails = new AuthenticationDetails({
      Username: credentials.email,
      Password: credentials.password,
    });

    const cognitoUser = new CognitoUser({
      Username: credentials.email,
      Pool: userPool,
    });

    cognitoUser.authenticateUser(authenticationDetails, {
      onSuccess: (session: CognitoUserSession) => {
        // Use ID token for API Gateway Cognito authorizer
        const idToken = session.getIdToken();
        const idTokenJwt = idToken.getJwtToken();
        
        // Get user attributes from ID token
        const payload = idToken.payload;
        const groups = payload['cognito:groups'] || [];
        
        // Determine user type from groups
        let userType = 'student';
        if (groups.includes('operators')) userType = 'operator';
        else if (groups.includes('assistants')) userType = 'assistant';
        
        resolve({
          success: true,
          token: idTokenJwt,
          userId: payload['cognito:username'] || credentials.email,
          userType: userType as 'operator' | 'assistant' | 'student',
        });
      },
      onFailure: (err) => {
        console.error('Login error:', err);
        reject(new Error(err.message || 'Login failed'));
      },
    });
  });
}

/**
 * Logs out the current user
 * Clears Cognito session and tokens
 */
export async function logout(_token: string): Promise<void> {
  const cognitoUser = userPool.getCurrentUser();
  if (cognitoUser) {
    cognitoUser.signOut();
  }
  // Token parameter kept for API compatibility but not used with Cognito
}

/**
 * Gets information about the currently authenticated user
 * @param token - Cognito access token
 * @returns User information
 */
export async function getCurrentUser(token: string): Promise<User> {
  const response = await fetch(`${API_BASE_URL}/auth/me`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to fetch user information');
  }

  return response.json();
}

/**
 * Gets the current Cognito session if user is logged in
 * @returns Current session or null
 */
export function getCurrentSession(): Promise<CognitoUserSession | null> {
  return new Promise((resolve) => {
    const cognitoUser = userPool.getCurrentUser();
    
    if (!cognitoUser) {
      resolve(null);
      return;
    }

    cognitoUser.getSession((err: Error | null, session: CognitoUserSession | null) => {
      if (err || !session) {
        resolve(null);
        return;
      }
      
      resolve(session);
    });
  });
}

/**
 * Refreshes the current session tokens
 * @returns New session with refreshed tokens
 */
export function refreshSession(): Promise<CognitoUserSession> {
  return new Promise((resolve, reject) => {
    const cognitoUser = userPool.getCurrentUser();
    
    if (!cognitoUser) {
      reject(new Error('No user logged in'));
      return;
    }

    cognitoUser.getSession((err: Error | null, session: CognitoUserSession | null) => {
      if (err || !session) {
        reject(err || new Error('Failed to get session'));
        return;
      }
      
      // Refresh the session
      const refreshToken = session.getRefreshToken();
      cognitoUser.refreshSession(refreshToken, (refreshErr, newSession) => {
        if (refreshErr) {
          reject(refreshErr);
          return;
        }
        resolve(newSession);
      });
    });
  });
}
