/**
 * Operator Service
 * 
 * Handles all operator-related API calls including student management,
 * enrollment management, and system configuration.
 */

import {
  Student,
  CreateStudentRequest,
  UpdateStudentRequest,
  Enrollment,
  CreateEnrollmentRequest,
  StudentWithEnrollments,
  SystemConfig,
} from '../types/student';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

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
 * Creates a new student profile
 * @param studentData - Student information
 * @returns Created student
 */
export async function createStudent(studentData: CreateStudentRequest): Promise<Student> {
  const response = await fetch(`${API_BASE_URL}/students`, {
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

  return response.json();
}

/**
 * Updates an existing student profile
 * @param studentId - Student user ID
 * @param updates - Fields to update (only name is supported)
 * @returns Updated student
 */
export async function updateStudent(
  studentId: string,
  updates: UpdateStudentRequest
): Promise<Student> {
  const response = await fetch(`${API_BASE_URL}/students/${studentId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getAuthToken()}`,
    },
    body: JSON.stringify(updates),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to update student');
  }

  return response.json();
}

/**
 * Gets a student profile with enrollment information
 * @param studentId - Student user ID
 * @returns Student with enrollments
 */
export async function getStudent(studentId: string): Promise<StudentWithEnrollments> {
  const response = await fetch(`${API_BASE_URL}/students/${studentId}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${getAuthToken()}`,
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to fetch student');
  }

  return response.json();
}

/**
 * Gets all students
 * @returns Array of all students
 */
export async function getAllStudents(): Promise<Student[]> {
  const response = await fetch(`${API_BASE_URL}/students`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${getAuthToken()}`,
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to fetch students');
  }

  const data = await response.json();
  return data.students || [];
}

/**
 * Activates or deactivates a student account
 * @param studentId - Student user ID
 * @param isActive - Activation status
 * @returns Updated student
 */
export async function setStudentActivation(
  studentId: string,
  isActive: boolean
): Promise<Student> {
  const response = await fetch(`${API_BASE_URL}/students/${studentId}/activate`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getAuthToken()}`,
    },
    body: JSON.stringify({ isActive }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to update student activation');
  }

  return response.json();
}

/**
 * Enrolls a student in a course
 * @param studentId - Student user ID
 * @param enrollmentData - Course code and start date
 * @returns Created enrollment
 */
export async function enrollStudent(
  studentId: string,
  enrollmentData: CreateEnrollmentRequest
): Promise<Enrollment> {
  const response = await fetch(`${API_BASE_URL}/students/${studentId}/enrollments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getAuthToken()}`,
    },
    body: JSON.stringify(enrollmentData),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to enroll student');
  }

  return response.json();
}

/**
 * Sets the site availability status
 * @param isAvailable - Whether the site should be available
 * @returns Updated system config
 */
export async function setSiteAvailability(isAvailable: boolean): Promise<SystemConfig> {
  const response = await fetch(`${API_BASE_URL}/system/availability`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getAuthToken()}`,
    },
    body: JSON.stringify({ isAvailable }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to update site availability');
  }

  return response.json();
}

/**
 * Gets the current site availability status
 * @returns Site availability status
 */
export async function getSiteAvailability(): Promise<{ isAvailable: boolean }> {
  const response = await fetch(`${API_BASE_URL}/system/availability`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${getAuthToken()}`,
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to fetch site availability');
  }

  return response.json();
}

/**
 * Course interface
 */
export interface Course {
  code: string;
  name: string;
  provider: string;
  description: string;
  examQuestionCount: number;
  passingPercentage: number;
  badgeImageUrl?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Gets all courses
 * @returns Array of all courses
 */
export async function getAllCourses(): Promise<Course[]> {
  const response = await fetch(`${API_BASE_URL}/operator/courses`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${getAuthToken()}`,
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to fetch courses');
  }

  const data = await response.json();
  return data.courses || [];
}

/**
 * Gets a single course by code
 * @param code - Course code
 * @returns Course object
 */
export async function getCourse(code: string): Promise<Course> {
  const response = await fetch(`${API_BASE_URL}/operator/courses/${code}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${getAuthToken()}`,
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to fetch course');
  }

  return response.json();
}

/**
 * Creates a new course
 * @param courseData - Course information
 * @returns Created course
 */
export async function createCourse(courseData: Omit<Course, 'createdAt' | 'updatedAt'>): Promise<Course> {
  const response = await fetch(`${API_BASE_URL}/operator/courses`, {
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

  return response.json();
}

/**
 * Updates an existing course
 * @param code - Course code
 * @param updates - Fields to update
 * @returns Updated course
 */
export async function updateCourse(
  code: string,
  updates: Partial<Pick<Course, 'name' | 'provider' | 'description' | 'examQuestionCount' | 'passingPercentage' | 'badgeImageUrl'>>
): Promise<Course> {
  const response = await fetch(`${API_BASE_URL}/operator/courses/${code}`, {
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

  return response.json();
}

/**
 * Deletes a course
 * @param code - Course code
 */
export async function deleteCourse(code: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/operator/courses/${code}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${getAuthToken()}`,
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to delete course');
  }
}

/**
 * Assistant interface
 */
export interface Assistant {
  id: string;
  email: string;
  userType: 'assistant';
  name?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Gets all assistants
 * @returns Array of all assistants
 */
export async function getAllAssistants(): Promise<Assistant[]> {
  const response = await fetch(`${API_BASE_URL}/operator/assistants`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${getAuthToken()}`,
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to fetch assistants');
  }

  const data = await response.json();
  return data.assistants || [];
}

/**
 * Gets a single assistant by ID
 * @param id - Assistant ID
 * @returns Assistant object
 */
export async function getAssistant(id: string): Promise<Assistant> {
  const response = await fetch(`${API_BASE_URL}/operator/assistants/${id}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${getAuthToken()}`,
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to fetch assistant');
  }

  return response.json();
}

/**
 * Creates a new assistant
 * @param assistantData - Assistant information
 * @returns Created assistant
 */
export async function createAssistant(assistantData: {
  email: string;
  password: string;
  name?: string;
}): Promise<Assistant> {
  const response = await fetch(`${API_BASE_URL}/operator/assistants`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getAuthToken()}`,
    },
    body: JSON.stringify(assistantData),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to create assistant');
  }

  return response.json();
}

/**
 * Updates an existing assistant
 * @param id - Assistant ID
 * @param updates - Fields to update
 * @returns Updated assistant
 */
export async function updateAssistant(
  id: string,
  updates: { email?: string; name?: string }
): Promise<Assistant> {
  const response = await fetch(`${API_BASE_URL}/operator/assistants/${id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getAuthToken()}`,
    },
    body: JSON.stringify(updates),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to update assistant');
  }

  return response.json();
}

/**
 * Deletes an assistant
 * @param id - Assistant ID
 */
export async function deleteAssistant(id: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/operator/assistants/${id}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${getAuthToken()}`,
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to delete assistant');
  }
}



/**
 * Resets a student's password
 * @param studentId - Student user ID
 * @param newPassword - New password
 * @returns Success message
 */
export async function resetStudentPassword(
  studentId: string,
  newPassword: string
): Promise<{ message: string }> {
  const response = await fetch(`${API_BASE_URL}/students/${studentId}/reset-password`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getAuthToken()}`,
    },
    body: JSON.stringify({ newPassword }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to reset student password');
  }

  return response.json();
}

/**
 * Resets an assistant's password
 * @param assistantId - Assistant ID (email)
 * @param newPassword - New password
 * @returns Success message
 */
export async function resetAssistantPassword(
  assistantId: string,
  newPassword: string
): Promise<{ message: string }> {
  const response = await fetch(`${API_BASE_URL}/operator/assistants/${assistantId}/reset-password`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getAuthToken()}`,
    },
    body: JSON.stringify({ newPassword }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to reset assistant password');
  }

  return response.json();
}

/**
 * Deletes a student account
 * @param studentId - Student user ID
 */
export async function deleteStudent(studentId: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/students/${studentId}`, {
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
 * Bulk import student data
 */
export interface BulkStudentData {
  name: string;
  email: string;
  password: string;
}

export interface BulkImportResult {
  email: string;
  name: string;
  success: boolean;
  student?: Student;
  error?: string;
}

export interface BulkImportResponse {
  results: BulkImportResult[];
  summary: {
    total: number;
    successful: number;
    failed: number;
  };
}

/**
 * Bulk creates multiple students at once (assistant endpoint)
 * @param students - Array of student data to create
 * @returns Import results with success/failure for each student
 */
export async function bulkCreateStudents(students: BulkStudentData[]): Promise<BulkImportResponse> {
  const response = await fetch(`${API_BASE_URL}/assistant/students/bulk`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getAuthToken()}`,
    },
    body: JSON.stringify({ students }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to bulk create students');
  }

  return response.json();
}
