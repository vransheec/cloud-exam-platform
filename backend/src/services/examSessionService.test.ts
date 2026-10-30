/**
 * Exam Session Service Tests
 * 
 * Property-based tests for exam session management including
 * single active session enforcement.
 */

import * as fc from 'fast-check';
import {
  startExam,
  getActiveSession,
} from './examSessionService';
import { ExamSession } from '../models/types';
import * as database from '../config/database';
import * as courseService from './courseService';
import * as questionService from './questionService';

// Mock the database and service modules
jest.mock('../config/database', () => {
  const actual = jest.requireActual('../config/database');
  return {
    ...actual,
    putItem: jest.fn(),
    queryItems: jest.fn(),
    getItem: jest.fn(),
    updateItem: jest.fn(),
    deleteItem: jest.fn(),
  };
});
jest.mock('./courseService');
jest.mock('./questionService');

const mockPutItem = database.putItem as jest.MockedFunction<typeof database.putItem>;
const mockQueryItems = database.queryItems as jest.MockedFunction<typeof database.queryItems>;
const mockValidateCourseCode = courseService.validateCourseCode as jest.MockedFunction<typeof courseService.validateCourseCode>;
const mockGetQuestionsByCourse = questionService.getQuestionsByCourse as jest.MockedFunction<typeof questionService.getQuestionsByCourse>;

describe('Exam Session Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetAllMocks();
    
    // Default mock implementations
    mockValidateCourseCode.mockResolvedValue(true);
    mockGetQuestionsByCourse.mockResolvedValue([
      {
        question: {
          id: 'q1',
          courseCode: 'CLF',
          questionText: 'Test question',
          imageUrl: null,
          createdBy: 'assistant-1',
          createdAt: new Date(),
          updatedAt: new Date(),
          version: 1,
        },
        alternatives: [
          {
            id: 'alt1',
            questionId: 'q1',
            text: 'Answer 1',
            imageUrl: null,
            isCorrect: true,
            order: 0,
          },
          {
            id: 'alt2',
            questionId: 'q1',
            text: 'Answer 2',
            imageUrl: null,
            isCorrect: false,
            order: 1,
          },
        ],
      },
    ]);
  });

  // Feature: cloud-exam-platform, Property 17: Single active exam session enforcement
  describe('Property-Based Test: Single active exam session enforcement', () => {
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
     * Generator for exam sessions
     */
    const examSessionArbitrary = fc.record({
      id: fc.uuid(),
      studentId: studentIdArbitrary,
      courseCode: courseCodeArbitrary,
      startTime: fc.date(),
      endTime: fc.constant(null),
      isActive: fc.constant(true),
      status: fc.constant('in_progress' as const),
      createdAt: fc.date(),
    });

    test('student cannot start multiple exam sessions simultaneously', async () => {
      await fc.assert(
        fc.asyncProperty(
          studentIdArbitrary,
          courseCodeArbitrary,
          courseCodeArbitrary,
          async (studentId, courseCode1, courseCode2) => {
            // Reset only the database mocks, keep service mocks
            mockQueryItems.mockReset();
            mockPutItem.mockReset();

            // Mock no active session initially
            mockQueryItems.mockResolvedValueOnce([]);
            mockPutItem.mockResolvedValueOnce(undefined);

            // Start first exam session
            const firstSession = await startExam(studentId, courseCode1);

            // Verify first session was created successfully
            if (!firstSession.session.isActive) {
              return false;
            }

            if (firstSession.session.status !== 'in_progress') {
              return false;
            }

            // Mock active session exists for second attempt
            mockQueryItems.mockResolvedValueOnce([firstSession.session]);

            // Attempt to start second exam session (should fail)
            try {
              await startExam(studentId, courseCode2);
              // If we reach here, the test should fail - multiple sessions were allowed
              return false;
            } catch (error: any) {
              // Verify error message indicates active session exists
              if (!error.message.includes('active exam session')) {
                return false;
              }

              // Verify the error message is user-friendly
              if (!error.message.includes('complete or cancel')) {
                return false;
              }

              return true;
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    test('student can start new exam after completing previous session', async () => {
      await fc.assert(
        fc.asyncProperty(
          studentIdArbitrary,
          courseCodeArbitrary,
          courseCodeArbitrary,
          async (studentId, courseCode1, courseCode2) => {
            // Start first exam session
            mockQueryItems.mockResolvedValueOnce([]); // No active session
            mockPutItem.mockResolvedValueOnce(undefined);

            const firstSession = await startExam(studentId, courseCode1);

            // Complete the first session
            const completedSession: ExamSession = {
              ...firstSession.session,
              endTime: new Date(),
              isActive: false,
              status: 'completed',
            };

            mockQueryItems
              .mockResolvedValueOnce([completedSession]) // getActiveSession returns completed (filtered out)
              .mockResolvedValueOnce([]); // No active sessions after filtering

            mockPutItem.mockResolvedValueOnce(undefined);

            // Attempt to start second exam session (should succeed)
            const secondSession = await startExam(studentId, courseCode2);

            // Verify second session was created successfully
            if (!secondSession.session.isActive) {
              return false;
            }

            if (secondSession.session.status !== 'in_progress') {
              return false;
            }

            // Verify sessions have different IDs
            if (firstSession.session.id === secondSession.session.id) {
              return false;
            }

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    test('student can start new exam after failed session', async () => {
      await fc.assert(
        fc.asyncProperty(
          studentIdArbitrary,
          courseCodeArbitrary,
          async (studentId, courseCode) => {
            // Start first exam session
            mockQueryItems.mockResolvedValueOnce([]); // No active session
            mockPutItem.mockResolvedValueOnce(undefined);

            const firstSession = await startExam(studentId, courseCode);

            // Fail the first session
            const failedSession: ExamSession = {
              ...firstSession.session,
              endTime: new Date(),
              isActive: false,
              status: 'failed',
            };

            mockQueryItems
              .mockResolvedValueOnce([failedSession]) // getActiveSession returns failed (filtered out)
              .mockResolvedValueOnce([]); // No active sessions after filtering

            mockPutItem.mockResolvedValueOnce(undefined);

            // Attempt to start new exam session (should succeed)
            const secondSession = await startExam(studentId, courseCode);

            // Verify second session was created successfully
            if (!secondSession.session.isActive) {
              return false;
            }

            if (secondSession.session.status !== 'in_progress') {
              return false;
            }

            // Verify sessions have different IDs
            if (firstSession.session.id === secondSession.session.id) {
              return false;
            }

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    test('active session enforcement works across different browsers/devices', async () => {
      await fc.assert(
        fc.asyncProperty(
          studentIdArbitrary,
          courseCodeArbitrary,
          fc.integer({ min: 2, max: 5 }),
          async (studentId, courseCode, attemptCount) => {
            // Reset only the database mocks, keep service mocks
            mockQueryItems.mockReset();
            mockPutItem.mockReset();

            // Start first exam session (simulating first browser/device)
            mockQueryItems.mockResolvedValueOnce([]); // No active session
            mockPutItem.mockResolvedValueOnce(undefined);

            const firstSession = await startExam(studentId, courseCode);

            // Verify first session was created
            if (!firstSession.session.isActive) {
              return false;
            }

            // Simulate multiple attempts from different browsers/devices
            for (let i = 0; i < attemptCount; i++) {
              // Mock active session exists
              mockQueryItems.mockResolvedValueOnce([firstSession.session]);

              try {
                await startExam(studentId, courseCode);
                // If we reach here, enforcement failed
                return false;
              } catch (error: any) {
                // Verify error indicates active session
                if (!error.message.includes('active exam session')) {
                  return false;
                }
              }
            }

            // All attempts should have been blocked
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    test('getActiveSession correctly identifies active sessions', async () => {
      await fc.assert(
        fc.asyncProperty(
          examSessionArbitrary,
          async (session) => {
            // Reset mocks for this iteration
            mockQueryItems.mockReset();

            // Mock query to return the active session
            mockQueryItems.mockResolvedValueOnce([session]);

            const activeSession = await getActiveSession(session.studentId);

            // Verify active session is returned
            if (!activeSession) {
              return false;
            }

            if (activeSession.id !== session.id) {
              return false;
            }

            if (!activeSession.isActive) {
              return false;
            }

            if (activeSession.status !== 'in_progress') {
              return false;
            }

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    test('getActiveSession returns null when no active session exists', async () => {
      await fc.assert(
        fc.asyncProperty(
          studentIdArbitrary,
          async (studentId) => {
            // Mock query to return no sessions
            mockQueryItems.mockResolvedValueOnce([]);

            const activeSession = await getActiveSession(studentId);

            // Verify null is returned
            return activeSession === null;
          }
        ),
        { numRuns: 100 }
      );
    });

    test('getActiveSession filters out completed and failed sessions', async () => {
      await fc.assert(
        fc.asyncProperty(
          studentIdArbitrary,
          fc.array(
            fc.record({
              id: fc.uuid(),
              studentId: fc.constant(''),
              courseCode: courseCodeArbitrary,
              startTime: fc.date(),
              endTime: fc.date(),
              isActive: fc.constant(false),
              status: fc.constantFrom('completed' as const, 'failed' as const),
              createdAt: fc.date(),
            }),
            { minLength: 1, maxLength: 5 }
          ),
          async (studentId, sessions) => {
            // Reset mocks for this iteration
            mockQueryItems.mockReset();

            // Set all sessions to have the same studentId
            const normalizedSessions = sessions.map(s => ({
              ...s,
              studentId,
            }));

            // Mock query to return only completed/failed sessions
            mockQueryItems.mockResolvedValueOnce(normalizedSessions);

            const activeSession = await getActiveSession(studentId);

            // Verify null is returned (no active sessions)
            return activeSession === null;
          }
        ),
        { numRuns: 100 }
      );
    });

    test('single session enforcement persists across course changes', async () => {
      await fc.assert(
        fc.asyncProperty(
          studentIdArbitrary,
          courseCodeArbitrary,
          fc.array(courseCodeArbitrary, { minLength: 1, maxLength: 5 }),
          async (studentId, activeCourseCode, otherCourseCodes) => {
            // Reset only the database mocks, keep service mocks
            mockQueryItems.mockReset();
            mockPutItem.mockReset();

            // Filter out the active course code from other courses
            const differentCourses = otherCourseCodes.filter(
              code => code !== activeCourseCode
            );

            if (differentCourses.length === 0) {
              return true; // Skip if no different courses
            }

            // Start exam for first course
            mockQueryItems.mockResolvedValueOnce([]); // No active session
            mockPutItem.mockResolvedValueOnce(undefined);

            const activeSession = await startExam(studentId, activeCourseCode);

            // Verify session is active
            if (!activeSession.session.isActive) {
              return false;
            }

            // Try to start exams for other courses (should all fail)
            for (const courseCode of differentCourses) {
              mockQueryItems.mockResolvedValueOnce([activeSession.session]);

              try {
                await startExam(studentId, courseCode);
                // If we reach here, enforcement failed
                return false;
              } catch (error: any) {
                // Verify error indicates active session
                if (!error.message.includes('active exam session')) {
                  return false;
                }
              }
            }

            // All attempts should have been blocked
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
