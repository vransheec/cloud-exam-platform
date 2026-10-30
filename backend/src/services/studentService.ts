/**
 * Student Service
 * 
 * Handles CRUD operations for student profiles.
 * Students are linked to user accounts and contain additional profile information.
 */

import { Student } from '../models/types';
import { env } from '../config/env';
import {
  putItem,
  getItem,
  updateItem,
  deleteItem,
  scanItems,
  ItemNotFoundError,
  DuplicateItemError,
} from '../config/database';

/**
 * Create a new student profile
 * 
 * @param userId - Foreign key reference to the User record (Cognito sub)
 * @param email - Student's email address
 * @param name - Student's full name
 * @param isActive - Whether the student account is active (default: false)
 * @returns The created student object
 * @throws DuplicateItemError if student profile already exists for this user
 * @throws DatabaseError if creation fails
 */
export async function createStudent(
  userId: string,
  email: string,
  name: string,
  isActive: boolean = false
): Promise<Student> {
  // Check if student profile already exists for this user
  const existingStudent = await getStudent(userId);
  if (existingStudent) {
    throw new DuplicateItemError('Student', userId);
  }
  
  // Create new student object
  const student: Student = {
    userId,
    email,
    name,
    isActive,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  
  // Store student in database
  await putItem(env.studentsTable, student);
  
  return student;
}

/**
 * Get a student profile by user ID
 * 
 * @param userId - The user ID (primary key for students table)
 * @returns The student object or null if not found
 * @throws DatabaseError if retrieval fails
 */
export async function getStudent(userId: string): Promise<Student | null> {
  const student = await getItem<any>(env.studentsTable, { userId });
  
  if (!student) {
    return null;
  }
  
  // Remove deprecated fields (phone, linkedin) if they exist in old records
  const { phone, linkedin, ...cleanStudent } = student;
  
  return cleanStudent as Student;
}

/**
 * Update a student's profile information
 * 
 * @param userId - The user ID of the student to update
 * @param updates - Object containing fields to update
 * @returns The updated student object
 * @throws ItemNotFoundError if student doesn't exist
 * @throws DatabaseError if update fails
 */
export async function updateStudent(
  userId: string,
  updates: Partial<Omit<Student, 'userId' | 'createdAt'>>
): Promise<Student> {
  // Check if student exists
  const existingStudent = await getStudent(userId);
  if (!existingStudent) {
    throw new ItemNotFoundError('Student', userId);
  }
  
  // Add updatedAt timestamp
  const updatesWithTimestamp = {
    ...updates,
    updatedAt: new Date().toISOString(),
  };
  
  // Update student in database
  return await updateItem<Student>(
    env.studentsTable,
    { userId },
    updatesWithTimestamp
  );
}

/**
 * Activate a student account
 * 
 * @param userId - The user ID of the student to activate
 * @returns The updated student object
 * @throws ItemNotFoundError if student doesn't exist
 * @throws DatabaseError if update fails
 */
export async function activateStudent(userId: string): Promise<Student> {
  return await updateStudent(userId, { isActive: true });
}

/**
 * Deactivate a student account
 * 
 * @param userId - The user ID of the student to deactivate
 * @returns The updated student object
 * @throws ItemNotFoundError if student doesn't exist
 * @throws DatabaseError if update fails
 */
export async function deactivateStudent(userId: string): Promise<Student> {
  return await updateStudent(userId, { isActive: false });
}

/**
 * Check if a student account is active
 * 
 * @param userId - The user ID of the student to check
 * @returns true if student is active, false otherwise
 * @throws ItemNotFoundError if student doesn't exist
 * @throws DatabaseError if retrieval fails
 */
export async function isStudentActive(userId: string): Promise<boolean> {
  const student = await getStudent(userId);
  if (!student) {
    throw new ItemNotFoundError('Student', userId);
  }
  return student.isActive;
}

/**
 * Get all students
 * 
 * @returns Array of all student profiles
 * @throws DatabaseError if retrieval fails
 */
export async function getAllStudents(): Promise<Student[]> {
  const students = await scanItems<any>(env.studentsTable);
  
  // Remove deprecated fields (phone, linkedin) if they exist in old records
  return students.map(student => {
    const { phone, linkedin, ...cleanStudent } = student;
    return cleanStudent as Student;
  });
}

/**
 * Delete a student profile from DynamoDB
 * 
 * @param userId - The user ID of the student to delete
 * @throws ItemNotFoundError if student doesn't exist
 * @throws DatabaseError if deletion fails
 */
export async function deleteStudent(userId: string): Promise<void> {
  // Check if student exists
  const existingStudent = await getStudent(userId);
  if (!existingStudent) {
    throw new ItemNotFoundError('Student', userId);
  }
  
  // Delete student from database
  await deleteItem(env.studentsTable, { userId });
}
