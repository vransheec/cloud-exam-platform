/**
 * Webhook Handler
 * 
 * Public endpoint for external integrations (e.g., Google Apps Script).
 * Authenticated via x-api-key header.
 * 
 * POST /webhook/sale - Create student and enrollment from a sale
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { CognitoIdentityProviderClient, AdminGetUserCommand, AdminEnableUserCommand } from '@aws-sdk/client-cognito-identity-provider';
import { createCognitoUser } from '../services/cognitoService';
import { createEnrollment } from '../services/enrollmentService';
import { env } from '../config/env';

const WEBHOOK_API_KEY = process.env.WEBHOOK_API_KEY || '';
const cognito = new CognitoIdentityProviderClient({ region: env.cognitoRegion || env.awsRegion });

function createResponse(statusCode: number, body: Record<string, any>): APIGatewayProxyResult {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
    body: JSON.stringify(body),
  };
}

/**
 * POST /webhook/sale
 * 
 * Creates a student (if not exists) and enrollment from a sale.
 * Authenticated via x-api-key header.
 * 
 * If the student already exists (repurchase), the password is NOT modified.
 * The response includes `studentCreated: false` so the CRM knows not to send
 * a new password to the student.
 * 
 * Request Body:
 * {
 *   "studentEmail": "alumno@email.com",
 *   "studentName": "Juan Pérez",
 *   "password": "TempPass123!",
 *   "courseCode": "CLF",
 *   "courseSection": "2026-A",
 *   "accessDays": 30
 * }
 */
export async function webhookSaleHandler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    // Validate API key
    const apiKey = event.headers['x-api-key'] || event.headers['X-Api-Key'] || '';
    if (!WEBHOOK_API_KEY || apiKey !== WEBHOOK_API_KEY) {
      console.warn('[WEBHOOK] Unauthorized request - invalid API key');
      return createResponse(401, { error: 'Invalid or missing API key' });
    }

    if (!event.body) {
      console.warn('[WEBHOOK] Request with empty body');
      return createResponse(400, { error: 'Request body is required' });
    }

    const { studentEmail, studentName, password, courseCode, courseSection, accessDays, accessStartDate } = JSON.parse(event.body);

    console.log('[WEBHOOK] Sale request received:', JSON.stringify({
      studentEmail,
      studentName,
      courseCode,
      courseSection,
      accessDays,
      accessStartDate,
    }));

    // Validate required fields
    if (!studentEmail || !studentName || !password || !courseCode) {
      console.warn('[WEBHOOK] Missing required fields:', { studentEmail: !!studentEmail, studentName: !!studentName, password: !!password, courseCode: !!courseCode });
      return createResponse(400, {
        error: 'studentEmail, studentName, password, and courseCode are required',
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(studentEmail)) {
      console.warn('[WEBHOOK] Invalid email format:', studentEmail);
      return createResponse(400, { error: 'Invalid email format' });
    }

    // Validate password length
    if (password.length < 8) {
      console.warn('[WEBHOOK] Password too short for:', studentEmail);
      return createResponse(400, { error: 'Password must be at least 8 characters' });
    }

    // Step 1: Check if student already exists in Cognito
    let cognitoUserId: string;
    let studentCreated = false;

    try {
      const userResp = await cognito.send(new AdminGetUserCommand({
        UserPoolId: env.cognitoUserPoolId,
        Username: studentEmail,
      }));

      // User already exists — DO NOT touch password
      cognitoUserId = userResp.UserAttributes?.find(a => a.Name === 'sub')?.Value || '';
      console.log('[WEBHOOK] Student already exists (repurchase):', { email: studentEmail, userId: cognitoUserId });

      // Enable user in case it was disabled
      await cognito.send(new AdminEnableUserCommand({
        UserPoolId: env.cognitoUserPoolId,
        Username: studentEmail,
      }));
    } catch (error: any) {
      if (error.name === 'UserNotFoundException') {
        // User does not exist — create with the provided password
        try {
          cognitoUserId = await createCognitoUser(studentEmail, password, 'student', studentName);
          studentCreated = true;
          console.log('[WEBHOOK] Student created in Cognito:', { email: studentEmail, userId: cognitoUserId });
        } catch (createErr: any) {
          console.error('[WEBHOOK] Failed to create student:', { email: studentEmail, error: createErr.message });
          return createResponse(500, { error: `Failed to create student: ${createErr.message}` });
        }
      } else {
        console.error('[WEBHOOK] Error checking if student exists:', { email: studentEmail, error: error.message });
        return createResponse(500, { error: `Failed to check student existence: ${error.message}` });
      }
    }

    // Step 2: Create enrollment
    const days = accessDays || 30;
    const startDate = accessStartDate ? new Date(accessStartDate) : new Date();
    const accessEndDate = new Date(startDate);
    accessEndDate.setDate(accessEndDate.getDate() + days);

    console.log('[WEBHOOK] Creating enrollment:', { userId: cognitoUserId, courseCode, days, startDate: startDate.toISOString(), accessEndDate: accessEndDate.toISOString() });

    let enrollment;
    try {
      enrollment = await createEnrollment(
        cognitoUserId,
        courseCode,
        courseSection || 'default',
        startDate,
        startDate,
        accessEndDate
      );
      console.log('[WEBHOOK] Enrollment created:', { enrollmentId: enrollment.id, courseCode });
    } catch (error: any) {
      if (error.message?.includes('already enrolled')) {
        console.log('[WEBHOOK] Student already enrolled, extending access:', { userId: cognitoUserId, courseCode });
        const { getEnrollments } = await import('../services/enrollmentService');
        const { updateItem } = await import('../config/database');
        const enrollments = await getEnrollments(cognitoUserId);
        const existingEnrollment = enrollments.find((e: any) => e.courseCode === courseCode);
        
        if (existingEnrollment) {
          const currentEnd = new Date(existingEnrollment.accessEndDate);
          const newEnd = currentEnd > new Date() 
            ? new Date(currentEnd.getTime() + days * 24 * 60 * 60 * 1000)
            : accessEndDate;
          
          await updateItem(env.enrollmentsTable, { id: existingEnrollment.id }, {
            accessEndDate: newEnd.toISOString(),
            accessStartDate: new Date() < new Date(existingEnrollment.accessStartDate) 
              ? new Date().toISOString() 
              : existingEnrollment.accessStartDate,
            courseSection: courseSection || existingEnrollment.courseSection,
            enrollmentType: 'full',
          });

          console.log('[WEBHOOK] Enrollment extended:', { enrollmentId: existingEnrollment.id, newEnd: newEnd.toISOString() });
          
          return createResponse(200, {
            success: true,
            studentCreated,
            enrollmentCreated: false,
            enrollmentExtended: true,
            message: 'Enrollment access extended successfully',
            studentId: cognitoUserId,
            enrollmentId: existingEnrollment.id,
            accessEndDate: newEnd.toISOString(),
          });
        }
        
        return createResponse(200, {
          success: true,
          studentCreated,
          enrollmentCreated: false,
          message: 'Student already enrolled in this course',
          studentId: cognitoUserId,
        });
      }
      console.error('[WEBHOOK] Failed to create enrollment:', { userId: cognitoUserId, courseCode, error: error.message });
      return createResponse(500, { error: `Failed to create enrollment: ${error.message}` });
    }

    // Mark new enrollment as full (paid)
    const { updateItem: updateEnrollmentItem } = await import('../config/database');
    await updateEnrollmentItem(env.enrollmentsTable, { id: enrollment.id }, { enrollmentType: 'full' });

    console.log('[WEBHOOK] Sale completed successfully:', { studentEmail, courseCode, studentCreated, enrollmentId: enrollment.id });

    return createResponse(201, {
      success: true,
      studentCreated,
      enrollmentCreated: true,
      studentId: cognitoUserId,
      enrollmentId: enrollment.id,
      accessEndDate: accessEndDate.toISOString(),
    });
  } catch (error) {
    console.error('[WEBHOOK] Unhandled error:', error);
    return createResponse(500, {
      error: 'An error occurred processing the sale webhook',
    });
  }
}
