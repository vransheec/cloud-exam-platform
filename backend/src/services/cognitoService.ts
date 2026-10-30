/**
 * Cognito Service
 * 
 * Handles AWS Cognito user management operations.
 * Creates and manages users in Cognito User Pool for authentication.
 */

import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  AdminAddUserToGroupCommand,
  AdminDeleteUserCommand,
  AdminGetUserCommand,
  ListUsersInGroupCommand,
  AdminEnableUserCommand,
  AdminDisableUserCommand,
  MessageActionType,
} from '@aws-sdk/client-cognito-identity-provider';
import { env } from '../config/env';

// Initialize Cognito client
const cognitoClient = new CognitoIdentityProviderClient({
  region: env.cognitoRegion,
});

/**
 * Create a new user in Cognito User Pool
 * 
 * @param email - User's email address (used as username)
 * @param password - User's password
 * @param userType - Type of user ('student' or 'assistant')
 * @param name - Optional user's full name
 * @returns Cognito user sub (unique identifier)
 * @throws Error if user creation fails
 */
export async function createCognitoUser(
  email: string,
  password: string,
  userType: 'student' | 'assistant',
  name?: string
): Promise<string> {
  try {
    // Step 1: Create user in Cognito
    const createUserCommand = new AdminCreateUserCommand({
      UserPoolId: env.cognitoUserPoolId,
      Username: email,
      UserAttributes: [
        {
          Name: 'email',
          Value: email,
        },
        {
          Name: 'email_verified',
          Value: 'true',
        },
        ...(name
          ? [
              {
                Name: 'name',
                Value: name,
              },
            ]
          : []),
      ],
      MessageAction: MessageActionType.SUPPRESS, // Don't send welcome email
      TemporaryPassword: password, // Set temporary password
    });

    const createUserResponse = await cognitoClient.send(createUserCommand);
    
    if (!createUserResponse.User || !createUserResponse.User.Username) {
      throw new Error('Failed to create user in Cognito');
    }

    const username = createUserResponse.User.Username;

    // Step 2: Set permanent password (no force change required)
    const setPasswordCommand = new AdminSetUserPasswordCommand({
      UserPoolId: env.cognitoUserPoolId,
      Username: username,
      Password: password,
      Permanent: true, // Make password permanent
    });

    await cognitoClient.send(setPasswordCommand);

    // Step 3: Add user to appropriate group
    const groupName = userType === 'student' ? 'students' : 'assistants';
    const addToGroupCommand = new AdminAddUserToGroupCommand({
      UserPoolId: env.cognitoUserPoolId,
      Username: username,
      GroupName: groupName,
    });

    await cognitoClient.send(addToGroupCommand);

    // Step 4: Get user sub (unique identifier)
    const getUserCommand = new AdminGetUserCommand({
      UserPoolId: env.cognitoUserPoolId,
      Username: username,
    });

    const getUserResponse = await cognitoClient.send(getUserCommand);
    const subAttribute = getUserResponse.UserAttributes?.find(
      (attr) => attr.Name === 'sub'
    );

    if (!subAttribute || !subAttribute.Value) {
      throw new Error('Failed to retrieve user sub from Cognito');
    }

    return subAttribute.Value;
  } catch (error: any) {
    console.error('Error creating Cognito user:', error);
    const errMsg = error.name === 'UsernameExistsException' 
      ? `User already exists: ${email}`
      : `Failed to create user in Cognito: ${error instanceof Error ? error.message : 'Unknown error'}`;
    const wrappedError = new Error(errMsg);
    (wrappedError as any).code = error.name || error.code;
    throw wrappedError;
  }
}

/**
 * Delete a user from Cognito User Pool
 * 
 * @param email - User's email address (username)
 * @throws Error if user deletion fails
 */
export async function deleteCognitoUser(email: string): Promise<void> {
  try {
    const deleteUserCommand = new AdminDeleteUserCommand({
      UserPoolId: env.cognitoUserPoolId,
      Username: email,
    });

    await cognitoClient.send(deleteUserCommand);
  } catch (error) {
    console.error('Error deleting Cognito user:', error);
    throw new Error(
      `Failed to delete user from Cognito: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Check if a user exists in Cognito User Pool
 * 
 * @param email - User's email address (username)
 * @returns true if user exists, false otherwise
 */
export async function cognitoUserExists(email: string): Promise<boolean> {
  try {
    const getUserCommand = new AdminGetUserCommand({
      UserPoolId: env.cognitoUserPoolId,
      Username: email,
    });

    await cognitoClient.send(getUserCommand);
    return true;
  } catch (error: any) {
    if (error.name === 'UserNotFoundException') {
      return false;
    }
    throw error;
  }
}

/**
 * Reset a user's password in Cognito User Pool
 * 
 * @param email - User's email address (username)
 * @param newPassword - New password to set
 * @throws Error if password reset fails
 */
export async function resetUserPassword(email: string, newPassword: string): Promise<void> {
  try {
    const setPasswordCommand = new AdminSetUserPasswordCommand({
      UserPoolId: env.cognitoUserPoolId,
      Username: email,
      Password: newPassword,
      Permanent: true, // Make password permanent (no force change required)
    });

    await cognitoClient.send(setPasswordCommand);
  } catch (error) {
    console.error('Error resetting user password:', error);
    throw new Error(
      `Failed to reset password in Cognito: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Reset a user's password using their Cognito sub ID
 * 
 * @param userId - User's Cognito sub ID
 * @param newPassword - New password to set
 * @throws Error if password reset fails
 */
export async function resetUserPasswordById(userId: string, newPassword: string): Promise<void> {
  try {
    // First get the user's email from Cognito using their sub ID
    const getUserCommand = new AdminGetUserCommand({
      UserPoolId: env.cognitoUserPoolId,
      Username: userId,
    });

    const getUserResponse = await cognitoClient.send(getUserCommand);
    const emailAttribute = getUserResponse.UserAttributes?.find(
      (attr) => attr.Name === 'email'
    );

    if (!emailAttribute || !emailAttribute.Value) {
      throw new Error('User email not found in Cognito');
    }

    // Now reset the password using the email
    await resetUserPassword(emailAttribute.Value, newPassword);
  } catch (error) {
    console.error('Error resetting user password by ID:', error);
    throw new Error(
      `Failed to reset password in Cognito: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Get all users in a specific group
 * 
 * @param groupName - Name of the group ('students', 'assistants', 'operators')
 * @returns Array of users with their attributes
 * @throws Error if retrieval fails
 */
export async function getUsersInGroup(groupName: string): Promise<any[]> {
  try {
    const allUsers: any[] = [];
    let nextToken: string | undefined;

    // Paginate through all users in the group
    do {
      const listUsersCommand = new ListUsersInGroupCommand({
        UserPoolId: env.cognitoUserPoolId,
        GroupName: groupName,
        Limit: 60,
        NextToken: nextToken,
      });

      const response = await cognitoClient.send(listUsersCommand);
      
      if (response.Users) {
        allUsers.push(...response.Users);
      }
      
      nextToken = response.NextToken;
    } while (nextToken);

    // Transform Cognito users to our format
    return allUsers.map(user => {
      const emailAttr = user.Attributes?.find((attr: any) => attr.Name === 'email');
      const nameAttr = user.Attributes?.find((attr: any) => attr.Name === 'name');
      const subAttr = user.Attributes?.find((attr: any) => attr.Name === 'sub');
      const phoneAttr = user.Attributes?.find((attr: any) => attr.Name === 'phone_number');

      return {
        userId: subAttr?.Value || user.Username,
        email: emailAttr?.Value || '',
        name: nameAttr?.Value || '',
        phone: phoneAttr?.Value || '',
        isActive: user.Enabled || false,
        createdAt: user.UserCreateDate?.toISOString() || new Date().toISOString(),
        updatedAt: user.UserLastModifiedDate?.toISOString() || new Date().toISOString(),
      };
    });
  } catch (error) {
    console.error('Error getting users in group:', error);
    throw new Error(
      `Failed to get users in group ${groupName}: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Get all students from Cognito
 * 
 * @returns Array of student users
 * @throws Error if retrieval fails
 */
export async function getAllStudentsFromCognito(): Promise<any[]> {
  return await getUsersInGroup('students');
}

/**
 * Get all assistants from Cognito
 * 
 * @returns Array of assistant users
 * @throws Error if retrieval fails
 */
export async function getAllAssistantsFromCognito(): Promise<any[]> {
  return await getUsersInGroup('assistants');
}

/**
 * Enable a user in Cognito User Pool (activate account)
 * 
 * @param email - User's email address (username)
 * @throws Error if user activation fails
 */
export async function enableCognitoUser(email: string): Promise<void> {
  try {
    const enableUserCommand = new AdminEnableUserCommand({
      UserPoolId: env.cognitoUserPoolId,
      Username: email,
    });

    await cognitoClient.send(enableUserCommand);
  } catch (error) {
    console.error('Error enabling Cognito user:', error);
    throw new Error(
      `Failed to enable user in Cognito: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Disable a user in Cognito User Pool (deactivate account)
 * 
 * @param email - User's email address (username)
 * @throws Error if user deactivation fails
 */
export async function disableCognitoUser(email: string): Promise<void> {
  try {
    const disableUserCommand = new AdminDisableUserCommand({
      UserPoolId: env.cognitoUserPoolId,
      Username: email,
    });

    await cognitoClient.send(disableUserCommand);
  } catch (error) {
    console.error('Error disabling Cognito user:', error);
    throw new Error(
      `Failed to disable user in Cognito: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Enable multiple users in Cognito User Pool (bulk activation)
 * 
 * @param emails - Array of user email addresses (usernames)
 * @returns Array of results with success/failure status for each user
 */
export async function enableMultipleCognitoUsers(emails: string[]): Promise<Array<{email: string, success: boolean, error?: string}>> {
  const results = [];
  
  for (const email of emails) {
    try {
      await enableCognitoUser(email);
      results.push({ email, success: true });
    } catch (error) {
      results.push({ 
        email, 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  }
  
  return results;
}

/**
 * Disable multiple users in Cognito User Pool (bulk deactivation)
 * 
 * @param emails - Array of user email addresses (usernames)
 * @returns Array of results with success/failure status for each user
 */
export async function disableMultipleCognitoUsers(emails: string[]): Promise<Array<{email: string, success: boolean, error?: string}>> {
  const results = [];
  
  for (const email of emails) {
    try {
      await disableCognitoUser(email);
      results.push({ email, success: true });
    } catch (error) {
      results.push({ 
        email, 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  }
  
  return results;
}