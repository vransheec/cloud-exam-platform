/**
 * Student Management Component
 * 
 * Interface for operators to create, edit, and manage student accounts.
 * Includes search/filter functionality and activation controls.
 */

import React, { useState, useEffect } from 'react';
import {
  createStudent,
  updateStudent,
  setStudentActivation,
  getAllStudents,
  resetStudentPassword,
  deleteStudent,
  bulkCreateStudents,
  BulkStudentData,
  BulkImportResult,
} from '../services/operatorService';
import { Student, CreateStudentRequest, UpdateStudentRequest } from '../types/student';

interface StudentManagementProps {
  onStudentSelect?: (studentId: string) => void;
}

const StudentManagement: React.FC<StudentManagementProps> = ({ onStudentSelect }) => {
  const [students, setStudents] = useState<Student[]>([]);
  const [filteredStudents, setFilteredStudents] = useState<Student[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'inactive'>('all');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [selectedStudent, setSelectedStudent] = useState<string | null>(null);
  const [resettingPasswordStudent, setResettingPasswordStudent] = useState<Student | null>(null);
  const [deletingStudent, setDeletingStudent] = useState<Student | null>(null);
  const [viewMode, setViewMode] = useState<'table' | 'list'>('table');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Bulk import state
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [bulkImportText, setBulkImportText] = useState('');
  const [parsedStudents, setParsedStudents] = useState<BulkStudentData[]>([]);
  const [bulkImportResults, setBulkImportResults] = useState<BulkImportResult[] | null>(null);
  const [bulkImportStep, setBulkImportStep] = useState<'paste' | 'preview' | 'results'>('paste');

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

  // Load all students on mount
  useEffect(() => {
    loadAllStudents();
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
      const newStudent = await createStudent(formData as CreateStudentRequest);
      setStudents([...students, newStudent]);
      setSuccessMessage('Student created successfully');
      setShowCreateForm(false);
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create student');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStudent) return;

    setLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const updates: UpdateStudentRequest = {
        name: formData.name,
      };
      const updatedStudent = await updateStudent(editingStudent.userId, updates);
      setStudents(
        students.map((s) => (s.userId === updatedStudent.userId ? updatedStudent : s))
      );
      setSuccessMessage('Student updated successfully');
      setEditingStudent(null);
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update student');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleActivation = async (student: Student) => {
    setLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const updatedStudent = await setStudentActivation(student.userId, !student.isActive);
      setStudents(
        students.map((s) => (s.userId === updatedStudent.userId ? updatedStudent : s))
      );
      setSuccessMessage(
        `Student ${updatedStudent.isActive ? 'activated' : 'deactivated'} successfully`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update activation status');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resettingPasswordStudent) return;

    setLoading(true);
    setError(null);
    setSuccessMessage(null);

    // Validate password confirmation
    if (passwordResetData.newPassword !== passwordResetData.confirmNewPassword) {
      setError('Passwords do not match');
      setLoading(false);
      return;
    }

    // Validate password length
    if (passwordResetData.newPassword.length < 8) {
      setError('Password must be at least 8 characters');
      setLoading(false);
      return;
    }

    try {
      await resetStudentPassword(resettingPasswordStudent.userId, passwordResetData.newPassword);
      setSuccessMessage('Password reset successfully');
      setResettingPasswordStudent(null);
      setPasswordResetData({ newPassword: '', confirmNewPassword: '' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset password');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectStudent = (studentId: string, checked: boolean) => {
    if (checked) {
      setSelectedStudent(studentId);
    } else {
      setSelectedStudent(null);
    }
  };

  const handleEdit = () => {
    if (!selectedStudent) {
      setError('Please select a student to edit');
      return;
    }

    const student = students.find(s => s.userId === selectedStudent);
    if (!student) {
      setError('Selected student not found');
      return;
    }

    startEdit(student);
    setError(null);
    setSuccessMessage(null);
  };

  const handleResetPasswordAction = () => {
    if (!selectedStudent) {
      setError('Please select a student to reset password');
      return;
    }

    const student = students.find(s => s.userId === selectedStudent);
    if (!student) {
      setError('Selected student not found');
      return;
    }

    startPasswordReset(student);
    setError(null);
    setSuccessMessage(null);
  };

  const handleManageEnrollments = () => {
    if (!selectedStudent) {
      setError('Please select a student to manage enrollments');
      return;
    }

    if (onStudentSelect) {
      onStudentSelect(selectedStudent);
    }
    setError(null);
    setSuccessMessage(null);
  };

  const handleDeactivate = async () => {
    if (!selectedStudent) {
      setError('Please select a student to activate/deactivate');
      return;
    }

    const student = students.find(s => s.userId === selectedStudent);
    if (!student) {
      setError('Selected student not found');
      return;
    }

    await handleToggleActivation(student);
  };

  const startPasswordReset = (student: Student) => {
    setResettingPasswordStudent(student);
    setPasswordResetData({ newPassword: '', confirmNewPassword: '' });
    setError(null);
    setSuccessMessage(null);
  };

  const cancelPasswordReset = () => {
    setResettingPasswordStudent(null);
    setPasswordResetData({ newPassword: '', confirmNewPassword: '' });
  };

  const handleDeleteStudent = async () => {
    if (!deletingStudent) return;

    setLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      await deleteStudent(deletingStudent.userId);
      setStudents(students.filter(s => s.userId !== deletingStudent.userId));
      setSuccessMessage('Student deleted successfully');
      setDeletingStudent(null);
      setSelectedStudent(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete student');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAction = () => {
    if (!selectedStudent) {
      setError('Please select a student to delete');
      return;
    }

    const student = students.find(s => s.userId === selectedStudent);
    if (!student) {
      setError('Selected student not found');
      return;
    }

    setDeletingStudent(student);
    setError(null);
    setSuccessMessage(null);
  };

  const startEdit = (student: Student) => {
    setEditingStudent(student);
    setFormData({
      userId: student.userId,
      name: student.name,
      password: '',
      confirmPassword: '',
      isActive: student.isActive,
    });
    setShowCreateForm(false);
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

  const cancelEdit = () => {
    setEditingStudent(null);
    setShowCreateForm(false);
    resetForm();
  };

  // Bulk import functions
  const parseBulkImportText = (text: string): BulkStudentData[] => {
    const lines = text.trim().split('\n');
    const students: BulkStudentData[] = [];
    
    for (const line of lines) {
      if (!line.trim()) continue;
      
      // Split by tab (Excel default) or multiple spaces
      const parts = line.split(/\t+|\s{2,}/);
      
      if (parts.length >= 3) {
        students.push({
          name: parts[0].trim(),
          email: parts[1].trim(),
          password: parts[2].trim(),
        });
      } else if (parts.length === 2) {
        // If only 2 columns, assume name and email, generate password
        students.push({
          name: parts[0].trim(),
          email: parts[1].trim(),
          password: 'Temp1234!', // Default password
        });
      }
    }
    
    return students;
  };

  const handleBulkImportTextChange = (text: string) => {
    setBulkImportText(text);
    const parsed = parseBulkImportText(text);
    setParsedStudents(parsed);
  };

  const handleBulkImportPreview = () => {
    if (parsedStudents.length === 0) {
      setError('No valid student data found. Please paste data with Name, Email, and Password columns.');
      return;
    }
    setError(null);
    setBulkImportStep('preview');
  };

  const handleBulkImportSubmit = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await bulkCreateStudents(parsedStudents);
      setBulkImportResults(response.results);
      setBulkImportStep('results');
      
      // Reload students list
      await loadAllStudents();
      
      if (response.summary.successful > 0) {
        setSuccessMessage(`Successfully created ${response.summary.successful} of ${response.summary.total} students`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import students');
    } finally {
      setLoading(false);
    }
  };

  const closeBulkImport = () => {
    setShowBulkImport(false);
    setBulkImportText('');
    setParsedStudents([]);
    setBulkImportResults(null);
    setBulkImportStep('paste');
  };

  return (
    <div className="student-management">
      <div className="management-header">
        <h2>Student Management</h2>
        <div className="header-actions">
          <button
            className="btn btn-primary"
            onClick={() => {
              setShowCreateForm(true);
              setEditingStudent(null);
              resetForm();
            }}
            disabled={loading}
          >
            Create New Student
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => {
              setShowBulkImport(true);
              setBulkImportStep('paste');
            }}
            disabled={loading}
          >
            Bulk Import
          </button>
        </div>
      </div>

      {error && <div className="error-message">{error}</div>}
      {successMessage && <div className="success-message">{successMessage}</div>}

      {/* Create/Edit Form */}
      {(showCreateForm || editingStudent) && (
        <div className="student-form-container">
          <h3>{editingStudent ? 'Edit Student' : 'Create New Student'}</h3>
          <form onSubmit={editingStudent ? handleUpdateStudent : handleCreateStudent}>
            {!editingStudent && (
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
            )}

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

            {!editingStudent && (
              <>
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
              </>
            )}

            {!editingStudent && (
              <div className="form-group checkbox-group">
                <label>
                  <input
                    type="checkbox"
                    checked={formData.isActive}
                    onChange={(e) =>
                      setFormData({ ...formData, isActive: e.target.checked })
                    }
                    disabled={loading}
                  />
                  <span>Activate account immediately</span>
                </label>
              </div>
            )}

            <div className="form-actions">
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? 'Saving...' : editingStudent ? 'Update Student' : 'Create Student'}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={cancelEdit}
                disabled={loading}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Search and Filter */}
      <div className="search-filter-container">
        <div className="search-box">
          <input
            type="text"
            placeholder="Search by name or email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
        </div>

        <div className="filter-buttons">
          <button
            className={`filter-btn ${filterActive === 'all' ? 'active' : ''}`}
            onClick={() => setFilterActive('all')}
          >
            All
          </button>
          <button
            className={`filter-btn ${filterActive === 'active' ? 'active' : ''}`}
            onClick={() => setFilterActive('active')}
          >
            Active
          </button>
          <button
            className={`filter-btn ${filterActive === 'inactive' ? 'active' : ''}`}
            onClick={() => setFilterActive('inactive')}
          >
            Inactive
          </button>
        </div>
      </div>

      {/* Student List */}
      <div className="student-list">
        <div className="list-header">
          <h3>All Students ({filteredStudents.length})</h3>
          {filteredStudents.length > 0 && (
            <div className="action-buttons">
              <button
                onClick={handleEdit}
                disabled={!selectedStudent}
                className="btn btn-secondary btn-small"
              >
                Edit Selected
              </button>
              <button
                onClick={handleResetPasswordAction}
                disabled={!selectedStudent}
                className="btn btn-primary btn-small"
              >
                Reset Password
              </button>
              {onStudentSelect && (
                <button
                  onClick={handleManageEnrollments}
                  disabled={!selectedStudent}
                  className="btn btn-info btn-small"
                >
                  Manage Enrollments
                </button>
              )}
              <button
                onClick={handleDeactivate}
                disabled={!selectedStudent}
                className="btn btn-warning btn-small"
              >
                Activate/Deactivate
              </button>
              <button
                onClick={handleDeleteAction}
                disabled={!selectedStudent}
                className="btn btn-danger btn-small"
              >
                Delete
              </button>
            </div>
          )}
        </div>
        
        {filteredStudents.length === 0 ? (
          <div className="empty-state">
            <p>No students found. {searchTerm && 'Try adjusting your search.'}</p>
          </div>
        ) : (
          <div className="student-table">
            <table>
              <thead>
                <tr>
                  <th>Select</th>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredStudents.map((student) => (
                  <tr 
                    key={student.userId}
                    className={selectedStudent === student.userId ? 'selected' : ''}
                  >
                    <td>
                      <input
                        type="radio"
                        name="selectedStudent"
                        checked={selectedStudent === student.userId}
                        onChange={(e) => handleSelectStudent(student.userId, e.target.checked)}
                      />
                    </td>
                    <td>{student.name}</td>
                    <td className="user-id">{student.email}</td>
                    <td>
                      <span className={`status-badge ${student.isActive ? 'active' : 'inactive'}`}>
                        {student.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Student List */}
      <div className="student-list">
        <div className="list-header">
          <h3>All Students ({filteredStudents.length})</h3>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', border: '1px solid #dee2e6', borderRadius: '6px', overflow: 'hidden', marginRight: '0.5rem' }}>
              <button onClick={() => setViewMode('table')} style={{ padding: '0.3rem 0.6rem', border: 'none', background: viewMode === 'table' ? '#0d6efd' : '#fff', color: viewMode === 'table' ? '#fff' : '#333', cursor: 'pointer', fontSize: '0.8rem' }}>📋 Table</button>
              <button onClick={() => setViewMode('list')} style={{ padding: '0.3rem 0.6rem', border: 'none', borderLeft: '1px solid #dee2e6', background: viewMode === 'list' ? '#0d6efd' : '#fff', color: viewMode === 'list' ? '#fff' : '#333', cursor: 'pointer', fontSize: '0.8rem' }}>📄 List</button>
            </div>
            {filteredStudents.length > 0 && (
              <div className="action-buttons">
                <button onClick={handleEdit} disabled={!selectedStudent} className="btn btn-secondary btn-small">Edit</button>
                <button onClick={handleResetPasswordAction} disabled={!selectedStudent} className="btn btn-primary btn-small">Reset Password</button>
                {onStudentSelect && <button onClick={handleManageEnrollments} disabled={!selectedStudent} className="btn btn-info btn-small">Enrollments</button>}
                <button onClick={handleDeactivate} disabled={!selectedStudent} className="btn btn-warning btn-small">Activate/Deactivate</button>
                <button onClick={handleDeleteAction} disabled={!selectedStudent} className="btn btn-danger btn-small">Delete</button>
              </div>
            )}
          </div>
        </div>
        
        {filteredStudents.length === 0 ? (
          <div className="empty-state">
            <p>No students found. {searchTerm && 'Try adjusting your search.'}</p>
          </div>
        ) : viewMode === 'table' ? (
          <div className="student-table" style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th style={{ width: '40px' }}></th>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>Courses</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredStudents.map((student) => (
                  <tr key={student.userId} className={selectedStudent === student.userId ? 'selected' : ''}>
                    <td>
                      <input type="radio" name="selectedStudent" checked={selectedStudent === student.userId}
                        onChange={(e) => handleSelectStudent(student.userId, e.target.checked)} />
                    </td>
                    <td>{student.name}</td>
                    <td className="user-id" style={{ fontSize: '0.85rem' }}>{student.email}</td>
                    <td style={{ fontSize: '0.85rem', whiteSpace: 'nowrap' }}>{student.phone || '—'}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                        {(student.enrollments || []).map((e, i) => (
                          <span key={i} style={{
                            display: 'inline-block', padding: '1px 6px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 600,
                            background: e.enrollmentType === 'trial' ? '#ffc107' : '#198754',
                            color: e.enrollmentType === 'trial' ? '#000' : '#fff',
                          }}>
                            {e.courseCode} {e.enrollmentType === 'trial' ? '(trial)' : ''}
                          </span>
                        ))}
                        {(!student.enrollments || student.enrollments.length === 0) && <span style={{ color: '#999', fontSize: '0.8rem' }}>—</span>}
                      </div>
                    </td>
                    <td>
                      <span className={`status-badge ${student.isActive ? 'active' : 'inactive'}`}>
                        {student.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {filteredStudents.map((student) => (
              <div key={student.userId}
                onClick={() => handleSelectStudent(student.userId, selectedStudent !== student.userId)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.75rem',
                  padding: '0.75rem 1rem', borderRadius: '8px', cursor: 'pointer',
                  border: selectedStudent === student.userId ? '2px solid #0d6efd' : '1px solid #dee2e6',
                  background: selectedStudent === student.userId ? '#e8f4fd' : '#fff',
                }}>
                <input type="radio" name="selectedStudent" checked={selectedStudent === student.userId} readOnly />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }}>{student.name}</div>
                  <div style={{ fontSize: '0.85rem', color: '#6c757d' }}>{student.email}</div>
                  {student.phone && <div style={{ fontSize: '0.8rem', color: '#6c757d' }}>📞 {student.phone}</div>}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.25rem' }}>
                  <span className={`status-badge ${student.isActive ? 'active' : 'inactive'}`} style={{ fontSize: '0.7rem' }}>
                    {student.isActive ? 'Active' : 'Inactive'}
                  </span>
                  <div style={{ display: 'flex', gap: '0.2rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    {(student.enrollments || []).map((e, i) => (
                      <span key={i} style={{
                        padding: '1px 5px', borderRadius: '3px', fontSize: '0.65rem', fontWeight: 600,
                        background: e.enrollmentType === 'trial' ? '#ffc107' : '#198754',
                        color: e.enrollmentType === 'trial' ? '#000' : '#fff',
                      }}>
                        {e.courseCode}{e.enrollmentType === 'trial' ? ' trial' : ''}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Password Reset Modal */}
      {resettingPasswordStudent && (
        <div className="modal-overlay">
          <div className="modal-dialog">
            <div className="modal-header">
              <h3>Reset Password for {resettingPasswordStudent.name}</h3>
            </div>
            <form onSubmit={handleResetPassword}>
              <div className="modal-body">
                <div className="form-group">
                  <label htmlFor="newPassword">New Password *</label>
                  <input
                    type="password"
                    id="newPassword"
                    value={passwordResetData.newPassword}
                    onChange={(e) =>
                      setPasswordResetData({ ...passwordResetData, newPassword: e.target.value })
                    }
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
                    onChange={(e) =>
                      setPasswordResetData({
                        ...passwordResetData,
                        confirmNewPassword: e.target.value,
                      })
                    }
                    required
                    disabled={loading}
                    minLength={8}
                    placeholder="Re-enter new password"
                  />
                </div>
              </div>

              <div className="modal-actions">
                <button type="submit" className="btn btn-primary" disabled={loading}>
                  {loading ? 'Resetting...' : 'Reset Password'}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={cancelPasswordReset}
                  disabled={loading}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingStudent && (
        <div className="modal-overlay">
          <div className="modal-dialog">
            <div className="modal-header">
              <h3>Confirm Delete</h3>
            </div>
            <div className="modal-body">
              <p style={{ marginBottom: '1rem' }}>
                Are you sure you want to delete the student <strong>{deletingStudent.name}</strong>?
              </p>
              <p style={{ color: '#dc3545', fontWeight: 'bold' }}>
                This action cannot be undone. All student data will be permanently removed.
              </p>
            </div>
            <div className="modal-actions">
              <button
                className="btn btn-danger"
                onClick={handleDeleteStudent}
                disabled={loading}
              >
                {loading ? 'Deleting...' : 'Delete Student'}
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => setDeletingStudent(null)}
                disabled={loading}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Import Modal */}
      {showBulkImport && (
        <div className="modal-overlay">
          <div className="modal-dialog" style={{ maxWidth: '700px', width: '90%' }}>
            <div className="modal-header">
              <h3>
                {bulkImportStep === 'paste' && 'Bulk Import Students'}
                {bulkImportStep === 'preview' && 'Preview Import'}
                {bulkImportStep === 'results' && 'Import Results'}
              </h3>
            </div>
            <div className="modal-body">
              {bulkImportStep === 'paste' && (
                <>
                  <p style={{ marginBottom: '1rem' }}>
                    Paste data from Excel with columns: <strong>Name, Email, Password</strong> (tab-separated)
                  </p>
                  <p style={{ marginBottom: '1rem', fontSize: '0.9rem', color: '#666' }}>
                    If you only paste Name and Email, a default password "Temp1234!" will be used.
                  </p>
                  <textarea
                    value={bulkImportText}
                    onChange={(e) => handleBulkImportTextChange(e.target.value)}
                    placeholder="John Doe&#9;john@example.com&#9;Password123!&#10;Jane Smith&#9;jane@example.com&#9;Password456!"
                    style={{
                      width: '100%',
                      minHeight: '200px',
                      padding: '0.75rem',
                      fontFamily: 'monospace',
                      fontSize: '0.9rem',
                      border: '1px solid #ddd',
                      borderRadius: '4px',
                      resize: 'vertical',
                    }}
                  />
                  {parsedStudents.length > 0 && (
                    <p style={{ marginTop: '0.5rem', color: '#28a745' }}>
                      {parsedStudents.length} student(s) detected
                    </p>
                  )}
                </>
              )}

              {bulkImportStep === 'preview' && (
                <>
                  <p style={{ marginBottom: '1rem' }}>
                    Review the students to be created ({parsedStudents.length} total):
                  </p>
                  <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ backgroundColor: '#f5f5f5' }}>
                          <th style={{ padding: '0.5rem', textAlign: 'left', borderBottom: '1px solid #ddd' }}>#</th>
                          <th style={{ padding: '0.5rem', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Name</th>
                          <th style={{ padding: '0.5rem', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Email</th>
                          <th style={{ padding: '0.5rem', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Password</th>
                        </tr>
                      </thead>
                      <tbody>
                        {parsedStudents.map((student, index) => (
                          <tr key={index}>
                            <td style={{ padding: '0.5rem', borderBottom: '1px solid #eee' }}>{index + 1}</td>
                            <td style={{ padding: '0.5rem', borderBottom: '1px solid #eee' }}>{student.name}</td>
                            <td style={{ padding: '0.5rem', borderBottom: '1px solid #eee' }}>{student.email}</td>
                            <td style={{ padding: '0.5rem', borderBottom: '1px solid #eee' }}>{'•'.repeat(8)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}

              {bulkImportStep === 'results' && bulkImportResults && (
                <>
                  <div style={{ marginBottom: '1rem' }}>
                    <span style={{ color: '#28a745', marginRight: '1rem' }}>
                      ✓ {bulkImportResults.filter(r => r.success).length} successful
                    </span>
                    <span style={{ color: '#dc3545' }}>
                      ✗ {bulkImportResults.filter(r => !r.success).length} failed
                    </span>
                  </div>
                  <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ backgroundColor: '#f5f5f5' }}>
                          <th style={{ padding: '0.5rem', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Status</th>
                          <th style={{ padding: '0.5rem', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Name</th>
                          <th style={{ padding: '0.5rem', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Email</th>
                          <th style={{ padding: '0.5rem', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Details</th>
                        </tr>
                      </thead>
                      <tbody>
                        {bulkImportResults.map((result, index) => (
                          <tr key={index} style={{ backgroundColor: result.success ? '#f8fff8' : '#fff8f8' }}>
                            <td style={{ padding: '0.5rem', borderBottom: '1px solid #eee' }}>
                              {result.success ? '✓' : '✗'}
                            </td>
                            <td style={{ padding: '0.5rem', borderBottom: '1px solid #eee' }}>{result.name}</td>
                            <td style={{ padding: '0.5rem', borderBottom: '1px solid #eee' }}>{result.email}</td>
                            <td style={{ padding: '0.5rem', borderBottom: '1px solid #eee', color: result.success ? '#28a745' : '#dc3545' }}>
                              {result.success ? 'Created' : result.error}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
            <div className="modal-actions">
              {bulkImportStep === 'paste' && (
                <>
                  <button
                    className="btn btn-primary"
                    onClick={handleBulkImportPreview}
                    disabled={parsedStudents.length === 0}
                  >
                    Preview
                  </button>
                  <button className="btn btn-secondary" onClick={closeBulkImport}>
                    Cancel
                  </button>
                </>
              )}
              {bulkImportStep === 'preview' && (
                <>
                  <button
                    className="btn btn-primary"
                    onClick={handleBulkImportSubmit}
                    disabled={loading}
                  >
                    {loading ? 'Importing...' : `Import ${parsedStudents.length} Students`}
                  </button>
                  <button
                    className="btn btn-secondary"
                    onClick={() => setBulkImportStep('paste')}
                    disabled={loading}
                  >
                    Back
                  </button>
                </>
              )}
              {bulkImportStep === 'results' && (
                <button className="btn btn-primary" onClick={closeBulkImport}>
                  Done
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StudentManagement;
