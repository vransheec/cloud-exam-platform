/**
 * Student Service
 * 
 * Handles all student-related API calls including courses, exams, and history.
 */

import { Course, Enrollment } from '../types/student';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

/**
 * Course with enrollment and access information
 */
export interface CourseWithAccess {
  course: Course;
  enrollment: Enrollment;
  accessStatus: {
    hasAccess: boolean;
    reason: string;
    expiresAt: string;
  };
}

/**
 * Exam information for a course
 */
export interface ExamInfo {
  course: Course;
  questionCount: number;
  hasAccess: boolean;
  accessStatus: {
    hasAccess: boolean;
    reason: string;
    expiresAt: string;
  };
  isTrial?: boolean;
  timeLimitMinutes?: number;
}

/**
 * Question with alternatives
 */
export interface Alternative {
  id: string;
  questionId: string;
  text: string;
  imageUrl: string | null;
  isCorrect: boolean;
  order: number;
}

export interface Question {
  id: string;
  courseCode: string;
  questionText: string;
  questionType: 'single' | 'multiple' | 'dropdown' | 'truefalse' | 'ordering';
  imageUrl: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  version: number;
  explanation?: string | null;
  incorrectExplanation?: string | null;
  extendedData?: {
    dropdownStatements?: Array<{ text: string; options: string[]; correctOption: string }>;
    trueFalseStatements?: Array<{ text: string; isTrue: boolean }>;
    orderingItems?: Array<{ text: string; correctPosition: number }>;
    additionalImages?: string[];
    contentBlocks?: Array<{ type: 'text' | 'image'; value: string }>;
  } | null;
}

export interface FieldLanguages {
  questionText: 'en' | 'es';
  explanation?: 'en' | 'es';
  incorrectExplanation?: 'en' | 'es';
  alternatives?: Record<string, { text: 'en' | 'es' }>;
}

export interface QuestionWithAlternatives {
  question: Question;
  alternatives: Alternative[];
  fieldLanguages?: FieldLanguages;
}

/**
 * Exam session
 */
export interface ExamSession {
  id: string;
  studentId: string;
  courseCode: string;
  startTime: string;
  endTime: string | null;
  isActive: boolean;
  status: 'in_progress' | 'completed' | 'failed';
  createdAt: string;
}

/**
 * Exam session with questions
 */
export interface ExamSessionWithQuestions {
  session: ExamSession & { language?: 'en' | 'es' };
  questions: QuestionWithAlternatives[];
}

/**
 * Answer submission
 */
export interface Answer {
  id: string;
  sessionId: string;
  questionId: string;
  selectedAlternativeId: string;
  isCorrect: boolean;
  answeredAt: string;
}

/**
 * Exam result
 */
export interface ExamResult {
  id: string;
  sessionId: string;
  studentId: string;
  courseCode: string;
  score: number;
  totalQuestions: number;
  completedAt: string;
}

/**
 * Exam completion response
 */
export interface ExamCompletionResponse {
  result: ExamResult;
  answers: {
    questionId: string;
    selectedAlternativeIds: string[];
    isCorrect: boolean;
    correctAlternativeIds: string[];
    explanation?: string | null;
    incorrectExplanation?: string | null;
    isUnscored?: boolean;
  }[];
  isTrial?: boolean;
}

/**
 * Gets all courses the student is enrolled in with access status
 * @param token - Authentication token
 * @returns Array of courses with enrollment and access information
 */
export async function getCourses(token: string): Promise<CourseWithAccess[]> {
  const response = await fetch(`${API_BASE_URL}/courses`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to fetch courses');
  }

  return response.json();
}

/**
 * Gets exam information for a specific course
 * @param token - Authentication token
 * @param courseCode - Course code
 * @returns Exam information
 */
export async function getExamInfo(token: string, courseCode: string): Promise<ExamInfo> {
  const response = await fetch(`${API_BASE_URL}/courses/${courseCode}/exams`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to fetch exam information');
  }

  return response.json();
}

/**
 * Starts a new exam session for a course
 * @param token - Authentication token
 * @param courseCode - Course code
 * @param language - Exam language ('en' or 'es')
 * @returns Exam session with questions
 */
export async function startExam(token: string, courseCode: string, language: 'en' | 'es' = 'en'): Promise<ExamSessionWithQuestions> {
  const response = await fetch(`${API_BASE_URL}/exams/start`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ courseCode, language }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to start exam');
  }

  return response.json();
}

/**
 * Gets the current active exam session for the student
 * @param token - Authentication token
 * @returns Active exam session with questions or null
 */
export async function getActiveExam(token: string): Promise<ExamSessionWithQuestions | null> {
  const response = await fetch(`${API_BASE_URL}/exams/active`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to fetch active exam');
  }

  return response.json();
}

/**
 * Submits an answer for a question in an exam session
 * @param token - Authentication token
 * @param sessionId - Exam session ID
 * @param questionId - Question ID
 * @param alternativeIds - Array of selected alternative IDs
 * @returns Answer record
 */
export async function submitAnswer(
  token: string,
  sessionId: string,
  questionId: string,
  alternativeIds: string[]
): Promise<Answer> {
  const response = await fetch(`${API_BASE_URL}/exams/${sessionId}/answers`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ questionId, alternativeIds }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to submit answer');
  }

  return response.json();
}

/**
 * Completes an exam session and returns the score with correct answers
 * @param token - Authentication token
 * @param sessionId - Exam session ID
 * @returns Exam result with answers
 */
export async function completeExam(token: string, sessionId: string): Promise<ExamCompletionResponse> {
  const response = await fetch(`${API_BASE_URL}/exams/${sessionId}/complete`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to complete exam');
  }

  return response.json();
}

/**
 * Gets the exam history for the authenticated student
 * @param token - Authentication token
 * @returns Array of exam results
 */
export async function getExamHistory(token: string): Promise<ExamResult[]> {
  const response = await fetch(`${API_BASE_URL}/exams/history`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to fetch exam history');
  }

  return response.json();
}

/**
 * Abandons all active exam sessions for the current student
 * This allows students who are stuck to start fresh
 * @param token - Authentication token
 * @returns Success message with count of abandoned sessions
 */
export async function abandonExam(token: string): Promise<{ success: boolean; message: string; abandonedCount: number }> {
  const response = await fetch(`${API_BASE_URL}/exams/abandon`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to abandon exam');
  }

  return response.json();
}
