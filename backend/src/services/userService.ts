/**
 * User Service
 * 
 * Handles CRUD operations for users (operators, assistants, students).
 * Provides functions to create, retrieve, and update user accounts.
 */

import { User, UserRole } from '../models/types';
import { v4 as uuidv4 } from 'uuid';
import { env } from '../config/env';
import {
  putItem,
  getItem,
  updateItem,
  queryItems,
  DatabaseError,
  ItemNotFoundError,
  DuplicateItemError,
} from '../config/database';

/**
 * Create a new user
 * 
 * @param email - User's email address (must be unique)
 * @param passwordHash - Hashed password for authentication
 * @param role - User's role (operator, assistant, or student)
 * @returns The created user object
 * @throws DuplicateItemError if email already exists
 * @throws DatabaseError if creation fails
 */
export async function createUser(
  email: string,
  passwordHash: string,
  role: UserRole
): Promise<User> {
  // Check if user with this email already exists
  const existingUser = await getUserByEmail(email);
  if (existingUser) {
    throw new DuplicateItemError('User', email);
  }
  
  // Create new user object
  const user: User = {
    id: uuidv4(),
    email,
    passwordHash,
    role,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  
  // Store user in database
  await putItem(env.usersTable, user);
  
  return user;
}

/**
 * Get a user by ID
 * 
 * @param userId - The unique identifier of the user
 * @returns The user object or null if not found
 * @throws DatabaseError if retrieval fails
 */
export async function getUser(userId: string): Promise<User | null> {
  return await getItem<User>(env.usersTable, { id: userId });
}

/**
 * Get a user by email address
 * 
 * @param email - The email address to search for
 * @returns The user object or null if not found
 * @throws DatabaseError if retrieval fails
 */
export async function getUserByEmail(email: string): Promise<User | null> {
  try {
    // Query using GSI on email field
    const users = await queryItems<User>(
      env.usersTable,
      '#email = :email',
      { ':email': email },
      'EmailIndex', // Assumes GSI named 'EmailIndex' on email field
      { '#email': 'email' }
    );
    
    return users.length > 0 ? users[0] : null;
  } catch (error) {
    // If GSI doesn't exist, fall back to scan (less efficient)
    // This is a fallback for development/testing
    throw new DatabaseError(
      `Failed to get user by email: ${(error as Error).message}`,
      error as Error
    );
  }
}

/**
 * Update a user's information
 * 
 * @param userId - The unique identifier of the user
 * @param updates - Object containing fields to update
 * @returns The updated user object
 * @throws ItemNotFoundError if user doesn't exist
 * @throws DatabaseError if update fails
 */
export async function updateUser(
  userId: string,
  updates: Partial<Omit<User, 'id' | 'createdAt'>>
): Promise<User> {
  // Check if user exists
  const existingUser = await getUser(userId);
  if (!existingUser) {
    throw new ItemNotFoundError('User', userId);
  }
  
  // Add updatedAt timestamp
  const updatesWithTimestamp = {
    ...updates,
    updatedAt: new Date().toISOString(),
  };
  
  // Update user in database
  return await updateItem<User>(
    env.usersTable,
    { id: userId },
    updatesWithTimestamp
  );
}
