/**
 * Enrollment Management Component
 * 
 * Interface for operators to view and manage student course enrollments.
 * Displays access dates, status, and supports multiple enrollments per student.
 */

import React, { useState, useEffect } from 'react';
import { enrollStudent, getStudent } from '../services/operatorService';
import { Enrollment, CreateEnrollmentRequest, Student } from '../types/student';

interface EnrollmentManagementProps {
  studentId: string;
  onBack?: () => void;
}

// Supported course codes
const COURSES = [
  // AWS
  { code: 'CLF', name: 'AWS Certified Cloud Practitioner', provider: 'AWS' },
  { code: 'DVA', name: 'AWS Certified Developer Associate', provider: 'AWS' },
  { code: 'SAA', name: 'AWS Certified Solutions Architect Associate', provider: 'AWS' },
  { code: 'DEA', name: 'AWS Certified Data Engineer Associate', provider: 'AWS' },
  { code: 'SOA', name: 'AWS Certified SysOps Administrator Associate', provider: 'AWS' },
  // Azure
  { code: 'AZ900', name: 'Azure Fundamentals', provider: 'Azure' },
  { code: 'AZ104', name: 'Azure Administrator Associate', provider: 'Azure' },
  { code: 'AZ204', name: 'Azure Developer Associate', provider: 'Azure' },
  // GCP
  { code: 'GCDL', name: 'Google Cloud Digital Leader', provider: 'GCP' },
  { code: 'GACE', name: 'Google Cloud Engineer', provider: 'GCP' },
];

const EnrollmentManagement: React.FC<EnrollmentManagementProps> = ({ studentId, onBack }) => {
  const [student, setStudent] = useState<Student | null>(null);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [showEnrollForm, setShowEnrollForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    courseCode: '',
    courseSection: '',
    startDate: '',
    accessStartDate: '',
    accessEndDate: '',
  });

  // Load student and enrollments
  useEffect(() => {
    loadStudentData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId]);

  const loadStudentData = async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await getStudent(studentId);
      setStudent(data.student);
      setEnrollments(data.enrollments || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load student data');
    } finally {
      setLoading(false);
    }
  };

  const handleEnrollStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const newEnrollment = await enrollStudent(studentId, formData as CreateEnrollmentRequest);
      setEnrollments([...enrollments, newEnrollment]);
      setSuccessMessage('Student enrolled successfully');
      setShowEnrollForm(false);
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to enroll student');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      courseCode: '',
      courseSection: '',
      startDate: '',
      accessStartDate: '',
      accessEndDate: '',
    });
  };

  const cancelEnroll = () => {
    setShowEnrollForm(false);
    resetForm();
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const getAccessStatus = (enrollment: Enrollment) => {
    const now = new Date();
    const accessStart = new Date(enrollment.accessStartDate);
    const accessEnd = new Date(enrollment.accessEndDate);

    if (now < accessStart) {
      return { status: 'pending', label: 'Pending', class: 'status-pending' };
    } else if (now >= accessStart && now <= accessEnd) {
      return { status: 'active', label: 'Active', class: 'status-active' };
    } else {
      return { status: 'expired', label: 'Expired', class: 'status-expired' };
    }
  };

  const getCourseName = (courseCode: string) => {
    const course = COURSES.find((c) => c.code === courseCode);
    return course ? course.name : courseCode;
  };

  const getCourseProvider = (courseCode: string) => {
    const course = COURSES.find((c) => c.code === courseCode);
    return course ? course.provider : 'Unknown';
  };

  // Group enrollments by provider
  const groupedEnrollments = enrollments.reduce((acc, enrollment) => {
    const provider = getCourseProvider(enrollment.courseCode);
    if (!acc[provider]) {
      acc[provider] = [];
    }
    acc[provider].push(enrollment);
    return acc;
  }, {} as Record<string, Enrollment[]>);

  if (loading && !student) {
    return <div className="loading-container">Loading student data...</div>;
  }

  return (
    <div className="enrollment-management">
      <div className="management-header">
        <div>
          <h2>Enrollment Management</h2>
          {student && (
            <p className="student-info">
              Managing enrollments for: <strong>{student.name}</strong> ({student.userId})
            </p>
          )}
        </div>
        <div className="header-actions">
          <button
            className="btn btn-primary"
            onClick={() => setShowEnrollForm(true)}
            disabled={loading}
          >
            Enroll in Course
          </button>
          {onBack && (
            <button className="btn btn-secondary" onClick={onBack} disabled={loading}>
              Back to Students
            </button>
          )}
        </div>
      </div>

      {error && <div className="error-message">{error}</div>}
      {successMessage && <div className="success-message">{successMessage}</div>}

      {/* Enrollment Form */}
      {showEnrollForm && (
        <div className="enrollment-form-container">
          <h3>Enroll Student in Course</h3>
          <form onSubmit={handleEnrollStudent}>
            <div className="form-group">
              <label htmlFor="courseCode">Course *</label>
              <select
                id="courseCode"
                value={formData.courseCode}
                onChange={(e) => setFormData({ ...formData, courseCode: e.target.value })}
                required
                disabled={loading}
              >
                <option value="">Select a course...</option>
                <optgroup label="AWS Certifications">
                  {COURSES.filter((c) => c.provider === 'AWS').map((course) => (
                    <option key={course.code} value={course.code}>
                      {course.code} - {course.name}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Azure Certifications">
                  {COURSES.filter((c) => c.provider === 'Azure').map((course) => (
                    <option key={course.code} value={course.code}>
                      {course.code} - {course.name}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="GCP Certifications">
                  {COURSES.filter((c) => c.provider === 'GCP').map((course) => (
                    <option key={course.code} value={course.code}>
                      {course.code} - {course.name}
                    </option>
                  ))}
                </optgroup>
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="courseSection">Course Section *</label>
              <input
                type="text"
                id="courseSection"
                value={formData.courseSection}
                onChange={(e) => setFormData({ ...formData, courseSection: e.target.value })}
                required
                disabled={loading}
                placeholder="e.g., Section A, Morning Class, 2024-Spring"
              />
              <small className="form-help">
                Identifies which section/class the student belongs to
              </small>
            </div>

            <div className="form-group">
              <label htmlFor="startDate">Course Start Date *</label>
              <input
                type="date"
                id="startDate"
                value={formData.startDate}
                onChange={(e) => {
                  const newStartDate = e.target.value;
                  // Calculate default access end date (1 month after start date)
                  const startDateObj = new Date(newStartDate);
                  startDateObj.setMonth(startDateObj.getMonth() + 1);
                  const defaultEndDate = startDateObj.toISOString().split('T')[0];
                  
                  setFormData({ 
                    ...formData, 
                    startDate: newStartDate,
                    // Auto-fill access start date with course start date
                    accessStartDate: formData.accessStartDate || newStartDate,
                    // Auto-fill access end date with 1 month after start date
                    accessEndDate: formData.accessEndDate || defaultEndDate
                  });
                }}
                required
                disabled={loading}
              />
              <small className="form-help">
                The date when the course officially begins
              </small>
            </div>

            <div className="form-group">
              <label htmlFor="accessStartDate">Access Start Date *</label>
              <input
                type="date"
                id="accessStartDate"
                value={formData.accessStartDate}
                onChange={(e) => setFormData({ ...formData, accessStartDate: e.target.value })}
                required
                disabled={loading}
              />
              <small className="form-help">
                When the student can start taking exams (defaults to course start date)
              </small>
            </div>

            <div className="form-group">
              <label htmlFor="accessEndDate">Access End Date *</label>
              <input
                type="date"
                id="accessEndDate"
                value={formData.accessEndDate}
                onChange={(e) => setFormData({ ...formData, accessEndDate: e.target.value })}
                required
                disabled={loading}
              />
              <small className="form-help">
                When the student's exam access expires (defaults to 1 month after course start date)
              </small>
            </div>

            <div className="form-actions">
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? 'Enrolling...' : 'Enroll Student'}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={cancelEnroll}
                disabled={loading}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Enrollments List */}
      <div className="enrollments-section">
        <h3>Current Enrollments ({enrollments.length})</h3>

        {enrollments.length === 0 ? (
          <div className="empty-state">
            <p>No enrollments found. Click &quot;Enroll in Course&quot; to add one.</p>
          </div>
        ) : (
          <div className="enrollments-by-provider">
            {Object.entries(groupedEnrollments).map(([provider, providerEnrollments]) => (
              <div key={provider} className="provider-section">
                <h4 className="provider-title">{provider} Certifications</h4>
                <div className="enrollment-cards">
                  {providerEnrollments.map((enrollment) => {
                    const accessStatus = getAccessStatus(enrollment);
                    return (
                      <div key={enrollment.id} className="enrollment-card">
                        <div className="enrollment-header">
                          <h5>{enrollment.courseCode}</h5>
                          <span className={`status-badge ${accessStatus.class}`}>
                            {accessStatus.label}
                          </span>
                        </div>
                        <p className="course-name">{getCourseName(enrollment.courseCode)}</p>
                        <div className="enrollment-dates">
                          <div className="date-item">
                            <span className="date-label">Course Start:</span>
                            <span className="date-value">{formatDate(enrollment.startDate)}</span>
                          </div>
                          <div className="date-item">
                            <span className="date-label">Access Start:</span>
                            <span className="date-value">
                              {formatDate(enrollment.accessStartDate)}
                            </span>
                          </div>
                          <div className="date-item">
                            <span className="date-label">Access End:</span>
                            <span className="date-value">
                              {formatDate(enrollment.accessEndDate)}
                            </span>
                          </div>
                          <div className="date-item">
                            <span className="date-label">Enrolled:</span>
                            <span className="date-value">{formatDate(enrollment.enrolledAt)}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default EnrollmentManagement;
