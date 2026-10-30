/**
 * Property-Based Tests for Enrollment Service
 * 
 * Tests the round-trip preservation of enrollment data using fast-check.
 * Feature: cloud-exam-platform, Property 13: Enrollment data round-trip preservation
 * Validates: Requirements 3.6
 */

// Set up test environment variables before importing modules
process.env.JWT_SECRET = 'test-secret-key-for-testing-only';
process.env.JWT_EXPIRATION = '1h';
process.env.AWS_REGION = 'us-east-1';
process.env.DYNAMODB_TABLE_PREFIX = 'test';

import * as fc from 'fast-check';
import {
  saveEnrollment,
  getEnrollment,
} from './enrollmentService';
import * as database from '../config/database';

// Mock the database module
jest.mock('../config/database');
const mockPutItem = database.putItem as jest.MockedFunction<typeof database.putItem>;
const mockGetItem = database.getItem as jest.MockedFunction<typeof database.getItem>;

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
 * Generator for enrollment data (without ID)
 * Ensures that access dates are calculated correctly:
 * - accessStartDate = startDate + 1 month
 * - accessEndDate = accessStartDate + 1 month
 */
const enrollmentDataArbitrary = fc.record({
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

/**
 * Helper function to check if two enrollments are equivalent
 */
function enrollmentsAreEquivalent(
  original: any,
  retrieved: any
): boolean {
  return (
    original.studentId === retrieved.studentId &&
    original.courseCode === retrieved.courseCode &&
    original.startDate.getTime() === retrieved.startDate.getTime() &&
    original.accessStartDate.getTime() === retrieved.accessStartDate.getTime() &&
    original.accessEndDate.getTime() === retrieved.accessEndDate.getTime() &&
    original.enrolledAt.getTime() === retrieved.enrolledAt.getTime()
  );
}

describe('Enrollment Service - Property-Based Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });
  
  // Feature: cloud-exam-platform, Property 13: Enrollment data round-trip preservation
  test('enrollment round-trip preserves all data', async () => {
    // Store saved enrollments for retrieval
    const savedEnrollments = new Map<string, any>();
    
    mockPutItem.mockImplementation(async (_tableName: string, item: any) => {
      savedEnrollments.set(item.id, item);
      return item;
    });
    
    mockGetItem.mockImplementation(async (_tableName: string, key: any) => {
      return savedEnrollments.get(key.id) || null;
    });
    
    await fc.assert(
      fc.asyncProperty(
        enrollmentDataArbitrary,
        async (enrollmentData) => {
          // Save the enrollment
          const saved = await saveEnrollment(enrollmentData);
          
          // Retrieve the enrollment
          const retrieved = await getEnrollment(saved.id);
          
          // Should not be null
          if (retrieved === null) {
            return false;
          }
          
          // Check equivalence
          return enrollmentsAreEquivalent(saved, retrieved);
        }
      ),
      { numRuns: 100 }
    );
  });
  
  // Additional property: Saved enrollment should have valid ID
  test('saved enrollments have valid generated IDs', async () => {
    mockPutItem.mockImplementation(async (_tableName: string, item: any) => item);
    
    await fc.assert(
      fc.asyncProperty(
        enrollmentDataArbitrary,
        async (enrollmentData) => {
          const saved = await saveEnrollment(enrollmentData);
          
          // Enrollment should have a valid UUID
          const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
          return uuidRegex.test(saved.id);
        }
      ),
      { numRuns: 100 }
    );
  });
  
  // Additional property: Course code validation
  test('only supported course codes are stored', async () => {
    mockPutItem.mockImplementation(async (_tableName: string, item: any) => item);
    
    await fc.assert(
      fc.asyncProperty(
        enrollmentDataArbitrary,
        async (enrollmentData) => {
          const saved = await saveEnrollment(enrollmentData);
          
          // Course code should be one of the supported codes
          return SUPPORTED_COURSE_CODES.includes(saved.courseCode);
        }
      ),
      { numRuns: 100 }
    );
  });
  
  // Additional property: Access dates are correctly calculated
  test('access dates follow the one-month rule', async () => {
    mockPutItem.mockImplementation(async (_tableName: string, item: any) => item);
    
    await fc.assert(
      fc.asyncProperty(
        enrollmentDataArbitrary,
        async (enrollmentData) => {
          const saved = await saveEnrollment(enrollmentData);
          
          // Calculate expected access start (startDate + 1 month)
          const expectedAccessStart = new Date(saved.startDate);
          expectedAccessStart.setMonth(expectedAccessStart.getMonth() + 1);
          
          // Calculate expected access end (accessStartDate + 1 month)
          const expectedAccessEnd = new Date(saved.accessStartDate);
          expectedAccessEnd.setMonth(expectedAccessEnd.getMonth() + 1);
          
          // Check if dates match
          return (
            saved.accessStartDate.getTime() === expectedAccessStart.getTime() &&
            saved.accessEndDate.getTime() === expectedAccessEnd.getTime()
          );
        }
      ),
      { numRuns: 100 }
    );
  });
});
