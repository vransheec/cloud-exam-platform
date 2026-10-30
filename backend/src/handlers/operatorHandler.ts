/**
 * Operator API Handlers
 * 
 * Provides HTTP endpoints for operator operations including student management,
 * enrollment management, and system configuration.
 * These handlers are designed to be deployed as serverless functions (AWS Lambda).
 * 
 * Endpoints:
 * - POST /api/students - Create student
 * - PUT /api/students/:id - Update student
 * - POST /api/students/:id/enrollments - Enroll in course
 * - PUT /api/students/:id/activate - Activate/deactivate account
 * - PUT /api/system/availability - Set site availability
 * 
 * Requirements:
 * - 5.1: Store student profile information
 * - 5.2: Allow multiple enrollments across providers
 * - 5.3: Grant access when account is activated
 * - 5.4: Revoke access when account is deactivated
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { requireOperator, requireAuthentication, requireRole } from '../middleware/authMiddleware';
import {
  createStudent,
  updateStudent,
  activateStudent,
  deactivateStudent,
  getStudent,
  deleteStudent,
} from '../services/studentService';
import { createEnrollment, getEnrollments } from '../services/enrollmentService';
import { setSiteAvailability, getSiteAvailability } from '../services/systemConfigService';
import { createCourse, updateCourse, deleteCourse, getCourse, getAllCourses } from '../services/courseService';
import { createAssistant, updateAssistant, deleteAssistant, getAssistant, getAllAssistants } from '../services/assistantService';
import { createCognitoUser, deleteCognitoUser, resetUserPassword, resetUserPasswordById, getAllStudentsFromCognito } from '../services/cognitoService';
import { DuplicateItemError, ItemNotFoundError, deleteItem, queryItems } from '../config/database';
import { env } from '../config/env';

/**
 * Create Student Request Body
 */
interface CreateStudentRequest {
  userId: string; // Email address
  name: string;
  password: string;
  isActive?: boolean;
}

/**
 * Update Student Request Body
 */
interface UpdateStudentRequest {
  name?: string;
}

/**
 * Create Enrollment Request Body
 */
interface CreateEnrollmentRequest {
  courseCode: string;
  courseSection: string;
  startDate: string; // ISO date string
  accessStartDate?: string; // Optional ISO date string, defaults to startDate
  accessEndDate?: string; // Optional ISO date string, defaults to 1 month after startDate
}

/**
 * Activate/Deactivate Request Body
 */
interface ActivateRequest {
  isActive: boolean;
}

/**
 * Set Site Availability Request Body
 */
interface SetSiteAvailabilityRequest {
  isAvailable: boolean;
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
 * POST /api/students
 * 
 * Creates a new student profile.
 * Requires operator role.
 * 
 * Request Headers:
 * Authorization: Bearer <token>
 * 
 * Request Body:
 * {
 *   "userId": "student@example.com",  // Email address
 *   "name": "John Doe",
 *   "password": "SecurePassword123!",
 *   "isActive": false  // Optional, defaults to false
 * }
 * 
 * Response (Success - 201):
 * {
 *   "userId": "cognito-sub-uuid",
 *   "name": "John Doe",
 *   "isActive": false,
 *   "createdAt": "2024-01-01T00:00:00.000Z",
 *   "updatedAt": "2024-01-01T00:00:00.000Z"
 * }
 * 
 * Requirements:
 * - 5.1: WHEN an operator creates a student record, THE System SHALL store student information
 * - Creates user in Cognito for authentication
 * - Creates student profile in DynamoDB
 */
export async function createStudentHandler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    // Check operator or assistant authentication
    const authHeader = event.headers.Authorization || event.headers.authorization;
    const authResult = await requireAuthentication(authHeader);
    const roleCheck = requireRole(authResult, ['operator', 'assistant']);

    if (!roleCheck.authenticated) {
      return createResponse(roleCheck.statusCode || 403, {
        error: roleCheck.error || 'Operator or assistant access required',
      });
    }

    // Parse request body
    if (!event.body) {
      return createResponse(400, {
        error: 'Request body is required',
      });
    }

    const requestBody: CreateStudentRequest = JSON.parse(event.body);

    // Validate required fields
    if (!requestBody.userId || !requestBody.name || !requestBody.password) {
      return createResponse(400, {
        error: 'userId (email), name, and password are required',
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(requestBody.userId)) {
      return createResponse(400, {
        error: 'userId must be a valid email address',
      });
    }

    // Step 1: Create user in Cognito
    let cognitoSub: string;
    try {
      cognitoSub = await createCognitoUser(
        requestBody.userId,
        requestBody.password,
        'student',
        requestBody.name
      );
    } catch (cognitoError) {
      console.error('Cognito user creation failed:', cognitoError);
      return createResponse(500, {
        error: cognitoError instanceof Error ? cognitoError.message : 'Failed to create user in Cognito',
      });
    }

    // Step 2: Create student profile in DynamoDB
    try {
      const student = await createStudent(
        cognitoSub,
        requestBody.userId, // email
        requestBody.name,
        requestBody.isActive || false
      );

      return createResponse(201, student);
    } catch (dbError) {
      // Rollback: Delete Cognito user if DynamoDB creation fails
      console.error('DynamoDB student creation failed, rolling back Cognito user:', dbError);
      try {
        await deleteCognitoUser(requestBody.userId);
      } catch (rollbackError) {
        console.error('Failed to rollback Cognito user:', rollbackError);
      }

      if (dbError instanceof DuplicateItemError) {
        return createResponse(409, {
          error: 'Student profile already exists for this user',
        });
      }

      return createResponse(500, {
        error: 'An error occurred while creating the student profile. Please try again.',
      });
    }
  } catch (error) {
    console.error('Create student error:', error);

    return createResponse(500, {
      error: 'An error occurred while creating the student. Please try again.',
    });
  }
}

/**
 * PUT /api/students/:id
 * 
 * Updates an existing student profile.
 * Requires operator role.
 * 
 * Request Headers:
 * Authorization: Bearer <token>
 * 
 * Path Parameters:
 * id - Student user ID
 * 
 * Request Body:
 * {
 *   "name": "Jane Doe"  // Optional
 * }
 * 
 * Response (Success - 200):
 * {
 *   "userId": "uuid",
 *   "name": "Jane Doe",
 *   "isActive": true,
 *   "createdAt": "2024-01-01T00:00:00.000Z",
 *   "updatedAt": "2024-01-02T00:00:00.000Z"
 * }
 * 
 * Requirements:
 * - 5.1: Allow updating student information
 */
export async function updateStudentHandler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    // Check operator authentication
    const authHeader = event.headers.Authorization || event.headers.authorization;
    const authResult = await requireOperator(authHeader);

    if (!authResult.authenticated) {
      return createResponse(authResult.statusCode || 403, {
        error: authResult.error || 'Operator access required',
      });
    }

    // Get student ID from path parameters
    const studentId = event.pathParameters?.id;
    if (!studentId) {
      return createResponse(400, {
        error: 'Student ID is required',
      });
    }

    // Parse request body
    if (!event.body) {
      return createResponse(400, {
        error: 'Request body is required',
      });
    }

    const requestBody: UpdateStudentRequest = JSON.parse(event.body);

    // Validate at least one field is provided
    if (!requestBody.name) {
      return createResponse(400, {
        error: 'Name field must be provided',
      });
    }

    // Update student
    const student = await updateStudent(studentId, requestBody);

    return createResponse(200, student);
  } catch (error) {
    console.error('Update student error:', error);

    if (error instanceof ItemNotFoundError) {
      return createResponse(404, {
        error: 'Student not found',
      });
    }

    return createResponse(500, {
      error: 'An error occurred while updating the student. Please try again.',
    });
  }
}

/**
 * POST /api/students/:id/enrollments
 * 
 * Enrolls a student in a course.
 * Requires operator role.
 * 
 * Request Headers:
 * Authorization: Bearer <token>
 * 
 * Path Parameters:
 * id - Student user ID
 * 
 * Request Body:
 * {
 *   "courseCode": "CLF",
 *   "startDate": "2024-01-01",  // ISO date string
 *   "accessStartDate": "2024-01-01"  // Optional ISO date string, defaults to startDate
 * }
 * 
 * Response (Success - 201):
 * {
 *   "id": "uuid",
 *   "studentId": "uuid",
 *   "courseCode": "CLF",
 *   "startDate": "2024-01-01T00:00:00.000Z",
 *   "accessStartDate": "2024-01-01T00:00:00.000Z",
 *   "accessEndDate": "2024-03-01T00:00:00.000Z",
 *   "enrolledAt": "2024-01-01T00:00:00.000Z"
 * }
 * 
 * Requirements:
 * - 5.2: WHEN an operator enrolls a student in courses, THE System SHALL allow multiple enrollments
 * - 5.7: WHEN a course start date is set, THE System SHALL automatically grant exam access
 * - 5.8: WHEN the access period expires, THE System SHALL automatically revoke exam access
 */
export async function createEnrollmentHandler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    // Check operator authentication
    const authHeader = event.headers.Authorization || event.headers.authorization;
    const authResult = await requireOperator(authHeader);

    if (!authResult.authenticated) {
      return createResponse(authResult.statusCode || 403, {
        error: authResult.error || 'Operator access required',
      });
    }

    // Get student ID from path parameters
    const studentId = event.pathParameters?.id;
    if (!studentId) {
      return createResponse(400, {
        error: 'Student ID is required',
      });
    }

    // Parse request body
    if (!event.body) {
      return createResponse(400, {
        error: 'Request body is required',
      });
    }

    const requestBody: CreateEnrollmentRequest = JSON.parse(event.body);

    // Validate required fields
    if (!requestBody.courseCode || !requestBody.courseSection || !requestBody.startDate) {
      return createResponse(400, {
        error: 'courseCode, courseSection, and startDate are required',
      });
    }

    // Parse start date
    const startDate = new Date(requestBody.startDate);
    if (isNaN(startDate.getTime())) {
      return createResponse(400, {
        error: 'Invalid startDate format. Use ISO date string (YYYY-MM-DD)',
      });
    }

    // Parse optional access start date
    let accessStartDate: Date | undefined;
    if (requestBody.accessStartDate) {
      accessStartDate = new Date(requestBody.accessStartDate);
      if (isNaN(accessStartDate.getTime())) {
        return createResponse(400, {
          error: 'Invalid accessStartDate format. Use ISO date string (YYYY-MM-DD)',
        });
      }
    }

    // Parse optional access end date
    let accessEndDate: Date | undefined;
    if (requestBody.accessEndDate) {
      accessEndDate = new Date(requestBody.accessEndDate);
      if (isNaN(accessEndDate.getTime())) {
        return createResponse(400, {
          error: 'Invalid accessEndDate format. Use ISO date string (YYYY-MM-DD)',
        });
      }
    }

    // Create enrollment
    const enrollment = await createEnrollment(
      studentId,
      requestBody.courseCode,
      requestBody.courseSection,
      startDate,
      accessStartDate,
      accessEndDate
    );

    return createResponse(201, enrollment);
  } catch (error) {
    console.error('Create enrollment error:', error);

    if (error instanceof ItemNotFoundError) {
      return createResponse(404, {
        error: 'Student not found',
      });
    }

    return createResponse(500, {
      error: 'An error occurred while creating the enrollment. Please try again.',
    });
  }
}

/**
 * PUT /api/students/:id/activate
 * 
 * Activates or deactivates a student account.
 * Requires operator role.
 * 
 * Request Headers:
 * Authorization: Bearer <token>
 * 
 * Path Parameters:
 * id - Student user ID
 * 
 * Request Body:
 * {
 *   "isActive": true  // true to activate, false to deactivate
 * }
 * 
 * Response (Success - 200):
 * {
 *   "userId": "uuid",
 *   "name": "John Doe",
 *   "isActive": true,
 *   "createdAt": "2024-01-01T00:00:00.000Z",
 *   "updatedAt": "2024-01-02T00:00:00.000Z"
 * }
 * 
 * Requirements:
 * - 5.3: WHEN an operator activates a student account, THE System SHALL grant access
 * - 5.4: WHEN an operator deactivates a student account, THE System SHALL revoke access
 */
export async function activateStudentHandler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    // Check operator authentication
    const authHeader = event.headers.Authorization || event.headers.authorization;
    const authResult = await requireOperator(authHeader);

    if (!authResult.authenticated) {
      return createResponse(authResult.statusCode || 403, {
        error: authResult.error || 'Operator access required',
      });
    }

    // Get student ID from path parameters
    const studentId = event.pathParameters?.id;
    if (!studentId) {
      return createResponse(400, {
        error: 'Student ID is required',
      });
    }

    // Parse request body
    if (!event.body) {
      return createResponse(400, {
        error: 'Request body is required',
      });
    }

    const requestBody: ActivateRequest = JSON.parse(event.body);

    // Validate required field
    if (requestBody.isActive === undefined) {
      return createResponse(400, {
        error: 'isActive field is required',
      });
    }

    // Activate or deactivate student
    const student = requestBody.isActive
      ? await activateStudent(studentId)
      : await deactivateStudent(studentId);

    return createResponse(200, student);
  } catch (error) {
    console.error('Activate/deactivate student error:', error);

    if (error instanceof ItemNotFoundError) {
      return createResponse(404, {
        error: 'Student not found',
      });
    }

    return createResponse(500, {
      error: 'An error occurred while updating student activation status. Please try again.',
    });
  }
}

/**
 * PUT /api/system/availability
 * 
 * Sets the site availability status.
 * Requires operator role.
 * 
 * Request Headers:
 * Authorization: Bearer <token>
 * 
 * Request Body:
 * {
 *   "isAvailable": true  // true to enable site, false to disable
 * }
 * 
 * Response (Success - 200):
 * {
 *   "key": "site_available",
 *   "value": true,
 *   "updatedBy": "uuid",
 *   "updatedAt": "2024-01-01T00:00:00.000Z"
 * }
 * 
 * Requirements:
 * - Property 31: Site availability control
 */
export async function setSiteAvailabilityHandler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    // Check operator authentication
    const authHeader = event.headers.Authorization || event.headers.authorization;
    const authResult = await requireOperator(authHeader);

    if (!authResult.authenticated) {
      return createResponse(authResult.statusCode || 403, {
        error: authResult.error || 'Operator access required',
      });
    }

    // Parse request body
    if (!event.body) {
      return createResponse(400, {
        error: 'Request body is required',
      });
    }

    const requestBody: SetSiteAvailabilityRequest = JSON.parse(event.body);

    // Validate required field
    if (requestBody.isAvailable === undefined) {
      return createResponse(400, {
        error: 'isAvailable field is required',
      });
    }

    // Set site availability
    const config = await setSiteAvailability(
      requestBody.isAvailable,
      authResult.userId!
    );

    return createResponse(200, config);
  } catch (error) {
    console.error('Set site availability error:', error);

    return createResponse(500, {
      error: 'An error occurred while setting site availability. Please try again.',
    });
  }
}

/**
 * GET /api/system/availability
 * 
 * Gets the current site availability status.
 * Requires operator role.
 * 
 * Request Headers:
 * Authorization: Bearer <token>
 * 
 * Response (Success - 200):
 * {
 *   "isAvailable": true
 * }
 */
export async function getSiteAvailabilityHandler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    // Check operator authentication
    const authHeader = event.headers.Authorization || event.headers.authorization;
    const authResult = await requireOperator(authHeader);

    if (!authResult.authenticated) {
      return createResponse(authResult.statusCode || 403, {
        error: authResult.error || 'Operator access required',
      });
    }

    // Get site availability
    const isAvailable = await getSiteAvailability();

    return createResponse(200, { isAvailable });
  } catch (error) {
    console.error('Get site availability error:', error);

    return createResponse(500, {
      error: 'An error occurred while getting site availability. Please try again.',
    });
  }
}

/**
 * GET /api/students/:id
 * 
 * Gets a student profile with enrollment information.
 * Requires operator role.
 * 
 * Request Headers:
 * Authorization: Bearer <token>
 * 
 * Path Parameters:
 * id - Student user ID
 * 
 * Response (Success - 200):
 * {
 *   "student": {
 *     "userId": "uuid",
 *     "name": "John Doe",
 *     "isActive": true,
 *     "createdAt": "2024-01-01T00:00:00.000Z",
 *     "updatedAt": "2024-01-01T00:00:00.000Z"
 *   },
 *   "enrollments": [...]
 * }
 * 
 * Requirements:
 * - 5.6: WHEN viewing student records, THE System SHALL display current access status and enrollments
 */
export async function getStudentHandler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    // Check operator authentication
    const authHeader = event.headers.Authorization || event.headers.authorization;
    const authResult = await requireOperator(authHeader);

    if (!authResult.authenticated) {
      return createResponse(authResult.statusCode || 403, {
        error: authResult.error || 'Operator access required',
      });
    }

    // Get student ID from path parameters
    const studentId = event.pathParameters?.id;
    if (!studentId) {
      return createResponse(400, {
        error: 'Student ID is required',
      });
    }

    // Get student and enrollments
    const student = await getStudent(studentId);
    if (!student) {
      return createResponse(404, {
        error: 'Student not found',
      });
    }

    const enrollments = await getEnrollments(studentId);

    return createResponse(200, {
      student,
      enrollments,
    });
  } catch (error) {
    console.error('Get student error:', error);

    return createResponse(500, {
      error: 'An error occurred while retrieving student information. Please try again.',
    });
  }
}


/**
 * POST /api/courses
 * 
 * Creates a new course.
 * Requires operator role.
 * 
 * Request Body:
 * {
 *   "code": "NEWCERT",
 *   "name": "New Certification",
 *   "provider": "AWS",
 *   "description": "Description of the course"
 * }
 */
export async function createCourseHandler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const authHeader = event.headers.Authorization || event.headers.authorization;
    const authResult = await requireOperator(authHeader);

    if (!authResult.authenticated) {
      return createResponse(authResult.statusCode || 403, {
        error: authResult.error || 'Operator access required',
      });
    }

    if (!event.body) {
      return createResponse(400, {
        error: 'Request body is required',
      });
    }

    const { code, name, provider, description, examQuestionCount, passingPercentage, badgeImageUrl } = JSON.parse(event.body);

    if (!code || !name || !provider || !description) {
      return createResponse(400, {
        error: 'code, name, provider, and description are required',
      });
    }

    const course = await createCourse(code, name, provider, description, examQuestionCount, passingPercentage);
    
    // If badgeImageUrl is provided, update the course with it
    if (badgeImageUrl !== undefined) {
      const updatedCourse = await updateCourse(code, { badgeImageUrl });
      return createResponse(201, updatedCourse);
    }
    
    return createResponse(201, course);
  } catch (error) {
    console.error('Create course error:', error);

    if (error instanceof DuplicateItemError) {
      return createResponse(409, {
        error: 'Course with this code already exists',
      });
    }

    return createResponse(500, {
      error: 'An error occurred while creating the course. Please try again.',
    });
  }
}

/**
 * PUT /api/courses/:code
 * 
 * Updates an existing course.
 * Requires operator role.
 */
export async function updateCourseHandler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const authHeader = event.headers.Authorization || event.headers.authorization;
    const authResult = await requireOperator(authHeader);

    if (!authResult.authenticated) {
      return createResponse(authResult.statusCode || 403, {
        error: authResult.error || 'Operator access required',
      });
    }

    const code = event.pathParameters?.code;
    if (!code) {
      return createResponse(400, {
        error: 'Course code is required',
      });
    }

    if (!event.body) {
      return createResponse(400, {
        error: 'Request body is required',
      });
    }

    const updates = JSON.parse(event.body);

    if (!updates.name && !updates.provider && !updates.description) {
      return createResponse(400, {
        error: 'At least one field (name, provider, description) must be provided',
      });
    }

    const course = await updateCourse(code, updates);
    return createResponse(200, course);
  } catch (error) {
    console.error('Update course error:', error);

    if (error instanceof ItemNotFoundError) {
      return createResponse(404, {
        error: 'Course not found',
      });
    }

    return createResponse(500, {
      error: 'An error occurred while updating the course. Please try again.',
    });
  }
}

/**
 * DELETE /api/courses/:code
 * 
 * Deletes a course.
 * Requires operator role.
 */
export async function deleteCourseHandler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const authHeader = event.headers.Authorization || event.headers.authorization;
    const authResult = await requireOperator(authHeader);

    if (!authResult.authenticated) {
      return createResponse(authResult.statusCode || 403, {
        error: authResult.error || 'Operator access required',
      });
    }

    const code = event.pathParameters?.code;
    if (!code) {
      return createResponse(400, {
        error: 'Course code is required',
      });
    }

    await deleteCourse(code);
    return createResponse(200, { message: 'Course deleted successfully' });
  } catch (error) {
    console.error('Delete course error:', error);

    if (error instanceof ItemNotFoundError) {
      return createResponse(404, {
        error: 'Course not found',
      });
    }

    return createResponse(500, {
      error: 'An error occurred while deleting the course. Please try again.',
    });
  }
}

/**
 * GET /api/courses
 * 
 * Gets all courses.
 * Requires operator role.
 */
export async function getAllCoursesHandler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const authHeader = event.headers.Authorization || event.headers.authorization;
    const authResult = await requireOperator(authHeader);

    if (!authResult.authenticated) {
      return createResponse(authResult.statusCode || 403, {
        error: authResult.error || 'Operator access required',
      });
    }

    const courses = await getAllCourses();
    return createResponse(200, { courses });
  } catch (error) {
    console.error('Get courses error:', error);

    return createResponse(500, {
      error: 'An error occurred while retrieving courses. Please try again.',
    });
  }
}

/**
 * GET /api/courses/:code
 * 
 * Gets a single course by code.
 * Requires operator role.
 */
export async function getCourseHandler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const authHeader = event.headers.Authorization || event.headers.authorization;
    const authResult = await requireOperator(authHeader);

    if (!authResult.authenticated) {
      return createResponse(authResult.statusCode || 403, {
        error: authResult.error || 'Operator access required',
      });
    }

    const code = event.pathParameters?.code;
    if (!code) {
      return createResponse(400, {
        error: 'Course code is required',
      });
    }

    const course = await getCourse(code);
    if (!course) {
      return createResponse(404, {
        error: 'Course not found',
      });
    }

    return createResponse(200, course);
  } catch (error) {
    console.error('Get course error:', error);

    return createResponse(500, {
      error: 'An error occurred while retrieving the course. Please try again.',
    });
  }
}

/**
 * POST /api/assistants
 * 
 * Creates a new assistant user.
 * Requires operator role.
 * 
 * Request Body:
 * {
 *   "email": "assistant@example.com",
 *   "password": "SecurePassword123!",
 *   "name": "Assistant Name"  // Optional
 * }
 * 
 * Creates user in both Cognito (for authentication) and DynamoDB (for profile data).
 */
export async function createAssistantHandler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const authHeader = event.headers.Authorization || event.headers.authorization;
    const authResult = await requireOperator(authHeader);

    if (!authResult.authenticated) {
      return createResponse(authResult.statusCode || 403, {
        error: authResult.error || 'Operator access required',
      });
    }

    if (!event.body) {
      return createResponse(400, {
        error: 'Request body is required',
      });
    }

    const { email, password, name } = JSON.parse(event.body);

    if (!email || !password) {
      return createResponse(400, {
        error: 'email and password are required',
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return createResponse(400, {
        error: 'email must be a valid email address',
      });
    }

    // Create assistant using the Cognito-only service
    try {
      const assistant = await createAssistant(email, password, name);
      return createResponse(201, assistant);
    } catch (error) {
      console.error('Assistant creation failed:', error);
      
      if (error instanceof DuplicateItemError) {
        return createResponse(409, {
          error: 'An assistant with this email already exists. Please use a different email address.',
        });
      }

      // Check for Cognito-specific duplicate user errors
      if (error instanceof Error && (
        error.message.includes('already exists') || 
        error.message.includes('UsernameExistsException') ||
        error.message.includes('duplicate')
      )) {
        return createResponse(409, {
          error: 'An assistant with this email already exists. Please use a different email address.',
        });
      }

      return createResponse(500, {
        error: 'An error occurred while creating the assistant. Please try again.',
      });
    }
  } catch (error) {
    console.error('Create assistant error:', error);

    return createResponse(500, {
      error: 'An error occurred while creating the assistant. Please try again.',
    });
  }
}

/**
 * PUT /api/assistants/:id
 * 
 * Updates an existing assistant.
 * Requires operator role.
 */
export async function updateAssistantHandler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const authHeader = event.headers.Authorization || event.headers.authorization;
    const authResult = await requireOperator(authHeader);

    if (!authResult.authenticated) {
      return createResponse(authResult.statusCode || 403, {
        error: authResult.error || 'Operator access required',
      });
    }

    const id = event.pathParameters?.id;
    if (!id) {
      return createResponse(400, {
        error: 'Assistant ID is required',
      });
    }

    if (!event.body) {
      return createResponse(400, {
        error: 'Request body is required',
      });
    }

    const updates = JSON.parse(event.body);

    if (!updates.name && !updates.email) {
      return createResponse(400, {
        error: 'At least one field (name, email) must be provided',
      });
    }

    const assistant = await updateAssistant(id, updates);
    return createResponse(200, assistant);
  } catch (error) {
    console.error('Update assistant error:', error);

    if (error instanceof ItemNotFoundError) {
      return createResponse(404, {
        error: 'Assistant not found',
      });
    }

    if (error instanceof DuplicateItemError) {
      return createResponse(409, {
        error: 'Assistant with this email already exists',
      });
    }

    return createResponse(500, {
      error: 'An error occurred while updating the assistant. Please try again.',
    });
  }
}

/**
 * DELETE /api/assistants/:id
 * 
 * Deletes an assistant user.
 * Requires operator role.
 */
export async function deleteAssistantHandler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const authHeader = event.headers.Authorization || event.headers.authorization;
    const authResult = await requireOperator(authHeader);

    if (!authResult.authenticated) {
      return createResponse(authResult.statusCode || 403, {
        error: authResult.error || 'Operator access required',
      });
    }

    const id = event.pathParameters?.id;
    if (!id) {
      return createResponse(400, {
        error: 'Assistant ID is required',
      });
    }

    await deleteAssistant(id);
    return createResponse(200, { message: 'Assistant deleted successfully' });
  } catch (error) {
    console.error('Delete assistant error:', error);

    if (error instanceof ItemNotFoundError) {
      return createResponse(404, {
        error: 'Assistant not found',
      });
    }

    return createResponse(500, {
      error: 'An error occurred while deleting the assistant. Please try again.',
    });
  }
}

/**
 * GET /api/assistants
 * 
 * Gets all assistants.
 * Requires operator role.
 */
export async function getAllAssistantsHandler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const authHeader = event.headers.Authorization || event.headers.authorization;
    const authResult = await requireOperator(authHeader);

    if (!authResult.authenticated) {
      return createResponse(authResult.statusCode || 403, {
        error: authResult.error || 'Operator access required',
      });
    }

    const assistants = await getAllAssistants();
    return createResponse(200, { assistants });
  } catch (error) {
    console.error('Get assistants error:', error);

    return createResponse(500, {
      error: 'An error occurred while retrieving assistants. Please try again.',
    });
  }
}

/**
 * GET /api/assistants/:id
 * 
 * Gets a single assistant by ID.
 * Requires operator role.
 */
export async function getAssistantHandler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const authHeader = event.headers.Authorization || event.headers.authorization;
    const authResult = await requireOperator(authHeader);

    if (!authResult.authenticated) {
      return createResponse(authResult.statusCode || 403, {
        error: authResult.error || 'Operator access required',
      });
    }

    const id = event.pathParameters?.id;
    if (!id) {
      return createResponse(400, {
        error: 'Assistant ID is required',
      });
    }

    const assistant = await getAssistant(id);
    if (!assistant) {
      return createResponse(404, {
        error: 'Assistant not found',
      });
    }

    return createResponse(200, assistant);
  } catch (error) {
    console.error('Get assistant error:', error);

    return createResponse(500, {
      error: 'An error occurred while retrieving the assistant. Please try again.',
    });
  }
}


/**
 * GET /api/students
 * 
 * Gets all students from Cognito.
 * Requires operator role.
 */
export async function getAllStudentsHandler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const authHeader = event.headers.Authorization || event.headers.authorization;
    const authResult = await requireOperator(authHeader);

    if (!authResult.authenticated) {
      return createResponse(authResult.statusCode || 403, {
        error: authResult.error || 'Operator access required',
      });
    }

    // Use Cognito as the source of truth for students (same as assistant handler)
    const students = await getAllStudentsFromCognito();
    
    // Enrich with enrollment data
    const { getEnrollments } = await import('../services/enrollmentService');
    const enrichedStudents = await Promise.all(
      students.map(async (student: any) => {
        try {
          const enrollments = await getEnrollments(student.userId);
          return {
            ...student,
            enrollments: enrollments.map((e: any) => ({
              courseCode: e.courseCode,
              enrollmentType: e.enrollmentType || 'full',
              accessEndDate: e.accessEndDate,
            })),
          };
        } catch {
          return { ...student, enrollments: [] };
        }
      })
    );
    
    return createResponse(200, { students: enrichedStudents });
  } catch (error) {
    console.error('Get all students error:', error);

    return createResponse(500, {
      error: 'An error occurred while retrieving students. Please try again.',
    });
  }
}


/**
 * PUT /api/students/:id/reset-password
 * 
 * Resets a student's password.
 * Requires operator or assistant role.
 * 
 * Request Headers:
 * Authorization: Bearer <token>
 * 
 * Path Parameters:
 * id - Student user ID
 * 
 * Request Body:
 * {
 *   "newPassword": "NewSecurePassword123!"
 * }
 * 
 * Response (Success - 200):
 * {
 *   "message": "Password reset successfully"
 * }
 */
export async function resetStudentPasswordHandler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    // Check operator or assistant authentication
    const authHeader = event.headers.Authorization || event.headers.authorization;
    const authResult = await requireAuthentication(authHeader);
    const roleCheck = requireRole(authResult, ['operator', 'assistant']);

    if (!roleCheck.authenticated) {
      return createResponse(roleCheck.statusCode || 403, {
        error: roleCheck.error || 'Operator or assistant access required',
      });
    }

    // Get student ID from path parameters
    const studentId = event.pathParameters?.id;
    if (!studentId) {
      return createResponse(400, {
        error: 'Student ID is required',
      });
    }

    // Parse request body
    if (!event.body) {
      return createResponse(400, {
        error: 'Request body is required',
      });
    }

    const { newPassword } = JSON.parse(event.body);

    // Validate new password
    if (!newPassword || newPassword.length < 8) {
      return createResponse(400, {
        error: 'New password is required and must be at least 8 characters',
      });
    }

    // Reset password in Cognito using the user ID (Cognito sub)
    await resetUserPasswordById(studentId, newPassword);

    return createResponse(200, {
      message: 'Password reset successfully',
    });
  } catch (error) {
    console.error('Reset student password error:', error);

    if (error instanceof ItemNotFoundError) {
      return createResponse(404, {
        error: 'Student not found',
      });
    }

    return createResponse(500, {
      error: 'An error occurred while resetting the password. Please try again.',
    });
  }
}

/**
 * PUT /api/assistants/:id/reset-password
 * 
 * Resets an assistant's password.
 * Requires operator role.
 * 
 * Request Headers:
 * Authorization: Bearer <token>
 * 
 * Path Parameters:
 * id - Assistant ID (email)
 * 
 * Request Body:
 * {
 *   "newPassword": "NewSecurePassword123!"
 * }
 * 
 * Response (Success - 200):
 * {
 *   "message": "Password reset successfully"
 * }
 */
export async function resetAssistantPasswordHandler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    // Check operator authentication
    const authHeader = event.headers.Authorization || event.headers.authorization;
    const authResult = await requireOperator(authHeader);

    if (!authResult.authenticated) {
      return createResponse(authResult.statusCode || 403, {
        error: authResult.error || 'Operator access required',
      });
    }

    // Get assistant ID (email) from path parameters
    const assistantId = event.pathParameters?.id;
    if (!assistantId) {
      return createResponse(400, {
        error: 'Assistant ID is required',
      });
    }

    // Parse request body
    if (!event.body) {
      return createResponse(400, {
        error: 'Request body is required',
      });
    }

    const { newPassword } = JSON.parse(event.body);

    // Validate new password
    if (!newPassword || newPassword.length < 8) {
      return createResponse(400, {
        error: 'New password is required and must be at least 8 characters',
      });
    }

    // Check if assistantId is an email (contains @) or a Cognito sub ID
    if (assistantId.includes('@')) {
      // assistantId is an email, use it directly
      await resetUserPassword(assistantId, newPassword);
    } else {
      // assistantId is a Cognito sub ID, use the optimized function
      await resetUserPasswordById(assistantId, newPassword);
    }

    return createResponse(200, {
      message: 'Password reset successfully',
    });
  } catch (error) {
    console.error('Reset assistant password error:', error);

    if (error instanceof ItemNotFoundError) {
      return createResponse(404, {
        error: 'Assistant not found',
      });
    }

    return createResponse(500, {
      error: 'An error occurred while resetting the password. Please try again.',
    });
  }
}


/**
 * DELETE /api/students/:id
 * 
 * Deletes a student account completely.
 * Removes from both Cognito and DynamoDB.
 * Requires operator role.
 * 
 * Request Headers:
 * Authorization: Bearer <token>
 * 
 * Path Parameters:
 * id - Student user ID (Cognito sub)
 * 
 * Response (Success - 200):
 * {
 *   "message": "Student deleted successfully"
 * }
 */
export async function deleteStudentHandler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    // Check operator authentication
    const authHeader = event.headers.Authorization || event.headers.authorization;
    const authResult = await requireOperator(authHeader);

    if (!authResult.authenticated) {
      return createResponse(authResult.statusCode || 403, {
        error: authResult.error || 'Operator access required',
      });
    }

    // Get student ID from path parameters
    const studentId = event.pathParameters?.id;
    if (!studentId) {
      return createResponse(400, {
        error: 'Student ID is required',
      });
    }

    // Get student to find their email for Cognito deletion
    const student = await getStudent(studentId);
    if (!student) {
      return createResponse(404, {
        error: 'Student not found',
      });
    }

    // 1. Delete enrollments
    try {
      const enrollments = await queryItems<any>(
        env.enrollmentsTable,
        'studentId = :studentId',
        { ':studentId': studentId },
        'studentId-courseCode-index'
      );
      for (const enrollment of enrollments) {
        await deleteItem(env.enrollmentsTable, { id: enrollment.id });
      }
      console.log(`Deleted ${enrollments.length} enrollments for student ${studentId}`);
    } catch (err) {
      console.error('Error deleting enrollments:', err);
    }

    // 2. Delete exam sessions and their answers
    try {
      const sessions = await queryItems<any>(
        env.examSessionsTable,
        'studentId = :studentId',
        { ':studentId': studentId },
        'studentId-startTime-index'
      );
      for (const session of sessions) {
        // Delete answers for this session
        const answers = await queryItems<any>(
          env.answersTable,
          'sessionId = :sessionId',
          { ':sessionId': session.id },
          'sessionId-questionId-index'
        );
        for (const answer of answers) {
          await deleteItem(env.answersTable, { id: answer.id });
        }
        // Delete the session itself
        await deleteItem(env.examSessionsTable, { id: session.id });
      }
      console.log(`Deleted ${sessions.length} exam sessions for student ${studentId}`);
    } catch (err) {
      console.error('Error deleting exam sessions:', err);
    }

    // 3. Delete exam results
    try {
      const results = await queryItems<any>(
        env.examResultsTable,
        'studentId = :studentId',
        { ':studentId': studentId },
        'studentId-completedAt-index'
      );
      for (const result of results) {
        await deleteItem(env.examResultsTable, { id: result.id });
      }
      console.log(`Deleted ${results.length} exam results for student ${studentId}`);
    } catch (err) {
      console.error('Error deleting exam results:', err);
    }

    // 4. Delete from Cognito
    try {
      await deleteCognitoUser(student.email);
    } catch (cognitoError) {
      console.error('Failed to delete student from Cognito:', cognitoError);
      // Continue with DynamoDB deletion even if Cognito fails
      // (user might have been manually deleted from Cognito)
    }

    // 5. Delete from DynamoDB (student record)
    await deleteStudent(studentId);

    return createResponse(200, {
      message: 'Student deleted successfully',
    });
  } catch (error) {
    console.error('Delete student error:', error);

    if (error instanceof ItemNotFoundError) {
      return createResponse(404, {
        error: 'Student not found',
      });
    }

    return createResponse(500, {
      error: 'An error occurred while deleting the student. Please try again.',
    });
  }
}


/**
 * POST /api/students/bulk
 * 
 * Creates multiple students at once from bulk import data.
 * Requires operator or assistant role.
 * 
 * Request Headers:
 * Authorization: Bearer <token>
 * 
 * Request Body:
 * {
 *   "students": [
 *     { "name": "John Doe", "email": "john@example.com", "password": "Password123!" },
 *     { "name": "Jane Doe", "email": "jane@example.com", "password": "Password456!" }
 *   ]
 * }
 * 
 * Response (Success - 200):
 * {
 *   "results": [
 *     { "email": "john@example.com", "success": true, "student": {...} },
 *     { "email": "jane@example.com", "success": false, "error": "User already exists" }
 *   ],
 *   "summary": { "total": 2, "successful": 1, "failed": 1 }
 * }
 */
export async function bulkCreateStudentsHandler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    // Check operator or assistant authentication
    const authHeader = event.headers.Authorization || event.headers.authorization;
    const authResult = await requireAuthentication(authHeader);
    const roleCheck = requireRole(authResult, ['operator', 'assistant']);

    if (!roleCheck.authenticated) {
      return createResponse(roleCheck.statusCode || 403, {
        error: roleCheck.error || 'Operator or assistant access required',
      });
    }

    // Parse request body
    if (!event.body) {
      return createResponse(400, {
        error: 'Request body is required',
      });
    }

    const { students } = JSON.parse(event.body);

    if (!students || !Array.isArray(students) || students.length === 0) {
      return createResponse(400, {
        error: 'students array is required and must not be empty',
      });
    }

    if (students.length > 100) {
      return createResponse(400, {
        error: 'Maximum 100 students can be imported at once',
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const results: Array<{
      email: string;
      name: string;
      success: boolean;
      student?: any;
      error?: string;
    }> = [];

    // Process each student
    for (const studentData of students) {
      const { name, email, password } = studentData;

      // Validate required fields
      if (!name || !email || !password) {
        results.push({
          email: email || 'unknown',
          name: name || 'unknown',
          success: false,
          error: 'name, email, and password are required',
        });
        continue;
      }

      // Validate email format
      if (!emailRegex.test(email)) {
        results.push({
          email,
          name,
          success: false,
          error: 'Invalid email format',
        });
        continue;
      }

      // Validate password length
      if (password.length < 8) {
        results.push({
          email,
          name,
          success: false,
          error: 'Password must be at least 8 characters',
        });
        continue;
      }

      try {
        // Create user in Cognito
        const cognitoSub = await createCognitoUser(email, password, 'student', name);

        // Create student profile in DynamoDB
        const student = await createStudent(cognitoSub, email, name, true);

        results.push({
          email,
          name,
          success: true,
          student,
        });
      } catch (error) {
        console.error(`Failed to create student ${email}:`, error);
        
        let errorMessage = 'Failed to create student';
        if (error instanceof Error) {
          if (error.message.includes('already exists') || error.message.includes('UsernameExistsException')) {
            errorMessage = 'User with this email already exists';
          } else {
            errorMessage = error.message;
          }
        }

        results.push({
          email,
          name,
          success: false,
          error: errorMessage,
        });
      }
    }

    const summary = {
      total: results.length,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
    };

    return createResponse(200, { results, summary });
  } catch (error) {
    console.error('Bulk create students error:', error);

    return createResponse(500, {
      error: 'An error occurred while creating students. Please try again.',
    });
  }
}
