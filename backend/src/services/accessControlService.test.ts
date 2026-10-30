/**
 * Access Control Service Tests
 * 
 * Tests for access control logic including student activation
 * and time-based enrollment access.
 */

import * as fc from 'fast-check';
import {
  checkCourseAccess,
  checkPlatformAccess,
  getAccessibleCourses,
} from './accessControlService';
import { getStudent } from './studentService';
import { getEnrollments } from './enrollmentService';

// Mock the database functions
jest.mock('../config/database');
jest.mock('./studentService');
jest.mock('./enrollmentService');

describe('Access Control Service', () => {
  describe('checkPlatformAccess', () => {
    it('should grant access to active students', async () => {
      // Mock active student
      (getStudent as jest.Mock).mockResolvedValue({
        userId: 'student-1',
        name: 'Test Student',
        phone: '123-456-7890',
        linkedin: 'https://linkedin.com/in/test',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await checkPlatformAccess('student-1');

      expect(result.hasAccess).toBe(true);
      expect(result.reason).toBe('Access granted');
    });

    it('should deny access to inactive students', async () => {
      // Mock inactive student
      (getStudent as jest.Mock).mockResolvedValue({
        userId: 'student-2',
        name: 'Inactive Student',
        phone: '123-456-7890',
        linkedin: 'https://linkedin.com/in/test',
        isActive: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await checkPlatformAccess('student-2');

      expect(result.hasAccess).toBe(false);
      expect(result.reason).toBe('Account is not active, please contact administrator');
    });
  });

  describe('checkCourseAccess', () => {
    it('should grant access when student is active and within access period', async () => {
      // Mock active student
      (getStudent as jest.Mock).mockResolvedValue({
        userId: 'student-1',
        name: 'Test Student',
        phone: '123-456-7890',
        linkedin: 'https://linkedin.com/in/test',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Mock enrollment with valid access period
      const now = new Date();
      const accessStart = new Date(now);
      accessStart.setDate(accessStart.getDate() - 10); // 10 days ago
      const accessEnd = new Date(now);
      accessEnd.setDate(accessEnd.getDate() + 20); // 20 days from now

      (getEnrollments as jest.Mock).mockResolvedValue([
        {
          id: 'enrollment-1',
          studentId: 'student-1',
          courseCode: 'CLF',
          startDate: new Date(),
          accessStartDate: accessStart,
          accessEndDate: accessEnd,
          enrolledAt: new Date(),
        },
      ]);

      const result = await checkCourseAccess('student-1', 'CLF');

      expect(result.hasAccess).toBe(true);
      expect(result.reason).toBe('Access granted');
      expect(result.expiresAt).toEqual(accessEnd);
    });

    it('should deny access when student is inactive', async () => {
      // Mock inactive student
      (getStudent as jest.Mock).mockResolvedValue({
        userId: 'student-2',
        name: 'Inactive Student',
        phone: '123-456-7890',
        linkedin: 'https://linkedin.com/in/test',
        isActive: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await checkCourseAccess('student-2', 'CLF');

      expect(result.hasAccess).toBe(false);
      expect(result.reason).toBe('Account is not active, please contact administrator');
    });

    it('should deny access when student is not enrolled in course', async () => {
      // Mock active student
      (getStudent as jest.Mock).mockResolvedValue({
        userId: 'student-1',
        name: 'Test Student',
        phone: '123-456-7890',
        linkedin: 'https://linkedin.com/in/test',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Mock empty enrollments
      (getEnrollments as jest.Mock).mockResolvedValue([]);

      const result = await checkCourseAccess('student-1', 'CLF');

      expect(result.hasAccess).toBe(false);
      expect(result.reason).toBe('You are not enrolled in this course');
    });

    it('should deny access when access period has not started', async () => {
      // Mock active student
      (getStudent as jest.Mock).mockResolvedValue({
        userId: 'student-1',
        name: 'Test Student',
        phone: '123-456-7890',
        linkedin: 'https://linkedin.com/in/test',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Mock enrollment with future access period
      const now = new Date();
      const accessStart = new Date(now);
      accessStart.setDate(accessStart.getDate() + 10); // 10 days from now
      const accessEnd = new Date(accessStart);
      accessEnd.setDate(accessEnd.getDate() + 30); // 30 days after start

      (getEnrollments as jest.Mock).mockResolvedValue([
        {
          id: 'enrollment-1',
          studentId: 'student-1',
          courseCode: 'CLF',
          startDate: new Date(),
          accessStartDate: accessStart,
          accessEndDate: accessEnd,
          enrolledAt: new Date(),
        },
      ]);

      const result = await checkCourseAccess('student-1', 'CLF');

      expect(result.hasAccess).toBe(false);
      expect(result.reason).toContain('Access to this course begins on');
    });

    it('should deny access when access period has expired', async () => {
      // Mock active student
      (getStudent as jest.Mock).mockResolvedValue({
        userId: 'student-1',
        name: 'Test Student',
        phone: '123-456-7890',
        linkedin: 'https://linkedin.com/in/test',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Mock enrollment with expired access period
      const now = new Date();
      const accessStart = new Date(now);
      accessStart.setDate(accessStart.getDate() - 40); // 40 days ago
      const accessEnd = new Date(accessStart);
      accessEnd.setDate(accessEnd.getDate() + 30); // 30 days after start (10 days ago)

      (getEnrollments as jest.Mock).mockResolvedValue([
        {
          id: 'enrollment-1',
          studentId: 'student-1',
          courseCode: 'CLF',
          startDate: new Date(),
          accessStartDate: accessStart,
          accessEndDate: accessEnd,
          enrolledAt: new Date(),
        },
      ]);

      const result = await checkCourseAccess('student-1', 'CLF');

      expect(result.hasAccess).toBe(false);
      expect(result.reason).toContain('Access to this course expired on');
    });
  });

  describe('getAccessibleCourses', () => {
    it('should return courses within access period for active students', async () => {
      // Mock active student
      (getStudent as jest.Mock).mockResolvedValue({
        userId: 'student-1',
        name: 'Test Student',
        phone: '123-456-7890',
        linkedin: 'https://linkedin.com/in/test',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Mock multiple enrollments with different access periods
      const now = new Date();
      
      const validAccessStart = new Date(now);
      validAccessStart.setDate(validAccessStart.getDate() - 10);
      const validAccessEnd = new Date(now);
      validAccessEnd.setDate(validAccessEnd.getDate() + 20);

      const expiredAccessStart = new Date(now);
      expiredAccessStart.setDate(expiredAccessStart.getDate() - 40);
      const expiredAccessEnd = new Date(now);
      expiredAccessEnd.setDate(expiredAccessEnd.getDate() - 10);

      (getEnrollments as jest.Mock).mockResolvedValue([
        {
          id: 'enrollment-1',
          studentId: 'student-1',
          courseCode: 'CLF',
          startDate: new Date(),
          accessStartDate: validAccessStart,
          accessEndDate: validAccessEnd,
          enrolledAt: new Date(),
        },
        {
          id: 'enrollment-2',
          studentId: 'student-1',
          courseCode: 'SAA',
          startDate: new Date(),
          accessStartDate: expiredAccessStart,
          accessEndDate: expiredAccessEnd,
          enrolledAt: new Date(),
        },
      ]);

      const result = await getAccessibleCourses('student-1');

      expect(result).toEqual(['CLF']);
      expect(result).not.toContain('SAA');
    });

    it('should return empty array for inactive students', async () => {
      // Mock inactive student
      (getStudent as jest.Mock).mockResolvedValue({
        userId: 'student-2',
        name: 'Inactive Student',
        phone: '123-456-7890',
        linkedin: 'https://linkedin.com/in/test',
        isActive: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await getAccessibleCourses('student-2');

      expect(result).toEqual([]);
    });
  });

  // Feature: cloud-exam-platform, Property 20: Account activation grants access
  describe('Property-Based Test: Account activation grants access', () => {
    /**
     * Supported course codes for validation
     */
    const SUPPORTED_COURSE_CODES = [
      'CLF', 'DVA', 'SAA', 'DEA', 'SOA',  // AWS
      'AZ900', 'AZ104', 'AZ204',           // Azure
      'GCDL', 'GCE'                        // GCP
    ];

    /**
     * Generator for valid course codes
     */
    const courseCodeArbitrary = fc.constantFrom(...SUPPORTED_COURSE_CODES);

    /**
     * Generator for student IDs (UUIDs)
     */
    const studentIdArbitrary = fc.uuid();

    /**
     * Generator for student profile data
     */
    const studentProfileArbitrary = fc.record({
      userId: studentIdArbitrary,
      name: fc.string({ minLength: 1, maxLength: 100 }),
      phone: fc.string({ minLength: 10, maxLength: 20 }),
      linkedin: fc.webUrl(),
      createdAt: fc.date(),
      updatedAt: fc.date()
    });

    /**
     * Generator for enrollment with valid access period (currently active)
     * Creates enrollments where the current date is within the access period
     */
    const activeEnrollmentArbitrary = fc.tuple(
      fc.uuid(),
      courseCodeArbitrary,
      fc.date()
    ).map(([id, courseCode, enrolledAt]) => {
      // Create enrollment with access period that includes current date
      const now = new Date();
      
      // Access started 10 days ago
      const accessStartDate = new Date(now);
      accessStartDate.setDate(accessStartDate.getDate() - 10);
      
      // Access ends 20 days from now
      const accessEndDate = new Date(now);
      accessEndDate.setDate(accessEndDate.getDate() + 20);
      
      // Start date is 1 month before access start
      const startDate = new Date(accessStartDate);
      startDate.setMonth(startDate.getMonth() - 1);
      
      return {
        id,
        studentId: '', // Will be set in the test
        courseCode,
        startDate,
        accessStartDate,
        accessEndDate,
        enrolledAt
      };
    });

    test('activating student account grants access to enrolled courses', async () => {
      await fc.assert(
        fc.asyncProperty(
          studentProfileArbitrary,
          fc.array(activeEnrollmentArbitrary, { minLength: 1, maxLength: 5 }),
          async (studentProfile, enrollments) => {
            // Ensure all enrollments have the same studentId and unique course codes
            const studentId = studentProfile.userId;
            const uniqueCourseCodes = new Set<string>();
            const normalizedEnrollments = enrollments
              .filter(e => {
                if (uniqueCourseCodes.has(e.courseCode)) {
                  return false; // Skip duplicate course codes
                }
                uniqueCourseCodes.add(e.courseCode);
                return true;
              })
              .map(e => ({
                ...e,
                studentId
              }));

            // Skip if no enrollments after deduplication
            if (normalizedEnrollments.length === 0) {
              return true;
            }

            // Test 1: Inactive student should not have access
            const inactiveStudent = { ...studentProfile, isActive: false };
            (getStudent as jest.Mock).mockResolvedValue(inactiveStudent);
            (getEnrollments as jest.Mock).mockResolvedValue(normalizedEnrollments);

            const accessBeforeActivation = await checkCourseAccess(
              studentId,
              normalizedEnrollments[0].courseCode
            );

            // Should be denied due to inactive account
            if (accessBeforeActivation.hasAccess) {
              return false;
            }

            // Test 2: Activate student account
            const activeStudent = { ...studentProfile, isActive: true };
            (getStudent as jest.Mock).mockResolvedValue(activeStudent);
            (getEnrollments as jest.Mock).mockResolvedValue(normalizedEnrollments);

            // Check access to all enrolled courses
            for (const enrollment of normalizedEnrollments) {
              const accessAfterActivation = await checkCourseAccess(
                studentId,
                enrollment.courseCode
              );

              // Should now have access to all enrolled courses
              if (!accessAfterActivation.hasAccess) {
                return false;
              }

              // Verify access is granted with correct reason
              if (accessAfterActivation.reason !== 'Access granted') {
                return false;
              }

              // Verify expiration date is set correctly
              if (!accessAfterActivation.expiresAt) {
                return false;
              }

              if (accessAfterActivation.expiresAt.getTime() !== enrollment.accessEndDate.getTime()) {
                return false;
              }
            }

            // Test 3: Verify platform access is also granted
            const platformAccess = await checkPlatformAccess(studentId);
            if (!platformAccess.hasAccess) {
              return false;
            }

            // Test 4: Verify accessible courses list includes all enrolled courses
            const accessibleCourses = await getAccessibleCourses(studentId);
            const enrolledCourseCodes = normalizedEnrollments.map(e => e.courseCode);
            
            // All enrolled courses should be in accessible courses
            for (const courseCode of enrolledCourseCodes) {
              if (!accessibleCourses.includes(courseCode)) {
                return false;
              }
            }

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    test('deactivating student account revokes access while preserving enrollments', async () => {
      await fc.assert(
        fc.asyncProperty(
          studentProfileArbitrary,
          fc.array(activeEnrollmentArbitrary, { minLength: 1, maxLength: 5 }),
          async (studentProfile, enrollments) => {
            // Ensure all enrollments have the same studentId and unique course codes
            const studentId = studentProfile.userId;
            const uniqueCourseCodes = new Set<string>();
            const normalizedEnrollments = enrollments
              .filter(e => {
                if (uniqueCourseCodes.has(e.courseCode)) {
                  return false; // Skip duplicate course codes
                }
                uniqueCourseCodes.add(e.courseCode);
                return true;
              })
              .map(e => ({
                ...e,
                studentId
              }));

            // Skip if no enrollments after deduplication
            if (normalizedEnrollments.length === 0) {
              return true;
            }

            // Start with active student
            const activeStudent = { ...studentProfile, isActive: true };
            (getStudent as jest.Mock).mockResolvedValue(activeStudent);
            (getEnrollments as jest.Mock).mockResolvedValue(normalizedEnrollments);

            // Verify student has access
            const accessWhenActive = await checkCourseAccess(
              studentId,
              normalizedEnrollments[0].courseCode
            );

            if (!accessWhenActive.hasAccess) {
              return false;
            }

            // Deactivate student account
            const inactiveStudent = { ...studentProfile, isActive: false };
            (getStudent as jest.Mock).mockResolvedValue(inactiveStudent);
            (getEnrollments as jest.Mock).mockResolvedValue(normalizedEnrollments);

            // Verify access is revoked
            const accessWhenInactive = await checkCourseAccess(
              studentId,
              normalizedEnrollments[0].courseCode
            );

            if (accessWhenInactive.hasAccess) {
              return false;
            }

            // Verify reason indicates inactive account
            if (!accessWhenInactive.reason.includes('not active')) {
              return false;
            }

            // Verify enrollments are still preserved (can still be retrieved)
            const preservedEnrollments = await getEnrollments(studentId);
            if (preservedEnrollments.length !== normalizedEnrollments.length) {
              return false;
            }

            // Verify platform access is also revoked
            const platformAccess = await checkPlatformAccess(studentId);
            if (platformAccess.hasAccess) {
              return false;
            }

            // Verify accessible courses list is empty
            const accessibleCourses = await getAccessibleCourses(studentId);
            if (accessibleCourses.length !== 0) {
              return false;
            }

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // Feature: cloud-exam-platform, Property 21: Account deactivation revokes access but preserves history
  describe('Property-Based Test: Account deactivation revokes access but preserves history', () => {
    /**
     * Supported course codes for validation
     */
    const SUPPORTED_COURSE_CODES = [
      'CLF', 'DVA', 'SAA', 'DEA', 'SOA',  // AWS
      'AZ900', 'AZ104', 'AZ204',           // Azure
      'GCDL', 'GCE'                        // GCP
    ];

    /**
     * Generator for valid course codes
     */
    const courseCodeArbitrary = fc.constantFrom(...SUPPORTED_COURSE_CODES);

    /**
     * Generator for student IDs (UUIDs)
     */
    const studentIdArbitrary = fc.uuid();

    /**
     * Generator for student profile data
     */
    const studentProfileArbitrary = fc.record({
      userId: studentIdArbitrary,
      name: fc.string({ minLength: 1, maxLength: 100 }),
      phone: fc.string({ minLength: 10, maxLength: 20 }),
      linkedin: fc.webUrl(),
      createdAt: fc.date(),
      updatedAt: fc.date()
    });

    /**
     * Generator for enrollment with valid access period (currently active)
     * Creates enrollments where the current date is within the access period
     */
    const activeEnrollmentArbitrary = fc.tuple(
      fc.uuid(),
      courseCodeArbitrary,
      fc.date()
    ).map(([id, courseCode, enrolledAt]) => {
      // Create enrollment with access period that includes current date
      const now = new Date();
      
      // Access started 10 days ago
      const accessStartDate = new Date(now);
      accessStartDate.setDate(accessStartDate.getDate() - 10);
      
      // Access ends 20 days from now
      const accessEndDate = new Date(now);
      accessEndDate.setDate(accessEndDate.getDate() + 20);
      
      // Start date is 1 month before access start
      const startDate = new Date(accessStartDate);
      startDate.setMonth(startDate.getMonth() - 1);
      
      return {
        id,
        studentId: '', // Will be set in the test
        courseCode,
        startDate,
        accessStartDate,
        accessEndDate,
        enrolledAt
      };
    });

    test('deactivating active student account revokes all access while preserving enrollment history', async () => {
      await fc.assert(
        fc.asyncProperty(
          studentProfileArbitrary,
          fc.array(activeEnrollmentArbitrary, { minLength: 1, maxLength: 5 }),
          async (studentProfile, enrollments) => {
            // Ensure all enrollments have the same studentId and unique course codes
            const studentId = studentProfile.userId;
            const uniqueCourseCodes = new Set<string>();
            const normalizedEnrollments = enrollments
              .filter(e => {
                if (uniqueCourseCodes.has(e.courseCode)) {
                  return false; // Skip duplicate course codes
                }
                uniqueCourseCodes.add(e.courseCode);
                return true;
              })
              .map(e => ({
                ...e,
                studentId
              }));

            // Skip if no enrollments after deduplication
            if (normalizedEnrollments.length === 0) {
              return true;
            }

            // Step 1: Start with active student who has access
            const activeStudent = { ...studentProfile, isActive: true };
            (getStudent as jest.Mock).mockResolvedValue(activeStudent);
            (getEnrollments as jest.Mock).mockResolvedValue(normalizedEnrollments);

            // Verify student has platform access when active
            const platformAccessWhenActive = await checkPlatformAccess(studentId);
            if (!platformAccessWhenActive.hasAccess) {
              return false;
            }

            // Verify student has access to all enrolled courses when active
            for (const enrollment of normalizedEnrollments) {
              const courseAccess = await checkCourseAccess(studentId, enrollment.courseCode);
              if (!courseAccess.hasAccess) {
                return false;
              }
            }

            // Verify accessible courses list includes all enrolled courses
            const accessibleCoursesWhenActive = await getAccessibleCourses(studentId);
            if (accessibleCoursesWhenActive.length !== normalizedEnrollments.length) {
              return false;
            }

            // Step 2: Deactivate student account
            const inactiveStudent = { ...studentProfile, isActive: false };
            (getStudent as jest.Mock).mockResolvedValue(inactiveStudent);
            (getEnrollments as jest.Mock).mockResolvedValue(normalizedEnrollments);

            // Step 3: Verify platform access is revoked
            const platformAccessWhenInactive = await checkPlatformAccess(studentId);
            if (platformAccessWhenInactive.hasAccess) {
              return false;
            }

            // Verify reason indicates inactive account
            if (!platformAccessWhenInactive.reason.includes('not active')) {
              return false;
            }

            // Step 4: Verify course access is revoked for all courses
            for (const enrollment of normalizedEnrollments) {
              const courseAccess = await checkCourseAccess(studentId, enrollment.courseCode);
              
              // Access should be denied
              if (courseAccess.hasAccess) {
                return false;
              }

              // Reason should indicate inactive account
              if (!courseAccess.reason.includes('not active')) {
                return false;
              }
            }

            // Step 5: Verify accessible courses list is empty
            const accessibleCoursesWhenInactive = await getAccessibleCourses(studentId);
            if (accessibleCoursesWhenInactive.length !== 0) {
              return false;
            }

            // Step 6: CRITICAL - Verify enrollment history is preserved
            // Even though access is revoked, enrollments should still be retrievable
            const preservedEnrollments = await getEnrollments(studentId);
            
            // All enrollments should still exist
            if (preservedEnrollments.length !== normalizedEnrollments.length) {
              return false;
            }

            // Verify each enrollment is preserved with correct data
            for (const originalEnrollment of normalizedEnrollments) {
              const preserved = preservedEnrollments.find(
                e => e.courseCode === originalEnrollment.courseCode
              );
              
              if (!preserved) {
                return false;
              }

              // Verify enrollment data is unchanged
              if (preserved.id !== originalEnrollment.id) {
                return false;
              }

              if (preserved.studentId !== originalEnrollment.studentId) {
                return false;
              }

              if (preserved.accessStartDate.getTime() !== originalEnrollment.accessStartDate.getTime()) {
                return false;
              }

              if (preserved.accessEndDate.getTime() !== originalEnrollment.accessEndDate.getTime()) {
                return false;
              }
            }

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    test('reactivating deactivated account restores access to preserved enrollments', async () => {
      await fc.assert(
        fc.asyncProperty(
          studentProfileArbitrary,
          fc.array(activeEnrollmentArbitrary, { minLength: 1, maxLength: 3 }),
          async (studentProfile, enrollments) => {
            // Ensure all enrollments have the same studentId and unique course codes
            const studentId = studentProfile.userId;
            const uniqueCourseCodes = new Set<string>();
            const normalizedEnrollments = enrollments
              .filter(e => {
                if (uniqueCourseCodes.has(e.courseCode)) {
                  return false;
                }
                uniqueCourseCodes.add(e.courseCode);
                return true;
              })
              .map(e => ({
                ...e,
                studentId
              }));

            if (normalizedEnrollments.length === 0) {
              return true;
            }

            // Start with inactive student
            const inactiveStudent = { ...studentProfile, isActive: false };
            (getStudent as jest.Mock).mockResolvedValue(inactiveStudent);
            (getEnrollments as jest.Mock).mockResolvedValue(normalizedEnrollments);

            // Verify no access when inactive
            const accessWhenInactive = await checkPlatformAccess(studentId);
            if (accessWhenInactive.hasAccess) {
              return false;
            }

            // Verify enrollments are preserved even when inactive
            const enrollmentsWhenInactive = await getEnrollments(studentId);
            if (enrollmentsWhenInactive.length !== normalizedEnrollments.length) {
              return false;
            }

            // Reactivate account
            const activeStudent = { ...studentProfile, isActive: true };
            (getStudent as jest.Mock).mockResolvedValue(activeStudent);
            (getEnrollments as jest.Mock).mockResolvedValue(normalizedEnrollments);

            // Verify access is restored
            const accessWhenActive = await checkPlatformAccess(studentId);
            if (!accessWhenActive.hasAccess) {
              return false;
            }

            // Verify access to all preserved enrollments is restored
            for (const enrollment of normalizedEnrollments) {
              const courseAccess = await checkCourseAccess(studentId, enrollment.courseCode);
              if (!courseAccess.hasAccess) {
                return false;
              }
            }

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  // Feature: cloud-exam-platform, Property 23: Time-based access calculation
  describe('Property-Based Test: Time-based access calculation', () => {
    /**
     * Supported course codes for validation
     */
    const SUPPORTED_COURSE_CODES = [
      'CLF', 'DVA', 'SAA', 'DEA', 'SOA',  // AWS
      'AZ900', 'AZ104', 'AZ204',           // Azure
      'GCDL', 'GCE'                        // GCP
    ];

    /**
     * Generator for valid course codes
     */
    const courseCodeArbitrary = fc.constantFrom(...SUPPORTED_COURSE_CODES);

    /**
     * Generator for student IDs (UUIDs)
     */
    const studentIdArbitrary = fc.uuid();

    /**
     * Generator for dates
     * Using dates within a reasonable range (2020-2030)
     */
    const dateArbitrary = fc.date({
      min: new Date('2020-01-01'),
      max: new Date('2030-12-31')
    });

    /**
     * Generator for enrollment with calculated access dates
     */
    const enrollmentArbitrary = fc.record({
      id: fc.uuid(),
      studentId: studentIdArbitrary,
      courseCode: courseCodeArbitrary,
      startDate: dateArbitrary,
      enrolledAt: dateArbitrary
    }).map(data => {
      // Calculate access dates based on start date
      const accessStartDate = new Date(data.startDate);
      accessStartDate.setMonth(accessStartDate.getMonth() + 1);
      
      const accessEndDate = new Date(accessStartDate);
      accessEndDate.setMonth(accessEndDate.getMonth() + 1);
      
      return {
        ...data,
        accessStartDate,
        accessEndDate
      };
    });

    test('access dates are calculated correctly and enforced', async () => {
      await fc.assert(
        fc.asyncProperty(
          enrollmentArbitrary,
          async (enrollment) => {
            // Mock active student
            (getStudent as jest.Mock).mockResolvedValue({
              userId: enrollment.studentId,
              name: 'Test Student',
              phone: '123-456-7890',
              linkedin: 'https://linkedin.com/in/test',
              isActive: true,
              createdAt: new Date(),
              updatedAt: new Date(),
            });

            // Mock enrollment
            (getEnrollments as jest.Mock).mockResolvedValue([enrollment]);

            // Verify access dates are calculated correctly
            const expectedAccessStart = new Date(enrollment.startDate);
            expectedAccessStart.setMonth(expectedAccessStart.getMonth() + 1);
            
            const expectedAccessEnd = new Date(expectedAccessStart);
            expectedAccessEnd.setMonth(expectedAccessEnd.getMonth() + 1);

            const accessDatesCorrect = (
              enrollment.accessStartDate.getTime() === expectedAccessStart.getTime() &&
              enrollment.accessEndDate.getTime() === expectedAccessEnd.getTime()
            );

            if (!accessDatesCorrect) {
              return false;
            }

            // Test access enforcement at different time points
            const now = new Date();
            const accessStart = new Date(enrollment.accessStartDate);
            const accessEnd = new Date(enrollment.accessEndDate);

            // Check access based on current time relative to access period
            const result = await checkCourseAccess(enrollment.studentId, enrollment.courseCode);

            // Verify access is granted only within the access period
            if (now < accessStart) {
              // Before access period - should be denied
              return !result.hasAccess && result.reason.includes('begins on');
            } else if (now > accessEnd) {
              // After access period - should be denied
              return !result.hasAccess && result.reason.includes('expired on');
            } else {
              // Within access period - should be granted
              return result.hasAccess && result.expiresAt?.getTime() === accessEnd.getTime();
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    test('access start is exactly one month after course start', async () => {
      await fc.assert(
        fc.asyncProperty(
          enrollmentArbitrary,
          async (enrollment) => {
            // Calculate expected access start
            const expectedAccessStart = new Date(enrollment.startDate);
            expectedAccessStart.setMonth(expectedAccessStart.getMonth() + 1);

            // Verify access start date matches expected
            return enrollment.accessStartDate.getTime() === expectedAccessStart.getTime();
          }
        ),
        { numRuns: 100 }
      );
    });

    test('access end is exactly one month after access start', async () => {
      await fc.assert(
        fc.asyncProperty(
          enrollmentArbitrary,
          async (enrollment) => {
            // Calculate expected access end
            const expectedAccessEnd = new Date(enrollment.accessStartDate);
            expectedAccessEnd.setMonth(expectedAccessEnd.getMonth() + 1);

            // Verify access end date matches expected
            return enrollment.accessEndDate.getTime() === expectedAccessEnd.getTime();
          }
        ),
        { numRuns: 100 }
      );
    });

    test('total access period is exactly two months from course start', async () => {
      await fc.assert(
        fc.asyncProperty(
          enrollmentArbitrary,
          async (enrollment) => {
            // Calculate expected access end by adding 1 month twice (not 2 months at once)
            // This correctly handles month boundaries (e.g., Oct 31 -> Nov 30 -> Dec 30)
            const expectedAccessEnd = new Date(enrollment.startDate);
            expectedAccessEnd.setMonth(expectedAccessEnd.getMonth() + 1); // First month
            expectedAccessEnd.setMonth(expectedAccessEnd.getMonth() + 1); // Second month

            // Verify total period is 2 calendar months
            return enrollment.accessEndDate.getTime() === expectedAccessEnd.getTime();
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
