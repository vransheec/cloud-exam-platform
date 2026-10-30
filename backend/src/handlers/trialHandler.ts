/**
 * Trial Handler
 * 
 * Public endpoints for trial/free exam access.
 * Allows users to self-register and take a limited exam without prior enrollment.
 * 
 * Endpoints:
 * - GET /api/trial/courses - Get available courses for trial (public, no auth)
 * - POST /api/trial/register - Self-register for a trial exam
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { createCognitoUser } from '../services/cognitoService';
import { createEnrollment, getEnrollments } from '../services/enrollmentService';
import { getAllCourses } from '../services/courseService';
import { getQuestionsByCourse } from '../services/questionService';
import { env } from '../config/env';

/** Max trial enrollments per student */
const MAX_TRIAL_ENROLLMENTS = 1;
/** Trial access duration in days */
const TRIAL_ACCESS_DAYS = 3;

function createResponse(statusCode: number, body: Record<string, any>): APIGatewayProxyResult {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    },
    body: JSON.stringify(body),
  };
}

/**
 * GET /api/trial/courses
 * 
 * Returns courses that have questions available, for trial selection.
 * Public endpoint - no authentication required.
 */
export async function getTrialCoursesHandler(
  _event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    const allCourses = await getAllCourses();
    
    // Filter to courses that have enough questions for trial
    // Use direct DynamoDB query to count questions without loading alternatives
    const { queryItems } = await import('../config/database');
    const { env } = await import('../config/env');
    
    const coursesWithQuestions = [];
    for (const course of allCourses) {
      const questions = await queryItems<any>(
        env.questionsTable,
        'courseCode = :cc',
        { ':cc': course.code },
        'courseCode-createdAt-index'
      );
      if (questions.length >= 10) {
        coursesWithQuestions.push({
          code: course.code,
          name: course.name,
          provider: course.provider,
          description: course.description,
          badgeImageUrl: course.badgeImageUrl || null,
          questionCount: questions.length,
        });
      }
    }

    return createResponse(200, { courses: coursesWithQuestions });
  } catch (error) {
    console.error('Get trial courses error:', error);
    return createResponse(500, { error: 'Failed to load available courses' });
  }
}

/**
 * POST /api/trial/register
 * 
 * Self-registration for trial access.
 * Creates a Cognito user (or reuses existing) and a trial enrollment.
 * 
 * Request Body:
 * {
 *   "email": "student@email.com",
 *   "name": "Student Name",
 *   "password": "Password123!",
 *   "courseCode": "CLF"
 * }
 */
export async function trialRegisterHandler(
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    if (!event.body) {
      return createResponse(400, { error: 'Request body is required' });
    }

    const { email, name, password, courseCode, countryCode, phone, skipUserCreation } = JSON.parse(event.body);

    // Validate required fields
    if (!email || !courseCode) {
      return createResponse(400, {
        error: 'email and courseCode are required',
      });
    }

    // If not skipping user creation, require password and contact info
    if (!skipUserCreation && (!name || !password || !countryCode || !phone)) {
      return createResponse(400, {
        error: 'email, name, password, courseCode, countryCode, and phone are required',
      });
    }

    // Validate email format
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return createResponse(400, { error: 'Invalid email format' });
    }

    // Validate password (only when creating user)
    if (!skipUserCreation && password.length < 8) {
      return createResponse(400, { error: 'Password must be at least 8 characters' });
    }

    // Validate course has enough questions for trial
    const questions = await getQuestionsByCourse(courseCode);
    if (questions.length < 10) {
      return createResponse(400, { error: 'This course is not available for trial' });
    }

    // Step 1: Create or get Cognito user
    let cognitoUserId: string;
    let isNewUser = false;

    if (skipUserCreation) {
      // User already exists (logged in via Google) - just get their ID
      try {
        const { CognitoIdentityProviderClient, ListUsersCommand } = await import('@aws-sdk/client-cognito-identity-provider');
        const cognito = new CognitoIdentityProviderClient({ region: env.cognitoRegion });
        const listResp = await cognito.send(new ListUsersCommand({
          UserPoolId: env.cognitoUserPoolId,
          Filter: `email = "${email}"`,
          Limit: 1,
        }));
        const users = listResp.Users || [];
        if (users.length === 0) {
          return createResponse(400, { error: 'User not found. Please register first.' });
        }
        cognitoUserId = users[0].Attributes?.find(a => a.Name === 'sub')?.Value || users[0].Username || '';
        if (!cognitoUserId) {
          return createResponse(400, { error: 'Could not find user ID.' });
        }
      } catch (e: any) {
        return createResponse(400, { error: `User lookup failed: ${e.message}` });
      }
    } else {
      try {
        cognitoUserId = await createCognitoUser(email, password, 'student', name);
        isNewUser = true;
      } catch (error: any) {
        if (error.message?.includes('already exists') || error.message?.includes('UsernameExistsException')) {
          // User exists - get their ID
          const { CognitoIdentityProviderClient, AdminGetUserCommand, AdminEnableUserCommand, AdminSetUserPasswordCommand } = await import('@aws-sdk/client-cognito-identity-provider');
          const cognito = new CognitoIdentityProviderClient({ region: env.cognitoRegion });
          
          try {
            const userResp = await cognito.send(new AdminGetUserCommand({
              UserPoolId: env.cognitoUserPoolId,
              Username: email,
            }));
            cognitoUserId = userResp.UserAttributes?.find(a => a.Name === 'sub')?.Value || '';
            
            // Enable user if disabled
            await cognito.send(new AdminEnableUserCommand({
              UserPoolId: env.cognitoUserPoolId,
              Username: email,
            }));

            // Update password
            await cognito.send(new AdminSetUserPasswordCommand({
              UserPoolId: env.cognitoUserPoolId,
              Username: email,
              Password: password,
              Permanent: true,
            }));
          } catch {
            return createResponse(500, { error: 'User exists but could not retrieve user ID' });
          }
        } else {
          return createResponse(500, { error: `Failed to create account: ${error.message}` });
        }
      }
    }

    // Always save phone number (works for both new and existing users)
    if (phone && countryCode && !skipUserCreation) {
      try {
        const { CognitoIdentityProviderClient, AdminUpdateUserAttributesCommand } = await import('@aws-sdk/client-cognito-identity-provider');
        const cognitoForPhone = new CognitoIdentityProviderClient({ region: env.cognitoRegion });
        await cognitoForPhone.send(new AdminUpdateUserAttributesCommand({
          UserPoolId: env.cognitoUserPoolId,
          Username: email,
          UserAttributes: [
            { Name: 'phone_number', Value: `${countryCode}${phone}` },
          ],
        }));
        console.log(`Phone saved for ${email}: ${countryCode}${phone}`);
      } catch (phoneErr: any) {
        console.error('Failed to save phone:', phoneErr.message || phoneErr);
      }
    }

    // Step 2: Check existing enrollments - max 1 trial enrollment
    const existingEnrollments = await getEnrollments(cognitoUserId);
    const trialEnrollments = existingEnrollments.filter((e: any) => e.enrollmentType === 'trial');
    const fullEnrollments = existingEnrollments.filter((e: any) => !e.enrollmentType || e.enrollmentType === 'full');
    
    // If user has any full enrollment, they don't need trial
    if (fullEnrollments.length > 0) {
      return createResponse(400, {
        error: 'You already have a paid enrollment. Please log in to access your courses.',
      });
    }

    // Check trial limit
    if (trialEnrollments.length >= MAX_TRIAL_ENROLLMENTS) {
      return createResponse(400, {
        error: 'You have already used your free trial. Contact us to purchase full access.',
      });
    }

    // Check if already enrolled in this specific course
    const alreadyEnrolled = existingEnrollments.some((e: any) => e.courseCode === courseCode);
    if (alreadyEnrolled) {
      return createResponse(400, {
        error: 'You are already enrolled in this course. Please log in to access it.',
      });
    }

    // Step 3: Create trial enrollment
    const now = new Date();
    const accessEnd = new Date(now);
    accessEnd.setDate(accessEnd.getDate() + TRIAL_ACCESS_DAYS);

    const enrollment = await createEnrollment(
      cognitoUserId,
      courseCode,
      'trial',
      now,
      now,
      accessEnd
    );

    // Mark enrollment as trial type
    const { updateItem } = await import('../config/database');
    await updateItem(env.enrollmentsTable, { id: enrollment.id }, { enrollmentType: 'trial' });

    return createResponse(201, {
      success: true,
      message: 'Trial registration successful! You can now log in and take your free exam.',
      studentId: cognitoUserId,
      enrollmentId: enrollment.id,
      courseCode,
      isNewUser,
      accessEndDate: accessEnd.toISOString(),
    });
  } catch (error: any) {
    console.error('Trial register error:', error);
    return createResponse(500, {
      error: 'An error occurred during registration. Please try again.',
    });
  }
}
