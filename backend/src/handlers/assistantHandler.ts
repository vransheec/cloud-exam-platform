/**
 * Assistant API Handlers
 * 
 * Provides HTTP endpoints for assistant operations including question management
 * and image uploads.
 * These handlers are designed to be deployed as serverless functions (AWS Lambda).
 * 
 * Endpoints:
 * - POST /api/questions - Create question
 * - PUT /api/questions/:id - Update question
 * - DELETE /api/questions/:id - Delete question
 * - POST /api/images/upload - Upload image
 * 
 * Requirements:
 * - 2.1: Upload questions with alternatives
 * - 2.2: Validate course codes
 * - 2.3: Store questions with proper categorization
 * - 2.4: Allow updating which alternative is correct
 * - 2.5: Preserve question history
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { requireContentManager } from '../middleware/authMiddleware';
import {
  createQuestion,
  updateQuestion,
  deleteQuestion,
  getQuestion,
  getQuestionsByCourse,
} from '../services/questionService';
import { createEnrollment, getEnrollments } from '../services/enrollmentService';
import { getAllCourses, createCourse, updateCourse } from '../services/courseService';
import { resetUserPasswordById, createCognitoUser, getAllStudentsFromCognito, enableMultipleCognitoUsers, disableMultipleCognitoUsers, disableCognitoUser, deleteCognitoUser } from '../services/cognitoService';
import { uploadImage, ImageUploadError } from '../services/imageUploadService';
import { ItemNotFoundError, DatabaseError, deleteItem, queryItems } from '../config/database';
import { env } from '../config/env';

/**
 * Create Question Request Body
 */
interface CreateQuestionRequest {
  courseCode: string;
  questionText: string;
  questionType: 'single' | 'multiple' | 'dropdown' | 'truefalse' | 'ordering';
  imageUrl?: string | null;
  explanation?: string | null;
  incorrectExplanation?: string | null;
  extendedData?: any | null;
  alternatives: Array<{
    text: string;
    imageUrl?: string | null;
    isCorrect: boolean;
    order?: number;
  }>;
}

/**
 * Update Question Request Body
 */
interface UpdateQuestionRequest {
  questionText?: string;
  imageUrl?: string | null;
  correctAlternativeId?: string;
  explanation?: string | null;
  incorrectExplanation?: string | null;
  alternatives?: Array<{
    id: string;
    text?: string;
    imageUrl?: string | null;
    isCorrect?: boolean;
  }>;
}

/**
 * Create Student Request Body (for assistants)
 */
interface CreateStudentRequest {
  userId: string; // Email address
  name: string;
  password: string;
  isActive: boolean;
}

/**
 * Reset Student Password Request Body
 */
interface ResetStudentPasswordRequest {
  newPassword: string;
}

/**
 * Create Enrollment Request Body
 */
interface CreateEnrollmentRequest {
  studentId: string;
  courseCode: string;
  courseSection: string;
  startDate: string;
  accessStartDate?: string;
  accessEndDate?: string;
}

/**
 * Bulk Student Activation Request Body
 */
interface BulkStudentActivationRequest {
  studentIds: string[];
  action: 'activate' | 'deactivate';
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
 * POST /api/questions
 * 
 * Creates a new question with alternatives.
 * Requires assistant or operator role.
 * 
 * Request Headers:
 * Authorization: Bearer <token>
 * 
 * Request Body:
 * {
 *   "courseCode": "CLF",
 *   "questionText": "What is AWS?",
 *   "imageUrl": "https://...",  // Optional
 *   "alternatives": [
 *     {
 *       "text": "A cloud platform",
 *       "imageUrl": "https://...",  // Optional
 *       "isCorrect": true,
 *       "order": 0  // Optional
 *     },
 *     {
 *       "text": "A database",
 *       "isCorrect": false,
 *       "order": 1
 *     }
 *   ]
 * }
 * 
 * Response (Success - 201):
 * {
 *   "question": {
 *     "id": "uuid",
 *     "courseCode": "CLF",
 *     "questionText": "What is AWS?",
 *     "imageUrl": "https://...",
 *     "createdBy": "uuid",
 *     "createdAt": "2024-01-01T00:00:00.000Z",
 *     "updatedAt": "2024-01-01T00:00:00.000Z",
 *     "version": 1
 *   },
 *   "alternatives": [...]
 * }
 * 
 * Requirements:
 * - 2.1: WHEN an assistant uploads a question, THE System SHALL require question text and alternatives
 * - 2.2: WHEN an assistant associates a question with an exam, THE System SHALL validate course code
 * - 2.3: WHEN an assistant saves a question, THE System SHALL store it with proper categorization
 */
export async function createQuestionHandler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    // Check assistant/operator authentication
    const authHeader = event.headers.Authorization || event.headers.authorization;
    const authResult = await requireContentManager(authHeader);

    if (!authResult.authenticated) {
      return createResponse(authResult.statusCode || 403, {
        error: authResult.error || 'Assistant or operator access required',
      });
    }

    // Parse request body
    if (!event.body) {
      return createResponse(400, {
        error: 'Request body is required',
      });
    }

    const requestBody: CreateQuestionRequest = JSON.parse(event.body);

    // Validate required fields
    if (!requestBody.courseCode || !requestBody.questionText || !requestBody.questionType || !requestBody.alternatives) {
      return createResponse(400, {
        error: 'courseCode, questionText, questionType, and alternatives are required',
      });
    }

    // Validate question type
    if (!['single', 'multiple', 'dropdown', 'truefalse', 'ordering'].includes(requestBody.questionType)) {
      return createResponse(400, {
        error: 'questionType must be "single", "multiple", "dropdown", "truefalse", or "ordering"',
      });
    }

    // Validate alternatives (only required for single/multiple)
    if (['single', 'multiple'].includes(requestBody.questionType)) {
      if (!Array.isArray(requestBody.alternatives) || requestBody.alternatives.length < 2) {
        return createResponse(400, {
          error: 'Question must have at least two alternatives',
        });
      }

      const correctAlternatives = requestBody.alternatives.filter((alt) => alt.isCorrect);
      if (correctAlternatives.length === 0) {
        return createResponse(400, {
          error: 'Question must have at least one correct alternative',
        });
      }

      if (requestBody.questionType === 'single' && correctAlternatives.length > 1) {
        return createResponse(400, {
          error: 'Single answer questions must have exactly one correct alternative',
        });
      }

      if (requestBody.questionType === 'multiple' && correctAlternatives.length < 2) {
        return createResponse(400, {
          error: 'Multiple answer questions must have at least two correct alternatives',
        });
      }
    }

    // Normalize alternatives to ensure imageUrl is string | null (not undefined)
    const normalizedAlternatives = requestBody.alternatives.map((alt, index) => ({
      text: alt.text,
      imageUrl: alt.imageUrl ?? null,
      isCorrect: alt.isCorrect,
      order: alt.order ?? index,
    }));

    // Create question
    const questionWithAlternatives = await createQuestion(
      requestBody.courseCode,
      requestBody.questionText,
      requestBody.questionType,
      normalizedAlternatives,
      authResult.userId!,
      requestBody.imageUrl ?? null,
      requestBody.explanation ?? null,
      requestBody.extendedData ?? null,
      requestBody.incorrectExplanation ?? null
    );

    return createResponse(201, questionWithAlternatives);
  } catch (error) {
    console.error('Create question error:', error);

    if (error instanceof DatabaseError) {
      return createResponse(400, {
        error: error.message,
      });
    }

    return createResponse(500, {
      error: 'An error occurred while creating the question. Please try again.',
    });
  }
}

/**
 * PUT /api/questions/:id
 * 
 * Updates an existing question.
 * Requires assistant or operator role.
 * 
 * Request Headers:
 * Authorization: Bearer <token>
 * 
 * Path Parameters:
 * id - Question ID
 * 
 * Request Body:
 * {
 *   "questionText": "Updated question text",  // Optional
 *   "imageUrl": "https://...",  // Optional
 *   "correctAlternativeId": "uuid",  // Optional - legacy support
 *   "alternatives": [  // Optional
 *     {
 *       "id": "uuid",
 *       "text": "Updated text",  // Optional
 *       "imageUrl": "https://...",  // Optional
 *       "isCorrect": true  // Optional
 *     }
 *   ]
 * }
 * 
 * Response (Success - 200):
 * {
 *   "question": {...},
 *   "alternatives": [...]
 * }
 * 
 * Requirements:
 * - 2.4: WHEN an operator edits an existing question, THE System SHALL allow updating correct alternatives
 * - 2.5: WHEN an operator updates a question, THE System SHALL preserve question history
 */
export async function updateQuestionHandler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    // Check assistant/operator authentication
    const authHeader = event.headers.Authorization || event.headers.authorization;
    const authResult = await requireContentManager(authHeader);

    if (!authResult.authenticated) {
      return createResponse(authResult.statusCode || 403, {
        error: authResult.error || 'Assistant or operator access required',
      });
    }

    // Get question ID from path parameters
    const questionId = event.pathParameters?.id;
    if (!questionId) {
      return createResponse(400, {
        error: 'Question ID is required',
      });
    }

    // Parse request body
    if (!event.body) {
      return createResponse(400, {
        error: 'Request body is required',
      });
    }

    const requestBody: UpdateQuestionRequest = JSON.parse(event.body);

    // Validate at least one field is provided
    if (
      !requestBody.questionText &&
      requestBody.imageUrl === undefined &&
      requestBody.explanation === undefined &&
      requestBody.incorrectExplanation === undefined &&
      !requestBody.correctAlternativeId &&
      !requestBody.alternatives
    ) {
      return createResponse(400, {
        error: 'At least one field must be provided for update',
      });
    }

    // Update question
    const questionWithAlternatives = await updateQuestion(questionId, requestBody);

    return createResponse(200, questionWithAlternatives);
  } catch (error) {
    console.error('Update question error:', error);

    if (error instanceof ItemNotFoundError) {
      return createResponse(404, {
        error: 'Question not found',
      });
    }

    if (error instanceof DatabaseError) {
      return createResponse(400, {
        error: error.message,
      });
    }

    return createResponse(500, {
      error: 'An error occurred while updating the question. Please try again.',
    });
  }
}

/**
 * DELETE /api/questions/:id
 * 
 * Deletes a question and its alternatives.
 * Also deletes associated images from storage.
 * Requires assistant or operator role.
 * 
 * Request Headers:
 * Authorization: Bearer <token>
 * 
 * Path Parameters:
 * id - Question ID
 * 
 * Response (Success - 200):
 * {
 *   "success": true,
 *   "message": "Question deleted successfully"
 * }
 * 
 * Requirements:
 * - 2.3: Allow deleting questions
 */
export async function deleteQuestionHandler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    // Check assistant/operator authentication
    const authHeader = event.headers.Authorization || event.headers.authorization;
    const authResult = await requireContentManager(authHeader);

    if (!authResult.authenticated) {
      return createResponse(authResult.statusCode || 403, {
        error: authResult.error || 'Assistant or operator access required',
      });
    }

    // Get question ID from path parameters
    const questionId = event.pathParameters?.id;
    if (!questionId) {
      return createResponse(400, {
        error: 'Question ID is required',
      });
    }

    // Delete question
    await deleteQuestion(questionId);

    return createResponse(200, {
      success: true,
      message: 'Question deleted successfully',
    });
  } catch (error) {
    console.error('Delete question error:', error);

    if (error instanceof ItemNotFoundError) {
      return createResponse(404, {
        error: 'Question not found',
      });
    }

    return createResponse(500, {
      error: 'An error occurred while deleting the question. Please try again.',
    });
  }
}

/**
 * GET /api/questions/:id
 * 
 * Gets a question with its alternatives.
 * Requires assistant or operator role.
 * 
 * Request Headers:
 * Authorization: Bearer <token>
 * 
 * Path Parameters:
 * id - Question ID
 * 
 * Response (Success - 200):
 * {
 *   "question": {...},
 *   "alternatives": [...]
 * }
 */
export async function getQuestionHandler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    // Check assistant/operator authentication
    const authHeader = event.headers.Authorization || event.headers.authorization;
    const authResult = await requireContentManager(authHeader);

    if (!authResult.authenticated) {
      return createResponse(authResult.statusCode || 403, {
        error: authResult.error || 'Assistant or operator access required',
      });
    }

    // Get question ID from path parameters
    const questionId = event.pathParameters?.id;
    if (!questionId) {
      return createResponse(400, {
        error: 'Question ID is required',
      });
    }

    // Get question
    const questionWithAlternatives = await getQuestion(questionId);

    if (!questionWithAlternatives) {
      return createResponse(404, {
        error: 'Question not found',
      });
    }

    return createResponse(200, questionWithAlternatives);
  } catch (error) {
    console.error('Get question error:', error);

    return createResponse(500, {
      error: 'An error occurred while retrieving the question. Please try again.',
    });
  }
}

/**
 * GET /api/courses/:code/questions
 * 
 * Gets all questions for a course.
 * Requires assistant or operator role.
 * 
 * Request Headers:
 * Authorization: Bearer <token>
 * 
 * Path Parameters:
 * code - Course code
 * 
 * Response (Success - 200):
 * [
 *   {
 *     "question": {...},
 *     "alternatives": [...]
 *   },
 *   ...
 * ]
 */
export async function getQuestionsByCourseHandler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    // Check assistant/operator authentication
    const authHeader = event.headers.Authorization || event.headers.authorization;
    const authResult = await requireContentManager(authHeader);

    if (!authResult.authenticated) {
      return createResponse(authResult.statusCode || 403, {
        error: authResult.error || 'Assistant or operator access required',
      });
    }

    // Get course code from path parameters
    const courseCode = event.pathParameters?.code;
    if (!courseCode) {
      return createResponse(400, {
        error: 'Course code is required',
      });
    }

    // Get questions
    const questions = await getQuestionsByCourse(courseCode);

    return createResponse(200, questions);
  } catch (error) {
    console.error('Get questions by course error:', error);

    return createResponse(500, {
      error: 'An error occurred while retrieving questions. Please try again.',
    });
  }
}

/**
 * POST /api/images/upload
 * 
 * Uploads an image for use in questions or alternatives.
 * Requires assistant or operator role.
 * 
 * Request Headers:
 * Authorization: Bearer <token>
 * Content-Type: multipart/form-data
 * 
 * Request Body:
 * Form data with 'image' field containing the file
 * 
 * Response (Success - 200):
 * {
 *   "url": "https://...",
 *   "key": "images/2024/01/uuid.jpg",
 *   "size": 12345,
 *   "contentType": "image/jpeg"
 * }
 * 
 * Requirements:
 * - 2.1 (extended): Support image uploads for questions and alternatives
 */
export async function uploadImageHandler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    // Check assistant/operator authentication
    const authHeader = event.headers.Authorization || event.headers.authorization;
    const authResult = await requireContentManager(authHeader);

    if (!authResult.authenticated) {
      return createResponse(authResult.statusCode || 403, {
        error: authResult.error || 'Assistant or operator access required',
      });
    }

    // Parse multipart form data
    if (!event.body) {
      console.error('Upload image error: No request body');
      return createResponse(400, {
        error: 'Request body is required',
      });
    }

    // Get content type from headers
    const contentType = event.headers['Content-Type'] || event.headers['content-type'] || '';
    console.log('Upload image - Content-Type:', contentType);

    if (!contentType.includes('multipart/form-data')) {
      console.error('Upload image error: Invalid content type:', contentType);
      return createResponse(400, {
        error: 'Content-Type must be multipart/form-data',
      });
    }

    // Decode base64 if needed
    const bodyBuffer = event.isBase64Encoded 
      ? Buffer.from(event.body, 'base64')
      : Buffer.from(event.body);
    
    console.log('Upload image - Body buffer size:', bodyBuffer.length, 'isBase64Encoded:', event.isBase64Encoded);

    // Parse multipart form data using busboy
    const Busboy = require('busboy');
    const busboy = Busboy({ headers: { 'content-type': contentType } });

    let fileBuffer: Buffer | null = null;
    let fileContentType: string | null = null;
    let fileName: string | null = null;

    // Promise to handle async busboy parsing
    const parsePromise = new Promise<void>((resolve, reject) => {
      busboy.on('file', (fieldname: string, file: any, info: any) => {
        console.log('Upload image - File event:', { fieldname, info });
        const { filename, mimeType } = info;
        fileName = filename;
        fileContentType = mimeType;

        const chunks: Buffer[] = [];
        
        file.on('data', (chunk: Buffer) => {
          chunks.push(chunk);
        });

        file.on('end', () => {
          fileBuffer = Buffer.concat(chunks);
          console.log('Upload image - File parsed:', { 
            fileName, 
            fileContentType, 
            fileSize: fileBuffer.length 
          });
        });
      });

      busboy.on('finish', () => {
        console.log('Upload image - Busboy finished parsing');
        resolve();
      });

      busboy.on('error', (error: Error) => {
        console.error('Upload image - Busboy error:', error);
        reject(error);
      });
    });

    // Write the body buffer to busboy
    busboy.write(bodyBuffer);
    busboy.end();

    // Wait for parsing to complete
    await parsePromise;

    // Validate we got a file
    if (!fileBuffer || !fileContentType) {
      console.error('Upload image error: No file parsed', { 
        hasFileBuffer: !!fileBuffer, 
        fileContentType 
      });
      return createResponse(400, {
        error: 'No image file found in request. Please ensure you are uploading a file with field name "image".',
      });
    }

    console.log('Upload image - Calling uploadImage service with:', {
      contentType: fileContentType,
      size: (fileBuffer as Buffer).length,
      fileName
    });

    // Upload image using the service
    const result = await uploadImage(fileBuffer as Buffer, fileContentType as string, fileName || undefined);

    console.log('Upload image - Success:', { key: result.key, size: result.size });
    return createResponse(200, result);
  } catch (error) {
    console.error('Upload image error:', error);

    if (error instanceof ImageUploadError) {
      return createResponse(400, {
        error: error.message,
      });
    }

    return createResponse(500, {
      error: 'An error occurred while uploading the image. Please try again.',
    });
  }
}

/**
 * POST /api/questions/bulk-import
 * 
 * Bulk import questions from CSV data.
 * Requires assistant or operator role.
 * 
 * Request Headers:
 * Authorization: Bearer <token>
 * 
 * Request Body:
 * {
 *   "courseCode": "CLF",
 *   "csvContent": "QuestionType,QuestionText,QuestionImageURL,Alt1Text,Alt1ImageURL,Alt1Correct,..."
 * }
 * 
 * Response (Success - 200):
 * {
 *   "success": true,
 *   "imported": 50,
 *   "failed": 2,
 *   "errors": [
 *     { "row": 5, "field": "alternatives", "message": "Must have at least 2 alternatives" }
 *   ]
 * }
 */
export async function bulkImportQuestionsHandler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    // Check assistant/operator authentication
    const authHeader = event.headers.Authorization || event.headers.authorization;
    const authResult = await requireContentManager(authHeader);

    if (!authResult.authenticated) {
      return createResponse(authResult.statusCode || 403, {
        error: authResult.error || 'Assistant or operator access required',
      });
    }

    // Parse request body
    if (!event.body) {
      return createResponse(400, {
        error: 'Request body is required',
      });
    }

    const requestBody = JSON.parse(event.body);

    // Validate required fields
    if (!requestBody.courseCode || !requestBody.csvContent) {
      return createResponse(400, {
        error: 'courseCode and csvContent are required',
      });
    }

    // Import CSV parser
    const { parseQuestionsCSV } = await import('../utils/csvParser');
    
    // Parse CSV content
    const parseResult = parseQuestionsCSV(requestBody.csvContent);
    
    // If there are parsing errors, return them
    if (parseResult.errors.length > 0 && parseResult.questions.length === 0) {
      return createResponse(400, {
        success: false,
        imported: 0,
        failed: parseResult.errors.length,
        errors: parseResult.errors
      });
    }

    // Import questions
    let imported = 0;
    let failed = 0;
    const importErrors: Array<{ row: number; message: string }> = [];

    for (const question of parseResult.questions) {
      try {
        await createQuestion(
          requestBody.courseCode,
          question.questionText,
          question.questionType,
          question.alternatives,
          authResult.userId!,
          question.questionImageUrl,
          question.explanation,
          question.extendedData
        );
        imported++;
      } catch (error) {
        failed++;
        importErrors.push({
          row: parseResult.questions.indexOf(question) + 2, // +2 for header and 0-index
          message: error instanceof Error ? error.message : 'Failed to import question'
        });
      }
    }

    return createResponse(200, {
      success: true,
      imported,
      failed,
      errors: [...parseResult.errors, ...importErrors]
    });
  } catch (error) {
    console.error('Bulk import questions error:', error);

    if (error instanceof DatabaseError) {
      return createResponse(400, {
        error: error.message,
      });
    }

    return createResponse(500, {
      error: 'An error occurred while importing questions. Please try again.',
    });
  }
}

/**
 * GET /api/questions/csv-template
 * 
 * Download CSV template for bulk import.
 * Requires assistant or operator role.
 * 
 * Request Headers:
 * Authorization: Bearer <token>
 * 
 * Response (Success - 200):
 * CSV file content with headers and example rows
 */
export async function downloadCSVTemplateHandler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    // Check assistant/operator authentication
    const authHeader = event.headers.Authorization || event.headers.authorization;
    const authResult = await requireContentManager(authHeader);

    if (!authResult.authenticated) {
      return createResponse(authResult.statusCode || 403, {
        error: authResult.error || 'Assistant or operator access required',
      });
    }

    // Import CSV generator
    const { generateCSVTemplate } = await import('../utils/csvParser');
    
    // Generate template
    const csvContent = generateCSVTemplate();

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': 'attachment; filename="question-import-template.csv"',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Credentials': true,
      },
      body: csvContent,
    };
  } catch (error) {
    console.error('Download CSV template error:', error);

    return createResponse(500, {
      error: 'An error occurred while generating the template. Please try again.',
    });
  }
}

/**
 * POST /api/assistant/students
 * 
 * Creates a new student account.
 * Requires assistant role.
 * 
 * Request Headers:
 * Authorization: Bearer <token>
 * 
 * Request Body:
 * {
 *   "userId": "student@example.com",
 *   "name": "John Doe",
 *   "password": "SecurePass123!",
 *   "isActive": true
 * }
 * 
 * Response (Success - 201):
 * {
 *   "student": {
 *     "userId": "cognito-sub-id",
 *     "email": "student@example.com",
 *     "name": "John Doe",
 *     "isActive": true,
 *     "createdAt": "2024-01-01T00:00:00.000Z",
 *     "updatedAt": "2024-01-01T00:00:00.000Z"
 *   }
 * }
 */
export async function createStudentHandler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    // Check assistant authentication
    const authHeader = event.headers.Authorization || event.headers.authorization;
    const authResult = await requireContentManager(authHeader);

    if (!authResult.authenticated) {
      return createResponse(authResult.statusCode || 403, {
        error: authResult.error || 'Assistant access required',
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

    // Validate password strength
    if (requestBody.password.length < 8) {
      return createResponse(400, {
        error: 'Password must be at least 8 characters long',
      });
    }

    // Create student using Cognito service directly
    const cognitoUserId = await createCognitoUser(
      requestBody.userId, // email
      requestBody.password,
      'student',
      requestBody.name
    );

    // Handle activation status if specified
    if (requestBody.isActive === false) {
      // If user should be inactive, disable them after creation
      await disableCognitoUser(requestBody.userId);
    }
    // Note: Users are created as active by default in Cognito

    // Return student information from Cognito
    const student = {
      userId: cognitoUserId,
      email: requestBody.userId,
      name: requestBody.name,
      isActive: requestBody.isActive || false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    return createResponse(201, { student });
  } catch (error: any) {
    console.error('Create student error:', error);

    if (error instanceof DatabaseError) {
      return createResponse(400, {
        error: error.message,
      });
    }

    // Handle Cognito-specific errors
    const errorMessage = error?.message || '';
    if (errorMessage.includes('User account already exists') || errorMessage.includes('UsernameExistsException')) {
      return createResponse(409, {
        error: 'A student with this email already exists.',
      });
    }

    if (errorMessage.includes('Password did not conform') || errorMessage.includes('InvalidPasswordException')) {
      return createResponse(400, {
        error: 'Password does not meet requirements. It must have at least 8 characters, including uppercase, lowercase, numbers, and special characters.',
      });
    }

    return createResponse(500, {
      error: 'An error occurred while creating the student profile. Please try again.',
    });
  }
}

/**
 * GET /api/assistant/students
 * 
 * Gets all students.
 * Requires assistant role.
 * 
 * Request Headers:
 * Authorization: Bearer <token>
 * 
 * Response (Success - 200):
 * {
 *   "students": [
 *     {
 *       "userId": "cognito-sub-id",
 *       "email": "student@example.com", 
 *       "name": "John Doe",
 *       "isActive": true,
 *       "createdAt": "2024-01-01T00:00:00.000Z",
 *       "updatedAt": "2024-01-01T00:00:00.000Z"
 *     },
 *     ...
 *   ]
 * }
 */
export async function getAllStudentsHandler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    // Check assistant authentication
    const authHeader = event.headers.Authorization || event.headers.authorization;
    const authResult = await requireContentManager(authHeader);

    if (!authResult.authenticated) {
      return createResponse(authResult.statusCode || 403, {
        error: authResult.error || 'Assistant access required',
      });
    }

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
 * PUT /api/assistant/students/:id/reset-password
 * 
 * Resets a student's password.
 * Requires assistant role.
 * 
 * Request Headers:
 * Authorization: Bearer <token>
 * 
 * Path Parameters:
 * id - Student user ID
 * 
 * Request Body:
 * {
 *   "newPassword": "NewSecurePass123!"
 * }
 * 
 * Response (Success - 200):
 * {
 *   "success": true,
 *   "message": "Password reset successfully"
 * }
 */
export async function resetStudentPasswordHandler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    // Check assistant authentication
    const authHeader = event.headers.Authorization || event.headers.authorization;
    const authResult = await requireContentManager(authHeader);

    if (!authResult.authenticated) {
      return createResponse(authResult.statusCode || 403, {
        error: authResult.error || 'Assistant access required',
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

    const requestBody: ResetStudentPasswordRequest = JSON.parse(event.body);

    // Validate required fields
    if (!requestBody.newPassword) {
      return createResponse(400, {
        error: 'newPassword is required',
      });
    }

    // Validate password strength
    if (requestBody.newPassword.length < 8) {
      return createResponse(400, {
        error: 'Password must be at least 8 characters long',
      });
    }

    // Reset password
    // Reset password in Cognito using the user ID (Cognito sub)
    await resetUserPasswordById(studentId, requestBody.newPassword);

    return createResponse(200, {
      success: true,
      message: 'Password reset successfully',
    });
  } catch (error) {
    console.error('Reset student password error:', error);

    if (error instanceof ItemNotFoundError) {
      return createResponse(404, {
        error: 'Student not found',
      });
    }

    if (error instanceof DatabaseError) {
      return createResponse(400, {
        error: error.message,
      });
    }

    return createResponse(500, {
      error: 'An error occurred while resetting the password. Please try again.',
    });
  }
}

/**
 * POST /api/assistant/enrollments
 * 
 * Creates an enrollment for a student.
 * Requires assistant role.
 * 
 * Request Headers:
 * Authorization: Bearer <token>
 * 
 * Request Body:
 * {
 *   "studentId": "cognito-sub-id",
 *   "courseCode": "CLF",
 *   "startDate": "2024-01-01",
 *   "accessStartDate": "2024-02-01"
 * }
 * 
 * Response (Success - 201):
 * {
 *   "enrollment": {
 *     "id": "uuid",
 *     "studentId": "cognito-sub-id",
 *     "courseCode": "CLF",
 *     "startDate": "2024-01-01T00:00:00.000Z",
 *     "accessStartDate": "2024-02-01T00:00:00.000Z",
 *     "accessEndDate": "2024-03-01T00:00:00.000Z",
 *     "enrolledAt": "2024-01-01T00:00:00.000Z"
 *   }
 * }
 */
export async function createEnrollmentHandler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    // Check assistant authentication
    const authHeader = event.headers.Authorization || event.headers.authorization;
    const authResult = await requireContentManager(authHeader);

    if (!authResult.authenticated) {
      return createResponse(authResult.statusCode || 403, {
        error: authResult.error || 'Assistant access required',
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
    if (!requestBody.studentId || !requestBody.courseCode || !requestBody.courseSection || !requestBody.startDate) {
      return createResponse(400, {
        error: 'studentId, courseCode, courseSection, and startDate are required',
      });
    }

    // Create enrollment
    const enrollment = await createEnrollment(
      requestBody.studentId,
      requestBody.courseCode,
      requestBody.courseSection,
      new Date(requestBody.startDate),
      requestBody.accessStartDate ? new Date(requestBody.accessStartDate) : undefined,
      requestBody.accessEndDate ? new Date(requestBody.accessEndDate) : undefined
    );

    return createResponse(201, { enrollment });
  } catch (error) {
    console.error('Create enrollment error:', error);

    if (error instanceof DatabaseError) {
      return createResponse(400, {
        error: error.message,
      });
    }

    return createResponse(500, {
      error: 'An error occurred while creating the enrollment. Please try again.',
    });
  }
}

/**
 * GET /api/assistant/courses
 * 
 * Gets all available courses.
 * Requires assistant role.
 * 
 * Request Headers:
 * Authorization: Bearer <token>
 * 
 * Response (Success - 200):
 * [
 *   {
 *     "code": "CLF",
 *     "name": "AWS Certified Cloud Practitioner",
 *     "provider": "AWS",
 *     "description": "Foundational AWS certification",
 *     "examQuestionCount": 50,
 *     "passingPercentage": 70
 *   },
 *   ...
 * ]
 */
export async function getAllCoursesHandler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    // Check assistant authentication
    const authHeader = event.headers.Authorization || event.headers.authorization;
    const authResult = await requireContentManager(authHeader);

    if (!authResult.authenticated) {
      return createResponse(authResult.statusCode || 403, {
        error: authResult.error || 'Assistant access required',
      });
    }

    const courses = await getAllCourses();

    return createResponse(200, courses);
  } catch (error) {
    console.error('Get all courses error:', error);

    return createResponse(500, {
      error: 'An error occurred while retrieving courses. Please try again.',
    });
  }
}

/**
 * POST /api/assistant/courses
 * 
 * Creates a new course.
 * Requires assistant role.
 * 
 * Request Body:
 * {
 *   "code": "NEWCERT",
 *   "name": "New Certification",
 *   "provider": "AWS",
 *   "description": "Description of the course",
 *   "examQuestionCount": 50,
 *   "passingPercentage": 70,
 *   "badgeImageUrl": "https://..."  // Optional
 * }
 */
export async function createCourseAssistantHandler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const authHeader = event.headers.Authorization || event.headers.authorization;
    const authResult = await requireContentManager(authHeader);

    if (!authResult.authenticated) {
      return createResponse(authResult.statusCode || 403, {
        error: authResult.error || 'Assistant access required',
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

    const course = await createCourse(
      code, 
      name, 
      provider, 
      description,
      examQuestionCount || 50,
      passingPercentage || 70
    );
    
    // If badgeImageUrl was provided, update the course with it
    if (badgeImageUrl) {
      const updatedCourse = await updateCourse(code, { badgeImageUrl });
      return createResponse(201, updatedCourse);
    }
    
    return createResponse(201, course);
  } catch (error) {
    console.error('Create course error:', error);

    if (error instanceof DatabaseError && error.message.includes('already exists')) {
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
 * PUT /api/assistant/courses/:code
 * 
 * Updates an existing course.
 * Requires assistant role.
 */
export async function updateCourseAssistantHandler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const authHeader = event.headers.Authorization || event.headers.authorization;
    const authResult = await requireContentManager(authHeader);

    if (!authResult.authenticated) {
      return createResponse(authResult.statusCode || 403, {
        error: authResult.error || 'Assistant access required',
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

    if (!updates.name && !updates.provider && !updates.description && !updates.examQuestionCount && !updates.passingPercentage && !updates.badgeImageUrl && updates.reviewModeEnabled === undefined && updates.timeLimitMinutes === undefined && updates.unscoredQuestions === undefined) {
      return createResponse(400, {
        error: 'At least one field must be provided for update',
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
 * PUT /api/assistant/students/bulk-activation
 * 
 * Activates or deactivates multiple students.
 * Requires assistant role.
 * 
 * Request Headers:
 * Authorization: Bearer <token>
 * 
 * Request Body:
 * {
 *   "studentIds": ["student1@example.com", "student2@example.com"],
 *   "action": "activate" | "deactivate"
 * }
 * 
 * Response (Success - 200):
 * {
 *   "success": true,
 *   "message": "Successfully activated/deactivated 2 student(s)",
 *   "results": [
 *     { "email": "student1@example.com", "success": true },
 *     { "email": "student2@example.com", "success": true }
 *   ]
 * }
 */
export async function bulkStudentActivationHandler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    // Check assistant authentication
    const authHeader = event.headers.Authorization || event.headers.authorization;
    const authResult = await requireContentManager(authHeader);

    if (!authResult.authenticated) {
      return createResponse(authResult.statusCode || 403, {
        error: authResult.error || 'Assistant access required',
      });
    }

    // Parse request body
    if (!event.body) {
      return createResponse(400, {
        error: 'Request body is required',
      });
    }

    const requestBody: BulkStudentActivationRequest = JSON.parse(event.body);

    // Validate required fields
    if (!requestBody.studentIds || !Array.isArray(requestBody.studentIds) || requestBody.studentIds.length === 0) {
      return createResponse(400, {
        error: 'studentIds array is required and must not be empty',
      });
    }

    if (!requestBody.action || !['activate', 'deactivate'].includes(requestBody.action)) {
      return createResponse(400, {
        error: 'action must be either "activate" or "deactivate"',
      });
    }

    // Get all students to find their email addresses
    const allStudents = await getAllStudentsFromCognito();
    const studentEmails = requestBody.studentIds.map(studentId => {
      const student = allStudents.find(s => s.userId === studentId);
      return student ? student.email : studentId; // Fallback to studentId if not found
    });

    // Perform bulk activation/deactivation
    let results;
    if (requestBody.action === 'activate') {
      results = await enableMultipleCognitoUsers(studentEmails);
    } else {
      results = await disableMultipleCognitoUsers(studentEmails);
    }

    // Count successful operations
    const successCount = results.filter(r => r.success).length;
    const failureCount = results.filter(r => !r.success).length;

    // Prepare response message
    const actionPastTense = requestBody.action === 'activate' ? 'activated' : 'deactivated';
    let message = `Successfully ${actionPastTense} ${successCount} student(s)`;
    if (failureCount > 0) {
      message += `, failed to ${requestBody.action} ${failureCount} student(s)`;
    }

    return createResponse(200, {
      success: failureCount === 0,
      message,
      results,
      summary: {
        total: results.length,
        successful: successCount,
        failed: failureCount
      }
    });
  } catch (error) {
    console.error('Bulk student activation error:', error);

    return createResponse(500, {
      error: 'An error occurred while updating student status. Please try again.',
    });
  }
}

/**
 * GET /api/assistant/students/{id}/enrollments
 * 
 * Gets enrollments for a specific student.
 * Requires assistant role.
 * 
 * Request Headers:
 * Authorization: Bearer <token>
 * 
 * Path Parameters:
 * id - Student user ID
 * 
 * Response (Success - 200):
 * [
 *   {
 *     "id": "enrollment-uuid",
 *     "studentId": "student-uuid",
 *     "courseCode": "CLF",
 *     "startDate": "2024-01-01T00:00:00.000Z",
 *     "accessStartDate": "2024-01-01T00:00:00.000Z",
 *     "accessEndDate": "2024-03-01T00:00:00.000Z",
 *     "enrolledAt": "2024-01-01T00:00:00.000Z"
 *   }
 * ]
 */
export async function getStudentEnrollmentsHandler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    // Check assistant authentication
    const authHeader = event.headers.Authorization || event.headers.authorization;
    const authResult = await requireContentManager(authHeader);

    if (!authResult.authenticated) {
      return createResponse(authResult.statusCode || 403, {
        error: authResult.error || 'Assistant access required',
      });
    }

    // Get student ID from path parameters
    const studentId = event.pathParameters?.id;
    if (!studentId) {
      return createResponse(400, {
        error: 'Student ID is required',
      });
    }

    // Get student enrollments
    const enrollments = await getEnrollments(studentId);

    return createResponse(200, enrollments);
  } catch (error) {
    console.error('Get student enrollments error:', error);

    if (error instanceof ItemNotFoundError) {
      return createResponse(404, {
        error: 'Student not found',
      });
    }

    if (error instanceof DatabaseError) {
      return createResponse(400, {
        error: error.message,
      });
    }

    return createResponse(500, {
      error: 'An error occurred while retrieving student enrollments. Please try again.',
    });
  }
}

/**
 * DELETE /api/assistant/students/:id
 *
 * Deletes a student account completely.
 * Removes from Cognito (no DynamoDB since we use Cognito-only for students).
 * Requires assistant role.
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
export async function deleteStudentAssistantHandler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    // Check assistant authentication
    const authHeader = event.headers.Authorization || event.headers.authorization;
    const authResult = await requireContentManager(authHeader);

    if (!authResult.authenticated) {
      return createResponse(authResult.statusCode || 403, {
        error: authResult.error || 'Assistant access required',
      });
    }

    // Get student ID from path parameters
    const studentId = event.pathParameters?.id;
    if (!studentId) {
      return createResponse(400, {
        error: 'Student ID is required',
      });
    }

    // Get all students to find the email for this student ID
    const allStudents = await getAllStudentsFromCognito();
    const student = allStudents.find(s => s.userId === studentId);

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
      return createResponse(500, {
        error: 'Failed to delete student from authentication system',
      });
    }

    return createResponse(200, {
      message: 'Student deleted successfully',
    });
  } catch (error) {
    console.error('Delete student error:', error);

    return createResponse(500, {
      error: 'An error occurred while deleting the student. Please try again.',
    });
  }
}



/**
 * POST /api/assistant/students/bulk
 * 
 * Creates multiple students at once from bulk import data.
 * Requires assistant role.
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
export async function bulkCreateStudentsAssistantHandler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    // Check assistant authentication
    const authHeader = event.headers.Authorization || event.headers.authorization;
    const authResult = await requireContentManager(authHeader);

    if (!authResult.authenticated) {
      return createResponse(authResult.statusCode || 403, {
        error: authResult.error || 'Assistant access required',
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

        const student = {
          userId: cognitoSub,
          email,
          name,
          isActive: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

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

/**
 * GET /api/assistant/courses/:code/questions/export
 * 
 * Exports all questions for a course to CSV format.
 * Requires assistant or operator role.
 * 
 * Request Headers:
 * Authorization: Bearer <token>
 * 
 * Path Parameters:
 * code - Course code
 * 
 * Response (Success - 200):
 * CSV file content with all questions and alternatives
 */
export async function exportQuestionsHandler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    // Check assistant/operator authentication
    const authHeader = event.headers.Authorization || event.headers.authorization;
    const authResult = await requireContentManager(authHeader);

    if (!authResult.authenticated) {
      return createResponse(authResult.statusCode || 403, {
        error: authResult.error || 'Assistant or operator access required',
      });
    }

    // Get course code from path parameters
    const courseCode = event.pathParameters?.code;
    if (!courseCode) {
      return createResponse(400, {
        error: 'Course code is required',
      });
    }

    // Get all questions for the course
    const questions = await getQuestionsByCourse(courseCode);

    // Import CSV exporter
    const { exportQuestionsToCSV } = await import('../utils/csvParser');
    
    // Generate CSV content
    const csvContent = exportQuestionsToCSV(questions);

    // Return CSV file
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="${courseCode}-questions-export.csv"`,
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Credentials': true,
      },
      body: csvContent,
    };
  } catch (error) {
    console.error('Export questions error:', error);

    return createResponse(500, {
      error: 'An error occurred while exporting questions. Please try again.',
    });
  }
}


/**
 * PUT /api/assistant/enrollments/:id
 * 
 * Updates an enrollment (e.g., extend access dates).
 * Requires assistant role.
 */
export async function updateEnrollmentAssistantHandler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const authHeader = event.headers.Authorization || event.headers.authorization;
    const authResult = await requireContentManager(authHeader);

    if (!authResult.authenticated) {
      return createResponse(authResult.statusCode || 403, {
        error: authResult.error || 'Assistant access required',
      });
    }

    const enrollmentId = event.pathParameters?.id;
    if (!enrollmentId) {
      return createResponse(400, { error: 'Enrollment ID is required' });
    }

    if (!event.body) {
      return createResponse(400, { error: 'Request body is required' });
    }

    const { accessStartDate, accessEndDate, startDate, courseSection } = JSON.parse(event.body);

    if (!accessStartDate && !accessEndDate && !startDate && !courseSection) {
      return createResponse(400, {
        error: 'At least one field must be provided (accessStartDate, accessEndDate, startDate, courseSection)',
      });
    }

    const { updateEnrollment, getEnrollment } = await import('../services/enrollmentService');

    const existing = await getEnrollment(enrollmentId);
    if (!existing) {
      return createResponse(404, { error: 'Enrollment not found' });
    }

    const updates: Record<string, any> = {};
    if (accessStartDate) updates.accessStartDate = new Date(accessStartDate).toISOString();
    if (accessEndDate) updates.accessEndDate = new Date(accessEndDate).toISOString();
    if (startDate) updates.startDate = new Date(startDate).toISOString();
    if (courseSection) updates.courseSection = courseSection;

    const updated = await updateEnrollment(enrollmentId, updates);

    return createResponse(200, { enrollment: updated });
  } catch (error) {
    console.error('Update enrollment error:', error);

    if (error instanceof ItemNotFoundError) {
      return createResponse(404, { error: 'Enrollment not found' });
    }

    return createResponse(500, {
      error: 'An error occurred while updating the enrollment. Please try again.',
    });
  }
}