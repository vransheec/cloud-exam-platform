/**
 * Authentication Types
 * 
 * Type definitions for authentication-related data structures.
 */

export type UserRole = 'operator' | 'assistant' | 'student';

export interface AuthResponse {
  success: boolean;
  token: string;
  userId: string;
  userType: UserRole;
}

export interface User {
  userId: string;
  email: string;
  role: UserRole;
  name?: string;
  phone?: string;
  linkedin?: string;
  isActive?: boolean;
}

export interface LoginCredentials {
  email: string;
  password: string;
}
