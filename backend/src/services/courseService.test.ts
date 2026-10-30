/**
 * Course Service Tests
 * 
 * Tests for course management functionality, including validation
 * of all supported course codes.
 */

import {
  createCourse,
  validateCourseCode,
} from './courseService';
import { CloudProvider } from '../models/types';

// Mock the database module
jest.mock('../config/database');

describe('Course Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  /**
   * Test that verifies the system accepts all 10 supported course codes.
   * This validates Requirements 2.8 and 5.5 which state the system SHALL
   * support all Cloud Exam Platform courses across AWS, Azure, and GCP.
   * 
   * Validates: Requirements 2.8, 5.5
   */
  describe('Supported Course Codes', () => {
    it('should accept all 10 supported course codes', async () => {
      // Define all supported course codes
      const supportedCourses = [
        // AWS courses
        { code: 'CLF', name: 'AWS Certified Cloud Practitioner', provider: 'AWS' as CloudProvider },
        { code: 'DVA', name: 'AWS Certified Developer Associate', provider: 'AWS' as CloudProvider },
        { code: 'SAA', name: 'AWS Certified Solutions Architect Associate', provider: 'AWS' as CloudProvider },
        { code: 'DEA', name: 'AWS Certified Data Engineer Associate', provider: 'AWS' as CloudProvider },
        { code: 'SOA', name: 'AWS Certified SysOps Administrator Associate', provider: 'AWS' as CloudProvider },
        
        // Azure courses
        { code: 'AZ900', name: 'Microsoft Azure Fundamentals', provider: 'Azure' as CloudProvider },
        { code: 'AZ104', name: 'Microsoft Azure Administrator', provider: 'Azure' as CloudProvider },
        { code: 'AZ204', name: 'Developing Solutions for Microsoft Azure', provider: 'Azure' as CloudProvider },
        
        // GCP courses
        { code: 'GCDL', name: 'Google Cloud Digital Leader', provider: 'GCP' as CloudProvider },
        { code: 'GCE', name: 'Google Cloud Engineer', provider: 'GCP' as CloudProvider },
      ];

      // Verify we have exactly 10 courses
      expect(supportedCourses).toHaveLength(10);

      // Verify each course code is accepted by the system
      for (const course of supportedCourses) {
        // Mock the database to return null (course doesn't exist yet)
        const { getItem, putItem } = require('../config/database');
        getItem.mockResolvedValueOnce(null);
        putItem.mockResolvedValueOnce(undefined);

        // Attempt to create the course
        const createdCourse = await createCourse(
          course.code,
          course.name,
          course.provider,
          `Description for ${course.name}`
        );

        // Verify the course was created successfully
        expect(createdCourse).toBeDefined();
        expect(createdCourse.code).toBe(course.code);
        expect(createdCourse.name).toBe(course.name);
        expect(createdCourse.provider).toBe(course.provider);
      }
    });

    it('should validate all 10 supported course codes', async () => {
      const supportedCourseCodes = [
        'CLF', 'DVA', 'SAA', 'DEA', 'SOA',  // AWS
        'AZ900', 'AZ104', 'AZ204',           // Azure
        'GCDL', 'GCE'                        // GCP
      ];

      // Verify we have exactly 10 course codes
      expect(supportedCourseCodes).toHaveLength(10);

      // Mock the database to return a course for each code
      const { getItem } = require('../config/database');
      
      for (const code of supportedCourseCodes) {
        getItem.mockResolvedValueOnce({ code, name: `Test ${code}`, provider: 'AWS' });
        
        // Validate the course code
        const isValid = await validateCourseCode(code);
        
        // Verify the course code is valid
        expect(isValid).toBe(true);
      }
    });
  });
});
