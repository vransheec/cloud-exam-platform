/**
 * Assistant Student Management Component
 * 
 * Allows assistants to create, view, and manage student accounts with bulk operations.
 */

import React, { useState, useEffect } from 'react';
import { createStudent, getAllStudents, resetStudentPassword, createEnrollment, getAllCourses, getStudentEnrollments, deleteStudent } from '../services/assistantService';
import { Student, CreateStudentRequest } from '../types/student';

const AssistantStudentManagement: React.FC = () => {
  const [students, setStudents] = useState<Student[]>([]);
  const [courses, setCourses] = useState<any[]>([]);
  const [filteredStudents, setFilteredStudents] = useState<Student[]>([]);
  const [selectedStudents, setSelectedStudents] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'inactive'>('all');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showPasswordResetForm, setShowPasswordResetForm] = useState(false);
  const [showEnrollmentForm, setShowEnrollmentForm] = useState(false);
  const [showActivationForm, setShowActivationForm] = useState(false);
  const [showEnrollmentsModal, setShowEnrollmentsModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [selectedStudentForEnrollments, setSelectedStudentForEnrollments] = useState<Student | null>(null);
  const [studentEnrollments, setStudentEnrollments] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    userId: '',
    name: '',
    password: '',
    confirmPassword: '',
    isActive: false,
  });

  // Password reset form state
  const [passwordResetData, setPasswordResetData] = useState({
    newPassword: '',
    confirmNewPassword: '',
  });

  // Enrollment form state
  const [enrollmentData, setEnrollmentData] = useState({
    courseCode: '',
    courseSection: '',
    startDate: '',
    accessStartDate: '',
    accessEndDate: '',
  });

  // Activation form state
  const [activationAction, setActivationAction] = useState<'activate' | 'deactivate'>('activate');

  // Load all students on mount
  useEffect(() => {
    loadAllStudents();
    loadAllCourses();
  }, []);

  const loadAllStudents = async () => {
    setLoading(true);
    setError(null);
    try {
      const allStudents = await getAllStudents();
      setStudents(allStudents);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load students');
    } finally {
      setLoading(false);
    }
  };

  const loadAllCourses = async () => {
    try {
      const allCourses = await getAllCourses();
      setCourses(allCourses);
    } catch (err) {
      console.error('Failed to load courses:', err);
    }
  };

  // Filter students based on search term and active status
  useEffect(() => {
    let filtered = students;

    // Filter by search term
    if (searchTerm) {
      filtered = filtered.filter(
        (student) =>
          student.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          student.email.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Filter by active status
    if (filterActive !== 'all') {
      filtered = filtered.filter((student) =>
        filterActive === 'active' ? student.isActive : !student.isActive
      );
    }

    setFilteredStudents(filtered);
  }, [students, searchTerm, filterActive]);

  // Selection handlers
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedStudents(new Set(filteredStudents.map(s => s.userId)));
    } else {
      setSelectedStudents(new Set());
    }
  };

  const handleSelectStudent = (studentId: string, checked: boolean) => {
    const newSelected = new Set(selectedStudents);
    if (checked) {
      newSelected.add(studentId);
    } else {
      newSelected.delete(studentId);
    }
    setSelectedStudents(newSelected);
  };

  const getSelectedStudents = () => {
    return students.filter(s => selectedStudents.has(s.userId));
  };

  const clearSelection = () => {
    setSelectedStudents(new Set());
  };

  // Form handlers
  const handleCreateStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccessMessage(null);

    // Validate password confirmation
    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      setLoading(false);
      return;
    }

    try {
      const studentData: CreateStudentRequest = {
        userId: formData.userId,
        name: formData.name,
        password: formData.password,
        isActive: formData.isActive,
      };

      await createStudent(studentData);
      setSuccessMessage(`Student ${formData.name} created successfully!`);
      
      // Reset form and reload students
      resetForm();
      setShowCreateForm(false);
      await loadAllStudents();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create student');
    } finally {
      setLoading(false);
    }
  };

  const handleBulkPasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    const selected = getSelectedStudents();
    if (selected.length === 0) return;

    setLoading(true);
    setError(null);
    setSuccessMessage(null);

    // Validate password confirmation
    if (passwordResetData.newPassword !== passwordResetData.confirmNewPassword) {
      setError('Passwords do not match');
      setLoading(false);
      return;
    }

    try {
      // Reset password for all selected students
      await Promise.all(
        selected.map(student => 
          resetStudentPassword(student.userId, passwordResetData.newPassword)
        )
      );
      
      setSuccessMessage(`Password reset successfully for ${selected.length} student(s)`);
      setShowPasswordResetForm(false);
      setPasswordResetData({ newPassword: '', confirmNewPassword: '' });
      clearSelection();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset passwords');
    } finally {
      setLoading(false);
    }
  };

  const handleBulkEnrollment = async (e: React.FormEvent) => {
    e.preventDefault();
    const selected = getSelectedStudents();
    if (selected.length === 0) return;

    setLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      // Check for duplicate enrollments first
      const enrollmentPromises = selected.map(async (student) => {
        try {
          // Try to check existing enrollments, but don't block enrollment if the check fails
          let existingEnrollments: any[] = [];
          try {
            existingEnrollments = await getStudentEnrollments(student.userId);
          } catch (fetchError) {
            console.warn(`Could not fetch enrollments for ${student.email}, proceeding with enrollment:`, fetchError);
          }
          
          const existingEnrollment = existingEnrollments.find(enrollment => enrollment.courseCode === enrollmentData.courseCode);
          
          // Only block if already enrolled with a full (non-trial) enrollment
          if (existingEnrollment && existingEnrollment.enrollmentType !== 'trial') {
            return { student: student.email, success: false, error: `Already enrolled in ${enrollmentData.courseCode}` };
          }
          
          await createEnrollment(
            student.userId,
            enrollmentData.courseCode,
            enrollmentData.courseSection,
            enrollmentData.startDate,
            enrollmentData.accessStartDate || undefined,
            enrollmentData.accessEndDate || undefined
          );
          
          return { student: student.email, success: true };
        } catch (error) {
          return { 
            student: student.email, 
            success: false, 
            error: error instanceof Error ? error.message : 'Unknown error' 
          };
        }
      });
      
      const results = await Promise.all(enrollmentPromises);
      const successCount = results.filter(r => r.success).length;
      const failureCount = results.filter(r => !r.success).length;
      
      if (successCount > 0) {
        setSuccessMessage(`Successfully enrolled ${successCount} student(s) in course ${enrollmentData.courseCode}`);
      }
      
      if (failureCount > 0) {
        const failedStudents = results.filter(r => !r.success);
        const errorMessages = failedStudents.map(r => `${r.student}: ${r.error}`).join('; ');
        setError(`Failed to enroll ${failureCount} student(s): ${errorMessages}`);
      }
      
      setShowEnrollmentForm(false);
      setEnrollmentData({ courseCode: '', courseSection: '', startDate: '', accessStartDate: '', accessEndDate: '' });
      clearSelection();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create enrollments');
    } finally {
      setLoading(false);
    }
  };

  const handleBulkActivation = async (e: React.FormEvent) => {
    e.preventDefault();
    const selected = getSelectedStudents();
    if (selected.length === 0) return;

    setLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      // Call the bulk activation API using the assistant service
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL || '/api'}/assistant/students/bulk-activation`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
        },
        body: JSON.stringify({
          studentIds: selected.map(s => s.userId),
          action: activationAction,
        }),
      });

      if (!response.ok) {
        // Try to parse JSON error, but handle HTML responses gracefully
        let errorMessage = 'Failed to update student status';
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch (parseError) {
          // If we can't parse JSON, it might be an HTML error page
          const textResponse = await response.text();
          if (textResponse.includes('<!DOCTYPE')) {
            errorMessage = `Server error (${response.status}). Please check your connection and try again.`;
          } else {
            errorMessage = textResponse || errorMessage;
          }
        }
        throw new Error(errorMessage);
      }

      const result = await response.json();
      
      if (result.success) {
        setSuccessMessage(result.message);
      } else {
        setError(result.message);
      }
      
      setShowActivationForm(false);
      clearSelection();
      await loadAllStudents(); // Reload to get updated status
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update student status');
    } finally {
      setLoading(false);
    }
  };

  const handleViewEnrollments = async (student?: Student) => {
    let targetStudent: Student;
    
    if (student) {
      // Called from card with specific student
      targetStudent = student;
    } else {
      // Called from bulk actions with selected student
      const selected = getSelectedStudents();
      if (selected.length !== 1) {
        setError('Please select exactly one student to view enrollments');
        return;
      }
      targetStudent = selected[0];
    }
    
    setSelectedStudentForEnrollments(targetStudent);
    setLoading(true);
    setError(null);
    
    try {
      const enrollments = await getStudentEnrollments(targetStudent.userId);
      setStudentEnrollments(enrollments);
      setShowEnrollmentsModal(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load student enrollments');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      userId: '',
      name: '',
      password: '',
      confirmPassword: '',
      isActive: false,
    });
  };

  const handleDeleteStudents = async () => {
    const selected = getSelectedStudents();
    if (selected.length === 0) return;

    setLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      // Delete all selected students
      const results = await Promise.all(
        selected.map(async (student) => {
          try {
            await deleteStudent(student.userId);
            return { email: student.email, success: true };
          } catch (error) {
            return { 
              email: student.email, 
              success: false, 
              error: error instanceof Error ? error.message : 'Unknown error' 
            };
          }
        })
      );

      const successCount = results.filter(r => r.success).length;
      const failureCount = results.filter(r => !r.success).length;

      if (successCount > 0) {
        setSuccessMessage(`Successfully deleted ${successCount} student(s)`);
      }

      if (failureCount > 0) {
        const failedStudents = results.filter(r => !r.success);
        const errorMessages = failedStudents.map(r => `${r.email}: ${r.error}`).join('; ');
        setError(`Failed to delete ${failureCount} student(s): ${errorMessages}`);
      }

      setShowDeleteConfirm(false);
      clearSelection();
      await loadAllStudents();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete students');
    } finally {
      setLoading(false);
    }
  };

  const cancelCreate = () => {
    setShowCreateForm(false);
    setError(null); // Clear error when canceling
    setSuccessMessage(null); // Clear success message when canceling
    resetForm();
  };

  return (
    <div className="student-management">
      <div className="management-header">
        <h2>Student Management</h2>
        <button
          className="btn btn-primary"
          onClick={() => {
            setShowCreateForm(true);
            resetForm();
          }}
          disabled={loading}
        >
          Create New Student
        </button>
      </div>

      {error && <div className="error-message">{error}</div>}
      {successMessage && <div className="success-message">{successMessage}</div>}

      {/* Bulk Actions */}
      {selectedStudents.size > 0 && (
        <div className="bulk-actions">
          <div className="bulk-actions-header">
            <span>{selectedStudents.size} student(s) selected</span>
            <button className="btn btn-small btn-secondary" onClick={clearSelection}>
              Clear Selection
            </button>
          </div>
          <div className="bulk-actions-buttons">
            <button
              className="btn btn-secondary"
              onClick={() => setShowPasswordResetForm(true)}
              disabled={loading}
            >
              Reset Password
            </button>
            <button
              className="btn btn-primary"
              onClick={() => setShowEnrollmentForm(true)}
              disabled={loading}
            >
              Enroll in Course
            </button>
            <button
              className="btn btn-warning"
              onClick={() => setShowActivationForm(true)}
              disabled={loading}
            >
              Activate/Deactivate
            </button>
            <button
              className="btn btn-info"
              onClick={() => handleViewEnrollments()}
              disabled={loading || selectedStudents.size !== 1}
            >
              View Enrollments
            </button>
            <button
              className="btn btn-danger"
              onClick={() => setShowDeleteConfirm(true)}
              disabled={loading}
            >
              Delete
            </button>
          </div>
        </div>
      )}

      {/* Create Form */}
      {showCreateForm && (
        <div className="student-form-container">
          <h3>Create New Student</h3>
          <form onSubmit={handleCreateStudent}>
            <div className="form-group">
              <label htmlFor="userId">Email Address *</label>
              <input
                type="email"
                id="userId"
                value={formData.userId}
                onChange={(e) => setFormData({ ...formData, userId: e.target.value })}
                required
                disabled={loading}
                placeholder="Enter student email address"
              />
            </div>

            <div className="form-group">
              <label htmlFor="name">Name *</label>
              <input
                type="text"
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
                disabled={loading}
                placeholder="Enter student name"
              />
            </div>

            <div className="form-group">
              <label htmlFor="password">Password *</label>
              <input
                type="password"
                id="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                required
                disabled={loading}
                minLength={8}
                placeholder="Minimum 8 characters"
              />
            </div>

            <div className="form-group">
              <label htmlFor="confirmPassword">Confirm Password *</label>
              <input
                type="password"
                id="confirmPassword"
                value={formData.confirmPassword}
                onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                required
                disabled={loading}
                minLength={8}
                placeholder="Re-enter password"
              />
            </div>

            <div className="form-group">
              <label>
                <input
                  type="checkbox"
                  checked={formData.isActive}
                  onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                  disabled={loading}
                />
                {' '}Activate account immediately
              </label>
            </div>

            <div className="form-actions">
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? 'Creating...' : 'Create Student'}
              </button>
              <button type="button" className="btn btn-secondary" onClick={cancelCreate} disabled={loading}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Bulk Password Reset Form */}
      {showPasswordResetForm && (
        <div className="password-reset-container">
          <h3>Reset Password for {selectedStudents.size} Selected Student(s)</h3>
          <form onSubmit={handleBulkPasswordReset}>
            <div className="form-group">
              <label htmlFor="newPassword">New Password *</label>
              <input
                type="password"
                id="newPassword"
                value={passwordResetData.newPassword}
                onChange={(e) => setPasswordResetData({ ...passwordResetData, newPassword: e.target.value })}
                required
                disabled={loading}
                minLength={8}
                placeholder="Minimum 8 characters"
              />
            </div>

            <div className="form-group">
              <label htmlFor="confirmNewPassword">Confirm New Password *</label>
              <input
                type="password"
                id="confirmNewPassword"
                value={passwordResetData.confirmNewPassword}
                onChange={(e) => setPasswordResetData({ ...passwordResetData, confirmNewPassword: e.target.value })}
                required
                disabled={loading}
                minLength={8}
                placeholder="Re-enter new password"
              />
            </div>

            <div className="form-actions">
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? 'Resetting...' : 'Reset Password'}
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setShowPasswordResetForm(false)} disabled={loading}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Bulk Enrollment Form */}
      {showEnrollmentForm && (
        <div className="enrollment-container">
          <h3>Enroll {selectedStudents.size} Selected Student(s) in Course</h3>
          <form onSubmit={handleBulkEnrollment}>
            <div className="form-group">
              <label htmlFor="courseCode">Course *</label>
              <select
                id="courseCode"
                value={enrollmentData.courseCode}
                onChange={(e) => setEnrollmentData({ ...enrollmentData, courseCode: e.target.value })}
                required
                disabled={loading}
              >
                <option value="">Select a course</option>
                {courses.map((course) => (
                  <option key={course.code} value={course.code}>
                    {course.code} - {course.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="courseSection">Course Section *</label>
              <input
                type="text"
                id="courseSection"
                value={enrollmentData.courseSection}
                onChange={(e) => setEnrollmentData({ ...enrollmentData, courseSection: e.target.value })}
                required
                disabled={loading}
                placeholder="e.g., Section A, Morning Class, 2024-Spring"
              />
              <small style={{ color: '#666' }}>Identifies which section/class the students belong to</small>
            </div>

            <div className="form-group">
              <label htmlFor="startDate">Course Start Date *</label>
              <input
                type="date"
                id="startDate"
                value={enrollmentData.startDate}
                onChange={(e) => {
                  const newStartDate = e.target.value;
                  // Calculate default access end date (1 month after start date)
                  const startDateObj = new Date(newStartDate);
                  startDateObj.setMonth(startDateObj.getMonth() + 1);
                  const defaultEndDate = startDateObj.toISOString().split('T')[0];
                  
                  setEnrollmentData({ 
                    ...enrollmentData, 
                    startDate: newStartDate,
                    // Auto-fill access start date with course start date if not set
                    accessStartDate: enrollmentData.accessStartDate || newStartDate,
                    // Auto-fill access end date with 1 month after start date if not set
                    accessEndDate: enrollmentData.accessEndDate || defaultEndDate
                  });
                }}
                required
                disabled={loading}
              />
            </div>

            <div className="form-group">
              <label htmlFor="accessStartDate">Access Start Date (Optional)</label>
              <input
                type="date"
                id="accessStartDate"
                value={enrollmentData.accessStartDate}
                onChange={(e) => setEnrollmentData({ ...enrollmentData, accessStartDate: e.target.value })}
                disabled={loading}
              />
              <small style={{ color: '#666' }}>If not specified, access starts on course start date</small>
            </div>

            <div className="form-group">
              <label htmlFor="accessEndDate">Access End Date (Optional)</label>
              <input
                type="date"
                id="accessEndDate"
                value={enrollmentData.accessEndDate}
                onChange={(e) => setEnrollmentData({ ...enrollmentData, accessEndDate: e.target.value })}
                disabled={loading}
              />
              <small style={{ color: '#666' }}>If not specified, defaults to 1 month after course start date</small>
            </div>

            <div className="form-actions">
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? 'Enrolling...' : 'Enroll Students'}
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setShowEnrollmentForm(false)} disabled={loading}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Bulk Activation Form */}
      {showActivationForm && (
        <div className="activation-container">
          <h3>Update Status for {selectedStudents.size} Selected Student(s)</h3>
          <form onSubmit={handleBulkActivation}>
            <div className="form-group">
              <label>Action *</label>
              <div>
                <label>
                  <input
                    type="radio"
                    name="activationAction"
                    value="activate"
                    checked={activationAction === 'activate'}
                    onChange={(e) => setActivationAction(e.target.value as 'activate')}
                    disabled={loading}
                  />
                  {' '}Activate Students
                </label>
              </div>
              <div>
                <label>
                  <input
                    type="radio"
                    name="activationAction"
                    value="deactivate"
                    checked={activationAction === 'deactivate'}
                    onChange={(e) => setActivationAction(e.target.value as 'deactivate')}
                    disabled={loading}
                  />
                  {' '}Deactivate Students
                </label>
              </div>
            </div>

            <div className="form-actions">
              <button type="submit" className="btn btn-warning" disabled={loading}>
                {loading ? 'Updating...' : `${activationAction === 'activate' ? 'Activate' : 'Deactivate'} Students`}
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setShowActivationForm(false)} disabled={loading}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Search and Filter */}
      <div className="search-filter-container">
        <div className="search-group">
          <input
            type="text"
            placeholder="Search by name or email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
        </div>
        <div className="filter-group">
          <select
            value={filterActive}
            onChange={(e) => setFilterActive(e.target.value as 'all' | 'active' | 'inactive')}
            className="filter-select"
          >
            <option value="all">All Students</option>
            <option value="active">Active Only</option>
            <option value="inactive">Inactive Only</option>
          </select>
        </div>
      </div>

      {/* Students List */}
      <div className="students-list">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <h3>Students ({filteredStudents.length})</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ display: 'flex', border: '1px solid #dee2e6', borderRadius: '6px', overflow: 'hidden' }}>
              <button onClick={() => setViewMode('cards')} style={{ padding: '0.3rem 0.6rem', border: 'none', background: viewMode === 'cards' ? '#0d6efd' : '#fff', color: viewMode === 'cards' ? '#fff' : '#333', cursor: 'pointer', fontSize: '0.8rem' }}>🃏 Cards</button>
              <button onClick={() => setViewMode('table')} style={{ padding: '0.3rem 0.6rem', border: 'none', borderLeft: '1px solid #dee2e6', background: viewMode === 'table' ? '#0d6efd' : '#fff', color: viewMode === 'table' ? '#fff' : '#333', cursor: 'pointer', fontSize: '0.8rem' }}>📋 Table</button>
            </div>
            {filteredStudents.length > 0 && (
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                <input type="checkbox"
                  checked={selectedStudents.size === filteredStudents.length && filteredStudents.length > 0}
                  onChange={(e) => handleSelectAll(e.target.checked)}
                  style={{ transform: 'scale(1.2)' }} />
                <span style={{ fontSize: '0.9rem', color: '#666' }}>Select All</span>
              </label>
            )}
          </div>
        </div>
        
        {loading && <div className="loading">Loading students...</div>}
        
        {!loading && filteredStudents.length === 0 && (
          <div className="no-students">
            {searchTerm || filterActive !== 'all' 
              ? 'No students match your search criteria.' 
              : 'No students found. Create your first student above.'}
          </div>
        )}
        
        {!loading && filteredStudents.length > 0 && viewMode === 'cards' && (
          <div className="students-grid">
            {filteredStudents.map((student) => (
              <div key={student.userId} className="student-card">
                <div className="student-card-header">
                  <input type="checkbox" checked={selectedStudents.has(student.userId)}
                    onChange={(e) => handleSelectStudent(student.userId, e.target.checked)}
                    style={{ transform: 'scale(1.3)', cursor: 'pointer' }} />
                  <span className={`status-badge ${student.isActive ? 'active' : 'inactive'}`}>
                    {student.isActive ? '✓ Active' : '○ Inactive'}
                  </span>
                </div>
                <div className="student-card-content">
                  <h4 className="student-name">{student.name}</h4>
                  <p className="student-email">{student.email}</p>
                  {student.phone && <p style={{ margin: '0.25rem 0', fontSize: '0.85rem', color: '#495057' }}>📞 {student.phone}</p>}
                  <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap', marginTop: '0.4rem' }}>
                    {(student.enrollments || []).map((e, i) => (
                      <span key={i} style={{
                        display: 'inline-block', padding: '1px 6px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 600,
                        background: e.enrollmentType === 'trial' ? '#ffc107' : '#198754',
                        color: e.enrollmentType === 'trial' ? '#000' : '#fff',
                      }}>{e.courseCode}{e.enrollmentType === 'trial' ? ' (trial)' : ''}</span>
                    ))}
                  </div>
                </div>
                <div className="student-card-actions">
                  <button onClick={() => handleViewEnrollments(student)} className="btn-view-enrollments" disabled={loading}>
                    View Enrollments
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && filteredStudents.length > 0 && viewMode === 'table' && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #dee2e6', textAlign: 'left' }}>
                  <th style={{ padding: '0.5rem', width: '40px' }}></th>
                  <th style={{ padding: '0.5rem' }}>Name</th>
                  <th style={{ padding: '0.5rem' }}>Email</th>
                  <th style={{ padding: '0.5rem' }}>Phone</th>
                  <th style={{ padding: '0.5rem' }}>Courses</th>
                  <th style={{ padding: '0.5rem' }}>Status</th>
                  <th style={{ padding: '0.5rem' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredStudents.map((student) => (
                  <tr key={student.userId} style={{ borderBottom: '1px solid #eee', background: selectedStudents.has(student.userId) ? '#e8f4fd' : 'transparent' }}>
                    <td style={{ padding: '0.5rem' }}>
                      <input type="checkbox" checked={selectedStudents.has(student.userId)}
                        onChange={(e) => handleSelectStudent(student.userId, e.target.checked)}
                        style={{ transform: 'scale(1.2)', cursor: 'pointer' }} />
                    </td>
                    <td style={{ padding: '0.5rem', fontWeight: 500 }}>{student.name}</td>
                    <td style={{ padding: '0.5rem', fontSize: '0.85rem', color: '#495057' }}>{student.email}</td>
                    <td style={{ padding: '0.5rem', fontSize: '0.85rem', whiteSpace: 'nowrap' }}>{student.phone || '—'}</td>
                    <td style={{ padding: '0.5rem' }}>
                      <div style={{ display: 'flex', gap: '0.2rem', flexWrap: 'wrap' }}>
                        {(student.enrollments || []).map((e, i) => (
                          <span key={i} style={{
                            padding: '1px 5px', borderRadius: '3px', fontSize: '0.7rem', fontWeight: 600,
                            background: e.enrollmentType === 'trial' ? '#ffc107' : '#198754',
                            color: e.enrollmentType === 'trial' ? '#000' : '#fff',
                          }}>{e.courseCode}{e.enrollmentType === 'trial' ? ' trial' : ''}</span>
                        ))}
                        {(!student.enrollments || student.enrollments.length === 0) && <span style={{ color: '#999' }}>—</span>}
                      </div>
                    </td>
                    <td style={{ padding: '0.5rem' }}>
                      <span className={`status-badge ${student.isActive ? 'active' : 'inactive'}`} style={{ fontSize: '0.75rem' }}>
                        {student.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td style={{ padding: '0.5rem' }}>
                      <button onClick={() => handleViewEnrollments(student)}
                        style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem', border: '1px solid #0d6efd', borderRadius: '4px', background: '#fff', color: '#0d6efd', cursor: 'pointer' }}
                        disabled={loading}>Enrollments</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="modal-overlay" onClick={() => setShowDeleteConfirm(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Confirm Delete</h3>
              <button 
                className="modal-close" 
                onClick={() => setShowDeleteConfirm(false)}
                disabled={loading}
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              <p style={{ marginBottom: '1rem' }}>
                Are you sure you want to delete {selectedStudents.size} student(s)?
              </p>
              <p style={{ color: '#dc3545', fontWeight: 'bold' }}>
                This action cannot be undone. All student data will be permanently removed.
              </p>
              <div style={{ marginTop: '1.5rem' }}>
                <strong>Students to be deleted:</strong>
                <ul style={{ marginTop: '0.5rem', maxHeight: '150px', overflowY: 'auto' }}>
                  {getSelectedStudents().map(student => (
                    <li key={student.userId}>{student.name} ({student.email})</li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="modal-footer" style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
              <button 
                className="btn btn-secondary" 
                onClick={() => setShowDeleteConfirm(false)}
                disabled={loading}
              >
                Cancel
              </button>
              <button 
                className="btn btn-danger" 
                onClick={handleDeleteStudents}
                disabled={loading}
              >
                {loading ? 'Deleting...' : 'Delete Students'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Student Enrollments Modal */}
      {showEnrollmentsModal && selectedStudentForEnrollments && (
        <div className="modal-overlay" onClick={() => setShowEnrollmentsModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Enrollments for {selectedStudentForEnrollments.name}</h3>
              <button 
                className="modal-close" 
                onClick={() => setShowEnrollmentsModal(false)}
                disabled={loading}
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              {studentEnrollments.length === 0 ? (
                <p>This student is not enrolled in any courses.</p>
              ) : (
                <div className="enrollments-table-container">
                  <table className="enrollments-table">
                    <thead>
                      <tr>
                        <th>Course Code</th>
                        <th>Start Date</th>
                        <th>Access Start</th>
                        <th>Access End</th>
                        <th>Enrolled At</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {studentEnrollments.map((enrollment) => (
                        <tr key={enrollment.id}>
                          <td>{enrollment.courseCode}</td>
                          <td>{new Date(enrollment.startDate).toLocaleDateString()}</td>
                          <td>{new Date(enrollment.accessStartDate).toLocaleDateString()}</td>
                          <td>{new Date(enrollment.accessEndDate).toLocaleDateString()}</td>
                          <td>{new Date(enrollment.enrolledAt).toLocaleDateString()}</td>
                          <td>
                            <button
                              className="btn btn-sm"
                              style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem', background: '#0d6efd', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                              onClick={() => {
                                const newEnd = prompt('New Access End Date (YYYY-MM-DD):', new Date(enrollment.accessEndDate).toISOString().split('T')[0]);
                                if (newEnd) {
                                  import('../services/assistantService').then(({ updateEnrollment }) => {
                                    updateEnrollment(enrollment.id, { accessEndDate: new Date(newEnd).toISOString() })
                                      .then(() => {
                                        alert('Enrollment updated successfully');
                                        // Refresh enrollments
                                        if (selectedStudents.size === 1) {
                                          const studentId = Array.from(selectedStudents)[0];
                                          import('../services/assistantService').then(({ getStudentEnrollments }) => {
                                            getStudentEnrollments(studentId).then(setStudentEnrollments);
                                          });
                                        }
                                      })
                                      .catch((err: any) => alert('Error: ' + err.message));
                                  });
                                }
                              }}
                            >
                              ✏️ Edit Access
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AssistantStudentManagement;
