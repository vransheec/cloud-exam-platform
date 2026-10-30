/**
 * Enrollment Service
 * 
 * Handles CRUD operations for student enrollments.
 * Manages course enrollments with time-based access control.
 */

import { Enrollment } from '../models/types';
import { v4 as uuidv4 } from 'uuid';
import { env } from '../config/env';
import {
  putItem,
  getItem,
  queryItems,
  updateItem,
  deleteItem,
  DatabaseError,
  ItemNotFoundError,
} from '../config/database';
import { validateCourseCode } from './courseService';

/**
 * Calculate access dates based on course start date
 * Access starts on the same day as course start, ends 2 months later
 * 
 * @param startDate - The course start date
 * @returns Object with accessStartDate and accessEndDate
 */
function calculateAccessDates(startDate: Date): {
  accessStartDate: Date;
  accessEndDate: Date;
} {
  // Access starts on the same day as course start
  const accessStartDate = new Date(startDate);
  
  // Access ends 2 months after course start
  const accessEndDate = new Date(startDate);
  accessEndDate.setMonth(accessEndDate.getMonth() + 2);
  
  return { accessStartDate, accessEndDate };
}

/**
 * Create a new enrollment
 * 
 * @param studentId - The student's user ID
 * @param courseCode - The course code to enroll in
 * @param courseSection - The course section identifier
 * @param startDate - The course start date
 * @param accessStartDate - Optional access start date (defaults to startDate if not provided)
 * @param accessEndDate - Optional access end date (defaults to 3 weeks after startDate if not provided)
 * @returns The created enrollment object
 * @throws DatabaseError if course code is invalid or creation fails
 */
export async function createEnrollment(
  studentId: string,
  courseCode: string,
  courseSection: string,
  startDate: Date,
  accessStartDate?: Date,
  accessEndDate?: Date
): Promise<Enrollment> {
  // Validate course code exists
  const courseExists = await validateCourseCode(courseCode);
  if (!courseExists) {
    throw new DatabaseError(`Invalid course code: ${courseCode}`);
  }
  
  // Check if student is already enrolled in this course
  const existingEnrollments = await getEnrollments(studentId);
  const existingEnrollment = existingEnrollments.find(enrollment => enrollment.courseCode === courseCode);
  
  if (existingEnrollment) {
    // If the existing enrollment is a trial, allow upgrade to full by removing the trial
    if (existingEnrollment.enrollmentType === 'trial') {
      console.log(`Upgrading trial enrollment ${existingEnrollment.id} to full for student ${studentId} in course ${courseCode}`);
      await deleteItem(env.enrollmentsTable, { id: existingEnrollment.id });
    } else {
      throw new DatabaseError(`Student is already enrolled in course ${courseCode}`);
    }
  }
  
  // Use provided accessStartDate or default to startDate
  const finalAccessStartDate = accessStartDate || startDate;
  
  // Use provided accessEndDate or default to 3 weeks after startDate
  let finalAccessEndDate: Date;
  if (accessEndDate) {
    finalAccessEndDate = accessEndDate;
  } else {
    finalAccessEndDate = new Date(startDate);
    finalAccessEndDate.setDate(finalAccessEndDate.getDate() + 21);
  }
  
  // Create new enrollment object with dates as ISO strings for DynamoDB
  const enrollment: any = {
    id: uuidv4(),
    studentId,
    courseCode,
    courseSection,
    startDate: startDate.toISOString(),
    accessStartDate: finalAccessStartDate.toISOString(),
    accessEndDate: finalAccessEndDate.toISOString(),
    enrolledAt: new Date().toISOString(),
  };
  
  // Store enrollment in database
  await putItem(env.enrollmentsTable, enrollment);
  
  // Return with Date objects for TypeScript compatibility
  return {
    ...enrollment,
    startDate,
    accessStartDate: finalAccessStartDate,
    accessEndDate: finalAccessEndDate,
    enrolledAt: new Date(enrollment.enrolledAt),
  };
}

/**
 * Get an enrollment by ID
 * 
 * @param enrollmentId - The enrollment ID
 * @returns The enrollment object or null if not found
 * @throws DatabaseError if retrieval fails
 */
export async function getEnrollment(enrollmentId: string): Promise<Enrollment | null> {
  return await getItem<Enrollment>(env.enrollmentsTable, { id: enrollmentId });
}

/**
 * Get all enrollments for a student
 * 
 * @param studentId - The student's user ID
 * @returns Array of enrollments for the student
 * @throws DatabaseError if retrieval fails
 */
export async function getEnrollments(studentId: string): Promise<Enrollment[]> {
  const enrollments = await queryItems<any>(
    env.enrollmentsTable,
    'studentId = :studentId',
    { ':studentId': studentId },
    'studentId-courseCode-index' // Use the correct GSI name from database template
  );
  
  // Convert dates to ISO strings if they're not already
  return enrollments.map((enrollment: any) => {
    const normalizeDate = (dateValue: any): string => {
      // If it's already a valid ISO string, return it
      if (typeof dateValue === 'string') {
        const date = new Date(dateValue);
        if (!isNaN(date.getTime())) {
          return dateValue;
        }
      }
      
      // If it's a Date object or timestamp, convert to ISO string
      if (dateValue instanceof Date) {
        return dateValue.toISOString();
      }
      
      // If it's a number (timestamp), convert to ISO string
      if (typeof dateValue === 'number') {
        return new Date(dateValue).toISOString();
      }
      
      // If it's an object with date properties (old DynamoDB format), try to parse it
      if (typeof dateValue === 'object' && dateValue !== null) {
        // This handles the case where DynamoDB stored Date objects as complex objects
        const dateStr = JSON.stringify(dateValue);
        const date = new Date(dateStr);
        if (!isNaN(date.getTime())) {
          return date.toISOString();
        }
      }
      
      // If all else fails, return current date as fallback
      console.warn('Invalid date format detected, using current date as fallback:', dateValue);
      return new Date().toISOString();
    };
    
    return {
      ...enrollment,
      startDate: normalizeDate(enrollment.startDate),
      accessStartDate: normalizeDate(enrollment.accessStartDate),
      accessEndDate: normalizeDate(enrollment.accessEndDate),
      enrolledAt: normalizeDate(enrollment.enrolledAt),
    };
  });
}

/**
 * Update an enrollment
 * 
 * @param enrollmentId - The enrollment ID to update
 * @param updates - Fields to update
 * @returns The updated enrollment object
 * @throws ItemNotFoundError if enrollment doesn't exist
 * @throws DatabaseError if update fails
 */
export async function updateEnrollment(
  enrollmentId: string,
  updates: Partial<Omit<Enrollment, 'id' | 'enrolledAt'>>
): Promise<Enrollment> {
  // Check if enrollment exists
  const existing = await getEnrollment(enrollmentId);
  if (!existing) {
    throw new ItemNotFoundError('Enrollment', enrollmentId);
  }
  
  // If startDate is being updated, recalculate access dates
  let finalUpdates = { ...updates };
  if (updates.startDate) {
    const { accessStartDate, accessEndDate } = calculateAccessDates(new Date(updates.startDate));
    finalUpdates = {
      ...finalUpdates,
      accessStartDate: accessStartDate.toISOString(),
      accessEndDate: accessEndDate.toISOString(),
    };
  }
  
  // Update enrollment in database
  return await updateItem<Enrollment>(
    env.enrollmentsTable,
    { id: enrollmentId },
    finalUpdates
  );
}

/**
 * Save an enrollment (for backward compatibility with tests)
 * 
 * @param enrollmentData - Enrollment data without ID
 * @returns The saved enrollment with generated ID
 */
export async function saveEnrollment(
  enrollmentData: Omit<Enrollment, 'id'>
): Promise<Enrollment> {
  // Generate ID for the enrollment
  const enrollmentId = uuidv4();
  
  // Create the complete enrollment object
  const enrollment: Enrollment = {
    id: enrollmentId,
    ...enrollmentData
  };
  
  // Store the enrollment
  await putItem(env.enrollmentsTable, enrollment);
  
  return enrollment;
}
