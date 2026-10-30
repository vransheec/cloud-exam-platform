/**
 * Environment Configuration
 * 
 * This module loads and validates environment variables for the backend.
 * All configuration values are centralized here for easy access throughout the application.
 */

export interface EnvironmentConfig {
  // AWS Configuration
  awsRegion: string;
  dynamoDbTablePrefix: string;

  // Authentication
  jwtSecret: string;
  jwtExpiration: string;

  // Cognito Configuration
  cognitoUserPoolId: string;
  cognitoClientId: string;
  cognitoRegion: string;

  // S3 Configuration
  s3BucketName: string;
  s3Region: string;

  // Database Table Names
  usersTable: string;
  studentsTable: string;
  coursesTable: string;
  questionsTable: string;
  questionHistoryTable: string;
  alternativesTable: string;
  enrollmentsTable: string;
  examSessionsTable: string;
  answersTable: string;
  examResultsTable: string;
  systemConfigTable: string;

  // Environment
  nodeEnv: string;
}

/**
 * Load environment variables with defaults
 * Throws an error if required variables are missing
 */
function loadEnvironmentConfig(): EnvironmentConfig {
  const requiredVars = ['JWT_SECRET'];
  
  // Check for required environment variables
  for (const varName of requiredVars) {
    if (!process.env[varName]) {
      throw new Error(`Missing required environment variable: ${varName}`);
    }
  }

  return {
    // AWS Configuration
    awsRegion: process.env.AWS_REGION || 'us-east-1',
    dynamoDbTablePrefix: process.env.DYNAMODB_TABLE_PREFIX || 'cloud-exam-platform',

    // Authentication
    jwtSecret: process.env.JWT_SECRET!,
    jwtExpiration: process.env.JWT_EXPIRATION || '24h',

    // Cognito Configuration
    cognitoUserPoolId: process.env.COGNITO_USER_POOL_ID || '',
    cognitoClientId: process.env.COGNITO_CLIENT_ID || '',
    cognitoRegion: process.env.COGNITO_REGION || process.env.AWS_REGION || 'us-east-1',

    // S3 Configuration
    s3BucketName: process.env.S3_BUCKET_NAME || 'cloud-exam-platform-images',
    s3Region: process.env.S3_REGION || 'us-east-1',

    // Database Table Names
    usersTable: process.env.USERS_TABLE || 'cloud-exam-platform-users',
    studentsTable: process.env.STUDENTS_TABLE || 'cloud-exam-platform-students',
    coursesTable: process.env.COURSES_TABLE || 'cloud-exam-platform-courses',
    questionsTable: process.env.QUESTIONS_TABLE || 'cloud-exam-platform-questions',
    questionHistoryTable: process.env.QUESTION_HISTORY_TABLE || 'cloud-exam-platform-question-history',
    alternativesTable: process.env.ALTERNATIVES_TABLE || 'cloud-exam-platform-alternatives',
    enrollmentsTable: process.env.ENROLLMENTS_TABLE || 'cloud-exam-platform-enrollments',
    examSessionsTable: process.env.EXAM_SESSIONS_TABLE || 'cloud-exam-platform-exam-sessions',
    answersTable: process.env.ANSWERS_TABLE || 'cloud-exam-platform-answers',
    examResultsTable: process.env.EXAM_RESULTS_TABLE || 'cloud-exam-platform-exam-results',
    systemConfigTable: process.env.SYSTEM_CONFIG_TABLE || 'cloud-exam-platform-system-config',

    // Environment
    nodeEnv: process.env.NODE_ENV || 'development',
  };
}

// Export singleton instance
export const env = loadEnvironmentConfig();
