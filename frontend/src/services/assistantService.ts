/**
 * Assistant Service
 * 
 * Handles all assistant-related API calls including student management
 * and question management.
 */

import { Student, CreateStudentRequest } from '../types/student';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

/**
 * Question with alternatives interface
 */
export interface QuestionWithAlternatives {
  question: {
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
    extendedData?: any;
  };
  alternatives: Array<{
    id: string;
    questionId: string;
    text: string;
    imageUrl: string | null;
    isCorrect: boolean;
    order: number;
  }>;
}

/**
 * Create question request interface
 */
export interface CreateQuestionRequest {
  courseCode: string;
  questionText: string;
  questionType: 'single' | 'multiple' | 'dropdown' | 'truefalse' | 'ordering';
  imageUrl?: string | null;
  alternatives: Array<{
    text: string;
    imageUrl?: string | null;
    isCorrect: boolean;
    order?: number;
  }>;
}

/**
 * Update question request interface
 */
export interface UpdateQuestionRequest {
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
 * Gets the authentication token from localStorage
 */
function getAuthToken(): string {
  const token = localStorage.getItem('authToken');
  if (!token) {
    throw new Error('No authentication token found');
  }
  return token;
}

/**
 * Creates a new student profile (assistant version)
 * @param studentData - Student information
 * @returns Created student
 */
export async function createStudent(studentData: CreateStudentRequest): Promise<Student> {
  const response = await fetch(`${API_BASE_URL}/assistant/students`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getAuthToken()}`,
    },
    body: JSON.stringify(studentData),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to create student');
  }

  const result = await response.json();
  return result.student;
}

/**
 * Gets all students (assistant version)
 * @returns Array of all students
 */
export async function getAllStudents(): Promise<Student[]> {
  const response = await fetch(`${API_BASE_URL}/assistant/students`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${getAuthToken()}`,
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to fetch students');
  }

  const result = await response.json();
  return result.students;
}

/**
 * Resets a student's password (assistant version)
 * @param studentId - Student user ID
 * @param newPassword - New password
 * @returns Success confirmation
 */
export async function resetStudentPassword(
  studentId: string,
  newPassword: string
): Promise<{ success: boolean; message: string }> {
  const response = await fetch(`${API_BASE_URL}/assistant/students/${studentId}/reset-password`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getAuthToken()}`,
    },
    body: JSON.stringify({ newPassword }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to reset password');
  }

  return await response.json();
}

/**
 * Gets all questions for a course
 * @param courseCode - Course code
 * @returns Array of questions with alternatives
 */
export async function getQuestionsByCourse(courseCode: string): Promise<QuestionWithAlternatives[]> {
  const response = await fetch(`${API_BASE_URL}/courses/${courseCode}/questions`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${getAuthToken()}`,
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to fetch questions');
  }

  return await response.json();
}

/**
 * Creates a new question
 * @param questionData - Question data
 * @returns Created question with alternatives
 */
export async function createQuestion(questionData: CreateQuestionRequest): Promise<QuestionWithAlternatives> {
  const response = await fetch(`${API_BASE_URL}/questions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getAuthToken()}`,
    },
    body: JSON.stringify(questionData),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to create question');
  }

  return await response.json();
}

/**
 * Gets a question by ID
 * @param questionId - Question ID
 * @returns Question with alternatives
 */
export async function getQuestion(questionId: string): Promise<QuestionWithAlternatives> {
  const response = await fetch(`${API_BASE_URL}/questions/${questionId}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${getAuthToken()}`,
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to fetch question');
  }

  return await response.json();
}

/**
 * Updates a question
 * @param questionId - Question ID
 * @param updates - Updates to apply
 * @returns Updated question with alternatives
 */
export async function updateQuestion(
  questionId: string,
  updates: UpdateQuestionRequest
): Promise<QuestionWithAlternatives> {
  const response = await fetch(`${API_BASE_URL}/questions/${questionId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getAuthToken()}`,
    },
    body: JSON.stringify(updates),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to update question');
  }

  return await response.json();
}

/**
 * Deletes a question
 * @param questionId - Question ID
 * @returns Success confirmation
 */
export async function deleteQuestion(questionId: string): Promise<{ success: boolean; message: string }> {
  const response = await fetch(`${API_BASE_URL}/questions/${questionId}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${getAuthToken()}`,
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to delete question');
  }

  return await response.json();
}

/**
 * Uploads an image
 * @param file - Image file
 * @returns Upload result with URL
 */
export async function uploadImage(file: File): Promise<{ url: string; key: string; size: number; contentType: string }> {
  const formData = new FormData();
  formData.append('image', file);

  const response = await fetch(`${API_BASE_URL}/images/upload`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${getAuthToken()}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to upload image');
  }

  return await response.json();
}

/**
 * Creates an enrollment for a student
 * @param studentId - Student user ID
 * @param courseCode - Course code
 * @param courseSection - Course section identifier
 * @param startDate - Course start date
 * @param accessStartDate - Optional access start date (defaults to startDate)
 * @param accessEndDate - Optional access end date (defaults to 1 month after startDate)
 * @returns Created enrollment
 */
export async function createEnrollment(
  studentId: string,
  courseCode: string,
  courseSection: string,
  startDate: string,
  accessStartDate?: string,
  accessEndDate?: string
): Promise<any> {
  const response = await fetch(`${API_BASE_URL}/assistant/enrollments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getAuthToken()}`,
    },
    body: JSON.stringify({
      studentId,
      courseCode,
      courseSection,
      startDate,
      accessStartDate,
      accessEndDate,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to create enrollment');
  }

  return await response.json();
}

/**
 * Gets all available courses
 * @returns Array of all courses
 */
export async function getAllCourses(): Promise<any[]> {
  const response = await fetch(`${API_BASE_URL}/assistant/courses`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${getAuthToken()}`,
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to fetch courses');
  }

  return await response.json();
}

/**
 * Gets enrollments for a student
 * @param studentId - Student user ID
 * @returns Array of student enrollments
 */
export async function getStudentEnrollments(studentId: string): Promise<any[]> {
  const response = await fetch(`${API_BASE_URL}/assistant/students/${studentId}/enrollments`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${getAuthToken()}`,
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to fetch student enrollments');
  }

  return await response.json();
}

/**
 * Updates an enrollment's access dates
 */
export async function updateEnrollment(
  enrollmentId: string,
  updates: { accessStartDate?: string; accessEndDate?: string }
): Promise<any> {
  const response = await fetch(`${API_BASE_URL}/assistant/enrollments/${enrollmentId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getAuthToken()}`,
    },
    body: JSON.stringify(updates),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to update enrollment');
  }

  return await response.json();
}

/**
 * Bulk import questions from CSV
 * @param courseCode - Course code to import questions for
 * @param csvContent - CSV file content as string
 * @returns Import result with success/failure counts
 */
export async function bulkImportQuestions(
  courseCode: string,
  csvContent: string
): Promise<{ success: boolean; imported: number; failed: number; errors: Array<{ row: number; field?: string; message: string }> }> {
  const response = await fetch(`${API_BASE_URL}/questions/bulk-import`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getAuthToken()}`,
    },
    body: JSON.stringify({ courseCode, csvContent }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to import questions');
  }

  return await response.json();
}

/**
 * Download CSV template for bulk import
 * @returns CSV template content
 */
export async function downloadCSVTemplate(): Promise<string> {
  const response = await fetch(`${API_BASE_URL}/questions/csv-template`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${getAuthToken()}`,
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to download template');
  }

  return await response.text();
}

/**
 * Bulk activate or deactivate students
 * @param studentIds - Array of student IDs
 * @param action - 'activate' or 'deactivate'
 * @returns Success confirmation
 */
export async function bulkStudentActivation(
  studentIds: string[],
  action: 'activate' | 'deactivate'
): Promise<{ success: boolean; message: string }> {
  const response = await fetch(`${API_BASE_URL}/assistant/students/bulk-activation`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getAuthToken()}`,
    },
    body: JSON.stringify({ studentIds, action }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to update student activation status');
  }

  return await response.json();
}

/**
 * Creates a new course (assistant version)
 * @param courseData - Course information
 * @returns Created course
 */
export async function createCourse(courseData: {
  code: string;
  name: string;
  provider: string;
  description: string;
  examQuestionCount?: number;
  passingPercentage?: number;
  badgeImageUrl?: string | null;
}): Promise<any> {
  const response = await fetch(`${API_BASE_URL}/assistant/courses`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getAuthToken()}`,
    },
    body: JSON.stringify(courseData),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to create course');
  }

  return await response.json();
}

/**
 * Updates an existing course (assistant version)
 * @param courseCode - Course code
 * @param updates - Course updates
 * @returns Updated course
 */
export async function updateCourse(
  courseCode: string,
  updates: {
    name?: string;
    provider?: string;
    description?: string;
    examQuestionCount?: number;
    passingPercentage?: number;
    badgeImageUrl?: string | null;
    reviewModeEnabled?: boolean;
    timeLimitMinutes?: number;
  }
): Promise<any> {
  const response = await fetch(`${API_BASE_URL}/assistant/courses/${courseCode}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getAuthToken()}`,
    },
    body: JSON.stringify(updates),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to update course');
  }

  return await response.json();
}

/**
 * Deletes a student account (assistant version)
 * @param studentId - Student user ID
 */
export async function deleteStudent(studentId: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/assistant/students/${studentId}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${getAuthToken()}`,
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to delete student');
  }
}

/**
 * Exports all questions from a course as CSV
 * @param courseCode - Course code to export questions from
 * @returns CSV content as string
 */
export async function exportQuestionsToCSV(courseCode: string): Promise<string> {
  const response = await fetch(`${API_BASE_URL}/assistant/courses/${courseCode}/questions/export`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${getAuthToken()}`,
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to export questions');
  }

  return await response.text();
}
