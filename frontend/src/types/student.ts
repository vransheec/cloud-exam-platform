/**
 * Student Types
 * 
 * Type definitions for student-related data structures.
 */

export interface Student {
  userId: string;
  email: string;
  name: string;
  phone?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  enrollments?: Array<{
    courseCode: string;
    enrollmentType: 'full' | 'trial';
    accessEndDate: string;
  }>;
}

export interface CreateStudentRequest {
  userId: string; // Email address
  name: string;
  password: string;
  isActive: boolean;
}

export interface UpdateStudentRequest {
  name?: string;
}

export interface Enrollment {
  id: string;
  studentId: string;
  courseCode: string;
  courseSection: string;
  startDate: string;
  accessStartDate: string;
  accessEndDate: string;
  enrolledAt: string;
  enrollmentType?: 'full' | 'trial';
}

export interface CreateEnrollmentRequest {
  courseCode: string;
  courseSection: string;
  startDate: string;
  accessStartDate?: string; // Optional, defaults to startDate if not provided
  accessEndDate?: string; // Optional, defaults to 1 month after startDate if not provided
}

export interface Course {
  code: string;
  name: string;
  provider: 'AWS' | 'Azure' | 'GCP';
  description: string;
  examQuestionCount: number;
  passingPercentage: number;
  badgeImageUrl?: string | null;
  reviewModeEnabled?: boolean;
  timeLimitMinutes?: number;
}

export interface StudentWithEnrollments {
  student: Student;
  enrollments: Enrollment[];
}

export interface SystemConfig {
  key: string;
  value: boolean | string | number;
  updatedBy: string;
  updatedAt: string;
}
