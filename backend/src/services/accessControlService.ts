/**
 * Access Control Service
 * 
 * Handles access control logic for students accessing courses.
 * Checks both student activation status and time-based enrollment access.
 * Updated to work with Cognito-only users.
 */

import { AccessStatus } from '../models/types';
import { getEnrollments } from './enrollmentService';

/**
 * Check if a student has access to a specific course
 * 
 * This function checks:
 * 1. If the student is enrolled in the course
 * 2. If the current date is within the enrollment access period
 * 
 * Note: Since we're using Cognito-only users, we assume all authenticated 
 * students are active (Cognito handles account status).
 * 
 * @param studentId - The student's user ID (Cognito sub)
 * @param courseCode - The course code to check access for
 * @returns AccessStatus object with access decision and reason
 */
export async function checkCourseAccess(
  studentId: string,
  courseCode: string
): Promise<AccessStatus> {
  // Get all enrollments for the student
  const enrollments = await getEnrollments(studentId);
  
  // Find enrollment for the requested course
  const enrollment = enrollments.find((e) => e.courseCode === courseCode);
  
  if (!enrollment) {
    return {
      hasAccess: false,
      reason: 'You are not enrolled in this course',
      expiresAt: null,
    };
  }
  
  // Check if access period is valid
  const now = new Date();
  const accessStart = new Date(enrollment.accessStartDate);
  const accessEnd = new Date(enrollment.accessEndDate);
  
  if (now < accessStart) {
    return {
      hasAccess: false,
      reason: `Access to this course begins on ${accessStart.toLocaleDateString()}`,
      expiresAt: accessEnd.toISOString(),
    };
  }
  
  if (now > accessEnd) {
    return {
      hasAccess: false,
      reason: `Access to this course expired on ${accessEnd.toLocaleDateString()}`,
      expiresAt: null,
    };
  }
  
  // Student has access
  return {
    hasAccess: true,
    reason: 'Access granted',
    expiresAt: accessEnd.toISOString(),
  };
}

/**
 * Check if a student can access the platform at all
 * 
 * Since we're using Cognito-only users, authenticated students are considered active.
 * 
 * @returns AccessStatus object with access decision and reason
 */
export async function checkPlatformAccess(): Promise<AccessStatus> {
  // With Cognito-only users, if they're authenticated, they have platform access
  return {
    hasAccess: true,
    reason: 'Access granted',
    expiresAt: null,
  };
}

/**
 * Get all courses a student has access to
 * 
 * Returns only courses where:
 * 1. Student is enrolled
 * 2. Current date is within access period
 * 
 * @param studentId - The student's user ID (Cognito sub)
 * @returns Array of course codes the student can access
 */
export async function getAccessibleCourses(
  studentId: string
): Promise<string[]> {
  // Get all enrollments
  const enrollments = await getEnrollments(studentId);
  
  // Filter enrollments by access period
  const now = new Date();
  const accessibleCourses = enrollments
    .filter((enrollment) => {
      const accessStart = new Date(enrollment.accessStartDate);
      const accessEnd = new Date(enrollment.accessEndDate);
      return now >= accessStart && now <= accessEnd;
    })
    .map((enrollment) => enrollment.courseCode);
  
  return accessibleCourses;
}
