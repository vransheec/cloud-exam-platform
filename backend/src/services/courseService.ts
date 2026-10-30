/**
 * Course Service
 * 
 * Handles course management operations including creating, updating,
 * deleting, and retrieving courses.
 */

import { getItem, putItem, deleteItem, scanItems, DuplicateItemError, ItemNotFoundError } from '../config/database';
import { env } from '../config/env';
import { Course } from '../models/types';

/**
 * Get all courses
 * 
 * @returns Array of all courses
 */
export async function getAllCourses(): Promise<Course[]> {
  const courses = await scanItems<Course>(env.coursesTable);
  return courses.sort((a: Course, b: Course) => a.code.localeCompare(b.code));
}

/**
 * Get a single course by code
 * 
 * @param code - Course code
 * @returns Course object or null if not found
 */
export async function getCourse(code: string): Promise<Course | null> {
  return await getItem<Course>(env.coursesTable, { code });
}

/**
 * Validate that a course code exists
 * 
 * @param code - Course code to validate
 * @returns true if course exists, false otherwise
 */
export async function validateCourseCode(code: string): Promise<boolean> {
  const course = await getCourse(code);
  return course !== null;
}

/**
 * Create a new course
 * 
 * @param code - Unique course code
 * @param name - Course name
 * @param provider - Course provider (e.g., AWS, Azure, GCP)
 * @param description - Course description
 * @returns Created course object
 * @throws DuplicateItemError if course code already exists
 */
export async function createCourse(
  code: string,
  name: string,
  provider: string,
  description: string,
  examQuestionCount: number = 50,
  passingPercentage: number = 70
): Promise<Course> {
  // Check if course already exists
  const existing = await getCourse(code);
  if (existing) {
    throw new DuplicateItemError('Course', code);
  }

  const course: Course = {
    code: code.toUpperCase(),
    name,
    provider: provider as any, // Type assertion for backward compatibility
    description,
    examQuestionCount,
    passingPercentage,
  };

  await putItem(env.coursesTable, course);
  return course;
}

/**
 * Update an existing course
 * 
 * @param code - Course code
 * @param updates - Fields to update
 * @returns Updated course object
 * @throws ItemNotFoundError if course doesn't exist
 */
export async function updateCourse(
  code: string,
  updates: Partial<Pick<Course, 'name' | 'provider' | 'description' | 'examQuestionCount' | 'passingPercentage' | 'badgeImageUrl' | 'reviewModeEnabled' | 'timeLimitMinutes'>>
): Promise<Course> {
  const course = await getCourse(code);
  if (!course) {
    throw new ItemNotFoundError('Course', code);
  }

  const updatedCourse: Course = {
    ...course,
    ...updates,
  };

  await putItem(env.coursesTable, updatedCourse);
  return updatedCourse;
}

/**
 * Delete a course
 * 
 * Note: This will not delete associated questions or enrollments.
 * Consider checking for dependencies before deletion.
 * 
 * @param code - Course code
 * @throws ItemNotFoundError if course doesn't exist
 */
export async function deleteCourse(code: string): Promise<void> {
  const course = await getCourse(code);
  if (!course) {
    throw new ItemNotFoundError('Course', code);
  }

  await deleteItem(env.coursesTable, { code });
}
