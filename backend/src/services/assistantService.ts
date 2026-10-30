/**
 * Assistant Service
 * 
 * Handles assistant user management operations using Cognito-only approach.
 */

import {
  CognitoIdentityProviderClient,
  AdminGetUserCommand,
  AdminListGroupsForUserCommand,
  AdminUpdateUserAttributesCommand,
  AdminDeleteUserCommand,
  AdminSetUserPasswordCommand,
  ListUsersInGroupCommand,
  ListUsersCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { DuplicateItemError, ItemNotFoundError } from '../config/database';

const cognito = new CognitoIdentityProviderClient({ region: process.env.COGNITO_REGION || 'us-east-1' });

/**
 * Assistant User interface
 */
export interface AssistantUser {
  id: string;
  email: string;
  userType: 'assistant';
  name?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Get all assistants from Cognito
 * 
 * @returns Array of all assistant users
 */
export async function getAllAssistants(): Promise<AssistantUser[]> {
  try {
    // Get all users in the assistants group
    const groupParams = {
      GroupName: 'assistants',
      UserPoolId: process.env.COGNITO_USER_POOL_ID!,
    };

    const command = new ListUsersInGroupCommand(groupParams);
    const groupUsers = await cognito.send(command);
    
    const assistants: AssistantUser[] = [];
    
    for (const user of groupUsers.Users || []) {
      const nameAttr = user.Attributes?.find(attr => attr.Name === 'name');
      const emailAttr = user.Attributes?.find(attr => attr.Name === 'email');
      
      assistants.push({
        id: user.Username!,
        email: emailAttr?.Value || '',
        userType: 'assistant',
        name: nameAttr?.Value,
        createdAt: user.UserCreateDate?.toISOString() || new Date().toISOString(),
        updatedAt: user.UserLastModifiedDate?.toISOString() || new Date().toISOString(),
      });
    }
    
    return assistants;
  } catch (error) {
    console.error('Error getting assistants from Cognito:', error);
    throw error;
  }
}

/**
 * Get a single assistant by ID from Cognito
 * 
 * @param id - Assistant user ID (Cognito username)
 * @returns Assistant user or null if not found
 */
export async function getAssistant(id: string): Promise<AssistantUser | null> {
  try {
    const userParams = {
      UserPoolId: process.env.COGNITO_USER_POOL_ID!,
      Username: id,
    };

    const getUserCommand = new AdminGetUserCommand(userParams);
    const userDetails = await cognito.send(getUserCommand);
    
    // Check if user is in assistants group
    const getGroupsCommand = new AdminListGroupsForUserCommand(userParams);
    const groupsResult = await cognito.send(getGroupsCommand);
    const isAssistant = groupsResult.Groups?.some(group => group.GroupName === 'assistants');
    
    if (!isAssistant) {
      return null;
    }
    
    const nameAttr = userDetails.UserAttributes?.find(attr => attr.Name === 'name');
    const emailAttr = userDetails.UserAttributes?.find(attr => attr.Name === 'email');
    
    return {
      id: userDetails.Username!,
      email: emailAttr?.Value || '',
      userType: 'assistant',
      name: nameAttr?.Value,
      createdAt: userDetails.UserCreateDate?.toISOString() || new Date().toISOString(),
      updatedAt: userDetails.UserLastModifiedDate?.toISOString() || new Date().toISOString(),
    };
  } catch (error: any) {
    if (error.name === 'UserNotFoundException') {
      return null;
    }
    console.error('Error getting assistant from Cognito:', error);
    throw error;
  }
}

/**
 * Get assistant by email from Cognito
 * 
 * @param email - Assistant email
 * @returns Assistant user or null if not found
 */
export async function getAssistantByEmail(email: string): Promise<AssistantUser | null> {
  try {
    // Use ListUsers with email filter instead of AdminGetUser
    const listUsersCommand = new ListUsersCommand({
      UserPoolId: process.env.COGNITO_USER_POOL_ID!,
      Filter: `email = "${email}"`,
    });
    
    const listUsersResult = await cognito.send(listUsersCommand);
    
    if (!listUsersResult.Users || listUsersResult.Users.length === 0) {
      return null;
    }
    
    const user = listUsersResult.Users[0];
    
    // Check if user is in assistants group
    const getGroupsCommand = new AdminListGroupsForUserCommand({
      UserPoolId: process.env.COGNITO_USER_POOL_ID!,
      Username: user.Username!,
    });
    const groupsResult = await cognito.send(getGroupsCommand);
    const isAssistant = groupsResult.Groups?.some(group => group.GroupName === 'assistants');
    
    if (!isAssistant) {
      return null;
    }
    
    const nameAttr = user.Attributes?.find(attr => attr.Name === 'name');
    const emailAttr = user.Attributes?.find(attr => attr.Name === 'email');
    
    return {
      id: user.Username!,
      email: emailAttr?.Value || '',
      userType: 'assistant',
      name: nameAttr?.Value,
      createdAt: user.UserCreateDate?.toISOString() || new Date().toISOString(),
      updatedAt: user.UserLastModifiedDate?.toISOString() || new Date().toISOString(),
    };
  } catch (error: any) {
    console.error('Error getting assistant by email from Cognito:', error);
    throw error;
  }
}

/**
 * Create a new assistant user in Cognito
 * 
 * @param email - Assistant email
 * @param password - Plain text password
 * @param name - Optional assistant name
 * @returns Created assistant user
 * @throws DuplicateItemError if email already exists
 */
export async function createAssistant(
  email: string,
  password: string,
  name?: string
): Promise<AssistantUser> {
  try {
    // Check if user already exists
    const existing = await getAssistantByEmail(email);
    if (existing) {
      throw new DuplicateItemError('Assistant', email);
    }

    // Create user in Cognito using the cognitoService
    const { createCognitoUser } = await import('./cognitoService');
    const cognitoSub = await createCognitoUser(email, password, 'assistant', name);

    // Return the created assistant info
    return {
      id: cognitoSub,
      email: email,
      userType: 'assistant',
      name: name,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  } catch (error: any) {
    console.error('Error creating assistant:', error);
    throw error;
  }
}

/**
 * Update an existing assistant in Cognito
 * 
 * @param id - Assistant user ID (Cognito username)
 * @param updates - Fields to update
 * @returns Updated assistant user
 * @throws ItemNotFoundError if assistant doesn't exist
 */
export async function updateAssistant(
  id: string,
  updates: { name?: string; email?: string }
): Promise<AssistantUser> {
  try {
    // Check if user exists and is an assistant
    const assistant = await getAssistant(id);
    if (!assistant) {
      throw new ItemNotFoundError('Assistant', id);
    }

    // If email is being updated, check for duplicates
    if (updates.email && updates.email !== assistant.email) {
      const existing = await getAssistantByEmail(updates.email);
      if (existing) {
        throw new DuplicateItemError('Assistant', updates.email);
      }
    }

    // Update user attributes in Cognito
    const attributesToUpdate = [];
    
    if (updates.name) {
      attributesToUpdate.push({
        Name: 'name',
        Value: updates.name,
      });
    }
    
    if (updates.email) {
      attributesToUpdate.push({
        Name: 'email',
        Value: updates.email,
      });
    }

    if (attributesToUpdate.length > 0) {
      const updateCommand = new AdminUpdateUserAttributesCommand({
        UserPoolId: process.env.COGNITO_USER_POOL_ID!,
        Username: id,
        UserAttributes: attributesToUpdate,
      });
      await cognito.send(updateCommand);
    }

    // Return updated assistant
    return await getAssistant(id) || assistant;
  } catch (error: any) {
    if (error.name === 'UserNotFoundException') {
      throw new ItemNotFoundError('Assistant', id);
    }
    console.error('Error updating assistant:', error);
    throw error;
  }
}

/**
 * Delete an assistant user from Cognito
 * 
 * @param id - Assistant user ID (Cognito username)
 * @throws ItemNotFoundError if assistant doesn't exist
 */
export async function deleteAssistant(id: string): Promise<void> {
  try {
    // Check if user exists and is an assistant
    const assistant = await getAssistant(id);
    if (!assistant) {
      throw new ItemNotFoundError('Assistant', id);
    }

    // Delete user from Cognito
    const deleteCommand = new AdminDeleteUserCommand({
      UserPoolId: process.env.COGNITO_USER_POOL_ID!,
      Username: id,
    });
    await cognito.send(deleteCommand);
  } catch (error: any) {
    if (error.name === 'UserNotFoundException') {
      throw new ItemNotFoundError('Assistant', id);
    }
    console.error('Error deleting assistant:', error);
    throw error;
  }
}

/**
 * Reset assistant password in Cognito
 * 
 * @param id - Assistant user ID (Cognito username)
 * @param newPassword - New plain text password
 * @returns Updated assistant user
 * @throws ItemNotFoundError if assistant doesn't exist
 */
export async function resetAssistantPassword(
  id: string,
  newPassword: string
): Promise<AssistantUser> {
  try {
    // Check if user exists and is an assistant
    const assistant = await getAssistant(id);
    if (!assistant) {
      throw new ItemNotFoundError('Assistant', id);
    }

    // Reset password in Cognito
    const setPasswordCommand = new AdminSetUserPasswordCommand({
      UserPoolId: process.env.COGNITO_USER_POOL_ID!,
      Username: id,
      Password: newPassword,
      Permanent: true,
    });
    await cognito.send(setPasswordCommand);

    // Return updated assistant (password change doesn't affect other attributes)
    return assistant;
  } catch (error: any) {
    if (error.name === 'UserNotFoundException') {
      throw new ItemNotFoundError('Assistant', id);
    }
    console.error('Error resetting assistant password:', error);
    throw error;
  }
}
