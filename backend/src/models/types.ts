/**
 * Core Data Models and Types
 * 
 * This file defines all TypeScript interfaces for the Cloud Exam Platform.
 * These types represent the data structures used throughout the application
 * for users, courses, questions, exams, and related entities.
 */

/**
 * User Role Types
 * - operator: Administrator who manages students and access control
 * - assistant: Staff member who uploads and manages exam content
 * - student: Enrolled learner who takes exams
 */
export type UserRole = 'operator' | 'assistant' | 'student';

/**
 * Cloud Provider Types
 * Represents the three major cloud certification providers supported
 */
export type CloudProvider = 'AWS' | 'Azure' | 'GCP';

/**
 * Exam Session Status
 * - in_progress: Student is currently taking the exam
 * - completed: Exam has been successfully finished
 * - failed: Exam encountered an error and needs to be restarted
 */
export type ExamSessionStatus = 'in_progress' | 'completed' | 'failed';

/**
 * User
 * 
 * Base user entity for authentication and authorization.
 * All users (operators, assistants, students) have a User record.
 */
export interface User {
  /** Unique identifier for the user (UUID) */
  id: string;
  
  /** User's email address (used for login, must be unique) */
  email: string;
  
  /** Hashed password for authentication */
  passwordHash: string;
  
  /** User's role determining their permissions and interface access */
  role: UserRole;
  
  /** Timestamp when the user account was created (ISO string) */
  createdAt: string;
  
  /** Timestamp when the user account was last updated (ISO string) */
  updatedAt: string;
}

/**
 * Student
 * 
 * Extended profile information for student users.
 * Links to a User record and contains additional student-specific data.
 */
export interface Student {
  /** Foreign key reference to the User record */
  userId: string;
  
  /** Student's email address (for Cognito operations) */
  email: string;
  
  /** Student's full name */
  name: string;
  
  /** Manual activation flag - operator must activate for student to access platform */
  isActive: boolean;
  
  /** Timestamp when the student profile was created (ISO string) */
  createdAt: string;
  
  /** Timestamp when the student profile was last updated (ISO string) */
  updatedAt: string;
}

/**
 * Course
 * 
 * Represents a cloud certification course offered by Cloud Exam Platform.
 * Supported courses:
 * - AWS: CLF, DVA, SAA, DEA, SOA
 * - Azure: AZ900, AZ104, AZ204
 * - GCP: GCDL, GCE
 */
export interface Course {
  /** Course code (primary key, e.g., 'CLF', 'AZ900', 'GCDL') */
  code: string;
  
  /** Full course name (e.g., 'AWS Certified Cloud Practitioner') */
  name: string;
  
  /** Cloud provider offering this certification */
  provider: CloudProvider;
  
  /** Brief description of the course content and objectives */
  description: string;
  
  /** Number of questions to include in each exam for this course */
  examQuestionCount: number;
  
  /** Minimum percentage of correct answers required to pass (0-100) */
  passingPercentage: number;
  
  /** Optional URL to badge image for the course (displayed to students) */
  badgeImageUrl?: string | null;

  /** Whether review mode is enabled for this course */
  reviewModeEnabled?: boolean;

  /** Time limit in minutes for the exam (0 or undefined = no limit) */
  timeLimitMinutes?: number;

  /** Number of questions that are not scored (unscored/pretest questions chosen at random) */
  unscoredQuestions?: number;
}

/**
 * Question Types
 * - single: Only one alternative is correct
 * - multiple: Two or more alternatives can be correct
 * - dropdown: Each statement has a dropdown with options; student picks one per statement
 * - truefalse: Each statement must be marked as true or false (Yes/No)
 * - ordering: Student must arrange items in the correct order
 */
export type QuestionType = 'single' | 'multiple' | 'dropdown' | 'truefalse' | 'ordering';

/**
 * Dropdown statement — used in dropdown-type questions
 * Each statement has its own set of options and one correct option
 */
export interface DropdownStatement {
  text: string;
  options: string[];
  correctOption: string;
}

/**
 * TrueFalse statement — used in truefalse-type questions
 * Each statement is either true or false
 */
export interface TrueFalseStatement {
  text: string;
  isTrue: boolean;
}

/**
 * Ordering item — used in ordering-type questions
 * Items have a text and a correctPosition (0-based).
 * correctPosition = -1 means the item should NOT be selected (distractor).
 */
export interface OrderingItem {
  text: string;
  correctPosition: number;
}

/**
 * Extended question data for new question types.
 * Stored as JSON in the question record.
 */
export interface QuestionExtendedData {
  /** For dropdown questions */
  dropdownStatements?: DropdownStatement[];
  /** For truefalse questions */
  trueFalseStatements?: TrueFalseStatement[];
  /** For ordering questions */
  orderingItems?: OrderingItem[];
  /** Multiple images for the question enunciado */
  additionalImages?: string[];
  /** Mixed content blocks: text and images interleaved in order */
  contentBlocks?: Array<{ type: 'text'; value: string } | { type: 'image'; value: string }>;
}

/**
 * Question
 * 
 * An individual exam question with multiple choice alternatives.
 * Questions are associated with a specific course and may include an image.
 */
export interface Question {
  /** Unique identifier for the question (UUID) */
  id: string;
  
  /** Foreign key to Course - which certification this question belongs to */
  courseCode: string;
  
  /** The question text presented to students */
  questionText: string;
  
  /** Type of question - single or multiple correct answers */
  questionType: QuestionType;
  
  /** Optional URL to an image stored in object storage (S3, Azure Blob, etc.) */
  imageUrl: string | null;
  
  /** Foreign key to User - which assistant created this question */
  createdBy: string;
  
  /** Timestamp when the question was created (ISO string) */
  createdAt: string;
  
  /** Timestamp when the question was last updated (ISO string) */
  updatedAt: string;
  
  /** Version number for tracking question history */
  version: number;

  /** Optional explanation of why the correct answer is correct */
  explanation?: string | null;

  /** Optional explanation of why each incorrect alternative is wrong */
  incorrectExplanation?: string | null;

  /** Extended data for dropdown, truefalse, ordering question types and additional images */
  extendedData?: QuestionExtendedData | null;

  /** Spanish translation of questionText. null/undefined/empty means "not yet translated". */
  questionText_es?: string | null;

  /** Spanish translation of explanation. null/undefined/empty means "not yet translated". */
  explanation_es?: string | null;

  /** Spanish translation of incorrectExplanation. null/undefined/empty means "not yet translated". */
  incorrectExplanation_es?: string | null;
}

/**
 * QuestionHistory
 * 
 * Historical version of a question for audit and rollback purposes.
 * Stores previous versions when questions are updated.
 */
export interface QuestionHistory {
  /** Composite key: questionId + version */
  id: string;
  
  /** Original question ID */
  questionId: string;
  
  /** Version number of this historical record */
  version: number;
  
  /** Foreign key to Course - which certification this question belongs to */
  courseCode: string;
  
  /** The question text at this version */
  questionText: string;
  
  /** Type of question - single or multiple correct answers */
  questionType: QuestionType;
  
  /** Optional URL to an image at this version */
  imageUrl: string | null;
  
  /** Foreign key to User - who created/updated this version */
  createdBy: string;
  
  /** Timestamp when this version was created (ISO string) */
  createdAt: string;
  
  /** Timestamp when this version was archived (replaced by newer version) (ISO string) */
  archivedAt: string;
  
  /** Snapshot of alternatives at this version (stored as JSON) */
  alternativesSnapshot: Alternative[];
}

/**
 * Alternative
 * 
 * A possible answer choice for a question.
 * Each question has multiple alternatives, with exactly one marked as correct.
 */
export interface Alternative {
  /** Unique identifier for the alternative (UUID) */
  id: string;
  
  /** Foreign key to Question - which question this alternative belongs to */
  questionId: string;
  
  /** The alternative text (answer choice) */
  text: string;
  
  /** Optional URL to an image for this alternative */
  imageUrl: string | null;
  
  /** Whether this alternative is the correct answer */
  isCorrect: boolean;
  
  /** Display order for this alternative (0-based) */
  order: number;

  /** Spanish translation of text. null/undefined/empty means "not yet translated". */
  text_es?: string | null;
}

/**
 * Supported Language for exam content display.
 * 'en' = English (source of truth)
 * 'es' = Spanish (translated via Amazon Translate)
 */
export type SupportedLanguage = 'en' | 'es';

/**
 * Enrollment
 * 
 * Links a student to a course with time-based access control.
 * Students can have multiple enrollments across different courses.
 * Access is calculated as: start date + 1 month to start date + 2 months
 */
export interface Enrollment {
  /** Unique identifier for the enrollment (UUID) */
  id: string;
  
  /** Foreign key to Student - which student is enrolled */
  studentId: string;
  
  /** Foreign key to Course - which course the student is enrolled in */
  courseCode: string;
  
  /** Course section identifier (e.g., "Section A", "Morning Class", "2024-Spring") */
  courseSection: string;
  
  /** Date when the course section begins (ISO string) */
  startDate: string;
  
  /** Calculated date when exam access begins (startDate + 1 month) (ISO string) */
  accessStartDate: string;
  
  /** Calculated date when exam access ends (accessStartDate + 1 month) (ISO string) */
  accessEndDate: string;
  
  /** Timestamp when the enrollment was created (ISO string) */
  enrolledAt: string;

  /** Enrollment type: 'full' (default/paid) or 'trial' (free limited access) */
  enrollmentType?: 'full' | 'trial';
}

/**
 * ExamSession
 * 
 * Represents a single exam attempt by a student.
 * Only one session can be active per student at a time (enforced across all browsers).
 */
export interface ExamSession {
  /** Unique identifier for the exam session (UUID) */
  id: string;
  
  /** Foreign key to Student - which student is taking the exam */
  studentId: string;
  
  /** Foreign key to Course - which course exam is being taken */
  courseCode: string;
  
  /** Timestamp when the exam session started (ISO string) */
  startTime: string;
  
  /** Timestamp when the exam session ended (null if still in progress) (ISO string) */
  endTime: string | null;
  
  /** Whether this session is currently active (stored as string for DynamoDB GSI, but may be boolean in legacy data) */
  isActive: string | boolean;
  
  /** Current status of the exam session */
  status: ExamSessionStatus;
  
  /** Timestamp when the session record was created (ISO string) */
  createdAt: string;
  
  /** Timestamp of last activity (for detecting multiple browser usage) (ISO string) */
  lastActivity?: string;

  /** IDs of questions assigned to this exam session */
  questionIds?: string[];

  /** Language selected by the student for this exam session. Defaults to 'en' if absent. */
  language?: SupportedLanguage;
}

/**
 * Answer
 * 
 * Records a student's answer selection for a specific question in an exam session.
 * Answers are preserved when navigating between questions.
 * For multiple correct answer questions, stores array of selected alternatives.
 */
export interface Answer {
  /** Unique identifier for the answer (UUID) */
  id: string;
  
  /** Foreign key to ExamSession - which exam session this answer belongs to */
  sessionId: string;
  
  /** Foreign key to Question - which question was answered */
  questionId: string;
  
  /** Foreign key to Alternative - which alternative the student selected (for single answer questions) */
  selectedAlternativeId: string;
  
  /** Array of selected alternative IDs (for multiple answer questions) */
  selectedAlternativeIds: string[];
  
  /** Whether the answer was correct (considering all selections for multiple answer questions) */
  isCorrect: boolean;
  
  /** Timestamp when the answer was submitted (ISO string) */
  answeredAt: string;
}

/**
 * ExamResult
 * 
 * Summary of a completed exam session with score and metadata.
 * Only completed exams are stored as results (failed sessions are excluded).
 */
export interface ExamResult {
  /** Unique identifier for the exam result (UUID) */
  id: string;
  
  /** Foreign key to ExamSession - which session this result is for */
  sessionId: string;
  
  /** Foreign key to Student - which student took the exam */
  studentId: string;
  
  /** Foreign key to Course - which course exam was taken */
  courseCode: string;
  
  /** Number of questions answered correctly */
  score: number;
  
  /** Total number of questions in the exam */
  totalQuestions: number;
  
  /** Timestamp when the exam was completed (ISO string) */
  completedAt: string;
}

/**
 * SystemConfig
 * 
 * Key-value store for system-wide configuration settings.
 * Used for features like site availability control.
 */
export interface SystemConfig {
  /** Configuration key (primary key, e.g., 'site_available') */
  key: string;
  
  /** Configuration value (can be string, boolean, or number) */
  value: string | boolean | number;
  
  /** Foreign key to User - which operator last updated this config */
  updatedBy: string;
  
  /** Timestamp when the configuration was last updated (ISO string) */
  updatedAt: string;
}

/**
 * AccessStatus
 * 
 * Result of checking whether a student has access to a course.
 * Includes the access decision and reason for denial if applicable.
 */
export interface AccessStatus {
  /** Whether the student has access to the course */
  hasAccess: boolean;
  
  /** Explanation for why access was granted or denied */
  reason: string;
  
  /** Date when access expires (if applicable) (ISO string) */
  expiresAt: string | null;
}

/**
 * AuthResult
 * 
 * Result of an authentication attempt.
 * Contains user information and authentication token on success.
 */
export interface AuthResult {
  /** Whether authentication was successful */
  success: boolean;
  
  /** Type of user that authenticated */
  userType: UserRole | null;
  
  /** Authentication token (JWT) for subsequent requests */
  token: string | null;
  
  /** Unique identifier of the authenticated user */
  userId: string | null;
  
  /** Error message if authentication failed */
  error?: string;
}

/**
 * SessionInfo
 * 
 * Information about a validated session.
 * Used to verify authentication tokens on protected routes.
 */
export interface SessionInfo {
  /** Whether the session token is valid */
  valid: boolean;
  
  /** User ID from the session token */
  userId: string | null;
  
  /** User role from the session token */
  userType: UserRole | null;
  
  /** Error message if session validation failed */
  error?: string;
}
