/**
 * Student API Handlers
 * 
 * Provides HTTP endpoints for student operations including course access,
 * exam taking, and exam history.
 * These handlers are designed to be deployed as serverless functions (AWS Lambda).
 * 
 * Endpoints:
 * - GET /api/courses - Get enrolled courses
 * - GET /api/courses/:code/exams - Get exams for course
 * - POST /api/exams/start - Start exam session
 * - POST /api/exams/:sessionId/answers - Submit answer
 * - POST /api/exams/:sessionId/complete - Complete exam
 * - GET /api/exams/history - Get exam history
 * 
 * Requirements:
 * - 3.1: Display enrolled courses after authentication
 * - 3.2: Show exams for selected course
 * - 4.1: Present questions with alternatives
 * - 4.2: Record answer selections
 * - 4.3: Calculate and display score with correct answers
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { requireActiveStudent } from '../middleware/authMiddleware';
import { getEnrollments } from '../services/enrollmentService';
import { checkCourseAccess } from '../services/accessControlService';
import { getCourse } from '../services/courseService';
import { getQuestionsByCourse } from '../services/questionService';
import {
  startExam,
  submitAnswer,
  completeExam,
  getExamHistory,
  getActiveSession,
  forceCleanupActiveSessions,
  getExamSession,
} from '../services/examSessionService';
import { ItemNotFoundError, DatabaseError } from '../config/database';

/**
 * Start Exam Request Body
 */
interface StartExamRequest {
  courseCode: string;
  language?: 'en' | 'es';
}

/**
 * Submit Answer Request Body
 */
interface SubmitAnswerRequest {
  questionId: string;
  alternativeIds: string[];
}

/**
 * Create a standardized API Gateway response
 * 
 * @param statusCode - HTTP status code
 * @param body - Response body object
 * @returns APIGatewayProxyResult
 */
function createResponse(
  statusCode: number,
  body: Record<string, any>
): APIGatewayProxyResult {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Credentials': true,
    },
    body: JSON.stringify(body),
  };
}

/**
 * GET /api/courses
 * 
 * Gets all courses the student is enrolled in with access status.
 * Requires active student role.
 * 
 * Request Headers:
 * Authorization: Bearer <token>
 * 
 * Response (Success - 200):
 * [
 *   {
 *     "course": {
 *       "code": "CLF",
 *       "name": "AWS Certified Cloud Practitioner",
 *       "provider": "AWS",
 *       "description": "..."
 *     },
 *     "enrollment": {
 *       "id": "uuid",
 *       "studentId": "uuid",
 *       "courseCode": "CLF",
 *       "startDate": "2024-01-01T00:00:00.000Z",
 *       "accessStartDate": "2024-02-01T00:00:00.000Z",
 *       "accessEndDate": "2024-03-01T00:00:00.000Z",
 *       "enrolledAt": "2024-01-01T00:00:00.000Z"
 *     },
 *     "accessStatus": {
 *       "hasAccess": true,
 *       "reason": "Access granted",
 *       "expiresAt": "2024-03-01T00:00:00.000Z"
 *     }
 *   },
 *   ...
 * ]
 * 
 * Requirements:
 * - 3.1: WHEN a student provides valid credentials, THE System SHALL display enrolled courses
 * - 3.3: WHEN a student has multiple enrollments, THE System SHALL display all courses
 */
export async function getCoursesHandler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    // Check active student authentication
    const authHeader = event.headers.Authorization || event.headers.authorization;
    const authResult = await requireActiveStudent(authHeader);

    if (!authResult.authenticated) {
      return createResponse(authResult.statusCode || 403, {
        error: authResult.error || 'Active student access required',
      });
    }

    // Get student enrollments
    const enrollments = await getEnrollments(authResult.userId!);

    // Build response with course details and access status
    const coursesWithAccess = await Promise.all(
      enrollments.map(async (enrollment) => {
        const course = await getCourse(enrollment.courseCode);
        const accessStatus = await checkCourseAccess(
          authResult.userId!,
          enrollment.courseCode
        );

        return {
          course,
          enrollment,
          accessStatus,
        };
      })
    );

    // Filter out enrollments where the course doesn't exist
    const validCoursesWithAccess = coursesWithAccess.filter(
      (courseWithAccess) => courseWithAccess.course !== null
    );

    return createResponse(200, validCoursesWithAccess);
  } catch (error) {
    console.error('Get courses error:', error);

    return createResponse(500, {
      error: 'An error occurred while retrieving courses. Please try again.',
    });
  }
}

/**
 * GET /api/courses/:code/exams
 * 
 * Gets exam information for a specific course.
 * Checks if student has access to the course.
 * Requires active student role.
 * 
 * Request Headers:
 * Authorization: Bearer <token>
 * 
 * Path Parameters:
 * code - Course code
 * 
 * Response (Success - 200):
 * {
 *   "course": {
 *     "code": "CLF",
 *     "name": "AWS Certified Cloud Practitioner",
 *     "provider": "AWS",
 *     "description": "..."
 *   },
 *   "questionCount": 50,
 *   "hasAccess": true,
 *   "accessStatus": {
 *     "hasAccess": true,
 *     "reason": "Access granted",
 *     "expiresAt": "2024-03-01T00:00:00.000Z"
 *   }
 * }
 * 
 * Requirements:
 * - 3.2: WHEN a student selects a course, THE System SHALL show all exams for that certification
 */
export async function getCourseExamsHandler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    console.log('getCourseExamsHandler started', { pathParameters: event.pathParameters });
    
    // Check active student authentication
    const authHeader = event.headers.Authorization || event.headers.authorization;
    const authResult = await requireActiveStudent(authHeader);

    console.log('Authentication result:', { 
      authenticated: authResult.authenticated, 
      userId: authResult.userId,
      error: authResult.error 
    });

    if (!authResult.authenticated) {
      return createResponse(authResult.statusCode || 403, {
        error: authResult.error || 'Active student access required',
      });
    }

    // Get course code from path parameters
    const courseCode = event.pathParameters?.code;
    if (!courseCode) {
      console.log('No course code provided');
      return createResponse(400, {
        error: 'Course code is required',
      });
    }

    console.log('Checking course access for:', { userId: authResult.userId, courseCode });

    // Check course access
    const accessStatus = await checkCourseAccess(authResult.userId!, courseCode);
    console.log('Access status result:', accessStatus);

    // Get course details
    console.log('Getting course details for:', courseCode);
    const course = await getCourse(courseCode);
    if (!course) {
      console.log('Course not found:', courseCode);
      return createResponse(404, {
        error: 'Course not found',
      });
    }

    console.log('Course found:', { code: course.code, name: course.name });

    // Get question count for the course
    console.log('Getting questions for course:', courseCode);
    const questions = await getQuestionsByCourse(courseCode);
    console.log('Questions found:', { count: questions.length });

    // Use examQuestionCount from course config if set, otherwise use total questions
    const examQuestionCount = course.examQuestionCount > 0 && course.examQuestionCount < questions.length
      ? course.examQuestionCount
      : questions.length;

    // Check if this is a trial enrollment
    const enrollments = await getEnrollments(authResult.userId!);
    const courseEnrollment = enrollments.find((e: any) => e.courseCode === courseCode);
    const isTrial = courseEnrollment?.enrollmentType === 'trial';

    const result = {
      course,
      questionCount: examQuestionCount,
      totalQuestionsInBank: questions.length,
      hasAccess: accessStatus.hasAccess,
      accessStatus,
      isTrial,
      trialQuestionCount: isTrial ? 10 : undefined,
      timeLimitMinutes: isTrial ? 15 : (course.timeLimitMinutes || 0),
    };

    console.log('Returning success result:', result);
    return createResponse(200, result);
  } catch (error) {
    console.error('Get course exams error:', error);
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');

    return createResponse(500, {
      error: 'An error occurred while retrieving exam information. Please try again.',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * POST /api/exams/start
 * 
 * Starts a new exam session for a course.
 * Checks for existing active session and course access.
 * Requires active student role.
 * 
 * Request Headers:
 * Authorization: Bearer <token>
 * 
 * Request Body:
 * {
 *   "courseCode": "CLF"
 * }
 * 
 * Response (Success - 201):
 * {
 *   "session": {
 *     "id": "uuid",
 *     "studentId": "uuid",
 *     "courseCode": "CLF",
 *     "startTime": "2024-01-01T00:00:00.000Z",
 *     "endTime": null,
 *     "isActive": true,
 *     "status": "in_progress",
 *     "createdAt": "2024-01-01T00:00:00.000Z"
 *   },
 *   "questions": [
 *     {
 *       "question": {...},
 *       "alternatives": [...]
 *     },
 *     ...
 *   ]
 * }
 * 
 * Requirements:
 * - 4.1: WHEN a student starts an exam, THE System SHALL present questions with alternatives
 * - 4.5: WHEN a student is taking an exam, THE System SHALL prevent starting another session
 */
export async function startExamHandler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    // Check active student authentication
    const authHeader = event.headers.Authorization || event.headers.authorization;
    const authResult = await requireActiveStudent(authHeader);

    if (!authResult.authenticated) {
      return createResponse(authResult.statusCode || 403, {
        error: authResult.error || 'Active student access required',
      });
    }

    // Parse request body
    if (!event.body) {
      return createResponse(400, {
        error: 'Request body is required',
      });
    }

    const requestBody: StartExamRequest = JSON.parse(event.body);

    // Validate required fields
    if (!requestBody.courseCode) {
      return createResponse(400, {
        error: 'courseCode is required',
      });
    }

    // Check course access
    const accessStatus = await checkCourseAccess(
      authResult.userId!,
      requestBody.courseCode
    );

    if (!accessStatus.hasAccess) {
      return createResponse(403, {
        error: accessStatus.reason,
      });
    }

    // Start exam with optional language selection (default 'en')
    const language: 'en' | 'es' = requestBody.language === 'es' ? 'es' : 'en';
    const examData = await startExam(authResult.userId!, requestBody.courseCode, language);

    return createResponse(201, examData);
  } catch (error) {
    console.error('Start exam error:', error);

    if (error instanceof DatabaseError) {
      // English-only course rejection (Req 2.3, 2.4)
      const anyErr = error as any;
      if (anyErr.code === 'ENGLISH_ONLY_COURSE') {
        return createResponse(400, {
          error: error.message,
          code: 'ENGLISH_ONLY_COURSE',
        });
      }
      // Check if it's an active session error
      if (error.message.includes('active exam session')) {
        return createResponse(409, {
          error: error.message,
        });
      }

      return createResponse(400, {
        error: error.message,
      });
    }

    return createResponse(500, {
      error: 'An error occurred while starting the exam. Please try again.',
    });
  }
}

/**
 * GET /api/exams/active
 * 
 * Gets the current active exam session for the student.
 * Requires active student role.
 * 
 * Request Headers:
 * Authorization: Bearer <token>
 * 
 * Response (Success - 200):
 * {
 *   "session": {...},
 *   "questions": [...]
 * }
 * 
 * Response (No active session - 200):
 * {
 *   "session": null
 * }
 */
export async function getActiveExamHandler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    // Check active student authentication
    const authHeader = event.headers.Authorization || event.headers.authorization;
    const authResult = await requireActiveStudent(authHeader);

    if (!authResult.authenticated) {
      return createResponse(authResult.statusCode || 403, {
        error: authResult.error || 'Active student access required',
      });
    }

    // Get active session
    const session = await getActiveSession(authResult.userId!);

    if (!session) {
      return createResponse(200, {
        session: null,
      });
    }

    // Get questions for the session
    const questions = await getQuestionsByCourse(session.courseCode);

    return createResponse(200, {
      session,
      questions,
    });
  } catch (error) {
    console.error('Get active exam error:', error);

    return createResponse(500, {
      error: 'An error occurred while retrieving active exam. Please try again.',
    });
  }
}

/**
 * POST /api/exams/:sessionId/answers
 * 
 * Submits an answer for a question in an exam session.
 * Requires active student role.
 * 
 * Request Headers:
 * Authorization: Bearer <token>
 * 
 * Path Parameters:
 * sessionId - Exam session ID
 * 
 * Request Body:
 * {
 *   "questionId": "uuid",
 *   "alternativeId": "uuid"
 * }
 * 
 * Response (Success - 200):
 * {
 *   "id": "uuid",
 *   "sessionId": "uuid",
 *   "questionId": "uuid",
 *   "selectedAlternativeId": "uuid",
 *   "isCorrect": true,
 *   "answeredAt": "2024-01-01T00:00:00.000Z"
 * }
 * 
 * Requirements:
 * - 4.2: WHEN a student selects an alternative, THE System SHALL record the selection
 * - 4.4: WHEN a student navigates through questions, THE System SHALL preserve selections
 */
export async function submitAnswerHandler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    // Check active student authentication
    const authHeader = event.headers.Authorization || event.headers.authorization;
    const authResult = await requireActiveStudent(authHeader);

    if (!authResult.authenticated) {
      return createResponse(authResult.statusCode || 403, {
        error: authResult.error || 'Active student access required',
      });
    }

    // Get session ID from path parameters
    const sessionId = event.pathParameters?.sessionId;
    if (!sessionId) {
      return createResponse(400, {
        error: 'Session ID is required',
      });
    }

    // Parse request body
    if (!event.body) {
      return createResponse(400, {
        error: 'Request body is required',
      });
    }

    const requestBody: SubmitAnswerRequest = JSON.parse(event.body);

    // Validate required fields
    if (!requestBody.questionId || !requestBody.alternativeIds) {
      return createResponse(400, {
        error: 'questionId and alternativeIds are required',
      });
    }

    if (!Array.isArray(requestBody.alternativeIds)) {
      return createResponse(400, {
        error: 'alternativeIds must be an array',
      });
    }

    // Submit answer
    const answer = await submitAnswer(
      sessionId,
      requestBody.questionId,
      requestBody.alternativeIds
    );

    return createResponse(200, answer);
  } catch (error) {
    console.error('Submit answer error:', error);

    if (error instanceof ItemNotFoundError) {
      return createResponse(404, {
        error: error.message,
      });
    }

    if (error instanceof DatabaseError) {
      return createResponse(400, {
        error: error.message,
      });
    }

    return createResponse(500, {
      error: 'An error occurred while submitting the answer. Please try again.',
    });
  }
}

/**
 * POST /api/exams/:sessionId/complete
 * 
 * Completes an exam session and returns the score with correct answers.
 * Requires active student role.
 * 
 * Request Headers:
 * Authorization: Bearer <token>
 * 
 * Path Parameters:
 * sessionId - Exam session ID
 * 
 * Response (Success - 200):
 * {
 *   "result": {
 *     "id": "uuid",
 *     "sessionId": "uuid",
 *     "studentId": "uuid",
 *     "courseCode": "CLF",
 *     "score": 45,
 *     "totalQuestions": 50,
 *     "completedAt": "2024-01-01T00:00:00.000Z"
 *   },
 *   "answers": [
 *     {
 *       "questionId": "uuid",
 *       "selectedAlternativeId": "uuid",
 *       "isCorrect": true,
 *       "correctAlternativeId": "uuid"
 *     },
 *     ...
 *   ]
 * }
 * 
 * Requirements:
 * - 4.3: WHEN a student completes an exam, THE System SHALL calculate and display score with correct answers
 */
export async function completeExamHandler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    // Check active student authentication
    const authHeader = event.headers.Authorization || event.headers.authorization;
    const authResult = await requireActiveStudent(authHeader);

    if (!authResult.authenticated) {
      return createResponse(authResult.statusCode || 403, {
        error: authResult.error || 'Active student access required',
      });
    }

    // Get session ID from path parameters
    const sessionId = event.pathParameters?.sessionId;
    if (!sessionId) {
      return createResponse(400, {
        error: 'Session ID is required',
      });
    }

    // Get the session to verify it belongs to the authenticated student
    const session = await getExamSession(sessionId);
    
    if (!session) {
      return createResponse(404, {
        error: 'Exam session not found',
      });
    }

    // Verify the session belongs to the authenticated student
    if (session.studentId !== authResult.userId) {
      console.warn(`Unauthorized attempt to complete exam: user ${authResult.userId} tried to access session for student ${session.studentId}`);
      return createResponse(403, {
        error: 'You do not have permission to complete this exam',
      });
    }

    // Complete exam
    const examResult = await completeExam(sessionId);

    return createResponse(200, examResult);
  } catch (error) {
    console.error('Complete exam error:', error);

    if (error instanceof ItemNotFoundError) {
      return createResponse(404, {
        error: error.message,
      });
    }

    if (error instanceof DatabaseError) {
      return createResponse(400, {
        error: error.message,
      });
    }

    return createResponse(500, {
      error: 'An error occurred while completing the exam. Please try again.',
    });
  }
}

/**
 * GET /api/exams/history
 * 
 * Gets the exam history for the authenticated student.
 * Excludes failed exam sessions.
 * Requires active student role.
 * 
 * Request Headers:
 * Authorization: Bearer <token>
 * 
 * Response (Success - 200):
 * [
 *   {
 *     "id": "uuid",
 *     "sessionId": "uuid",
 *     "studentId": "uuid",
 *     "courseCode": "CLF",
 *     "score": 45,
 *     "totalQuestions": 50,
 *     "completedAt": "2024-01-01T00:00:00.000Z"
 *   },
 *   ...
 * ]
 * 
 * Requirements:
 * - 3.5: THE System SHALL allow students to access exams from all historical enrollments
 * - 6.2: WHEN student exam attempts are completed, THE System SHALL store results
 */
export async function getExamHistoryHandler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    // Check active student authentication
    const authHeader = event.headers.Authorization || event.headers.authorization;
    const authResult = await requireActiveStudent(authHeader);

    if (!authResult.authenticated) {
      return createResponse(authResult.statusCode || 403, {
        error: authResult.error || 'Active student access required',
      });
    }

    // Get exam history
    const history = await getExamHistory(authResult.userId!);

    return createResponse(200, history);
  } catch (error) {
    console.error('Get exam history error:', error);

    return createResponse(500, {
      error: 'An error occurred while retrieving exam history. Please try again.',
    });
  }
}

/**
 * POST /api/exams/abandon
 * 
 * Abandons all active exam sessions for the current student.
 * This allows students who are stuck to start fresh.
 * 
 * Request Headers:
 * Authorization: Bearer <token>
 * 
 * Response (Success - 200):
 * {
 *   "success": true,
 *   "message": "Abandoned X active session(s)",
 *   "abandonedCount": 1
 * }
 */
export async function abandonExamHandler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    // Check active student authentication
    const authHeader = event.headers.Authorization || event.headers.authorization;
    const authResult = await requireActiveStudent(authHeader);

    if (!authResult.authenticated) {
      return createResponse(authResult.statusCode || 403, {
        error: authResult.error || 'Active student access required',
      });
    }

    // Force cleanup all active sessions for this student
    const abandonedCount = await forceCleanupActiveSessions(authResult.userId!);

    return createResponse(200, {
      success: true,
      message: `Abandoned ${abandonedCount} active session(s)`,
      abandonedCount,
    });
  } catch (error) {
    console.error('Abandon exam error:', error);

    return createResponse(500, {
      error: 'An error occurred while abandoning the exam. Please try again.',
    });
  }
}
