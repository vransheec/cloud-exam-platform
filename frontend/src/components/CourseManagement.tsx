/**
 * Course Management Component
 * 
 * Allows operators to create, edit, and delete courses.
 * Features improved UI with single Edit/Delete buttons and course selection.
 */

import React, { useState, useEffect } from 'react';
import { getAllCourses, createCourse, updateCourse, deleteCourse } from '../services/operatorService';
import { uploadImage, getQuestionsByCourse } from '../services/assistantService';

interface Course {
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

interface CourseWithQuestionCount extends Course {
  loadedQuestions?: number;
}

const CourseManagement: React.FC = () => {
  const [courses, setCourses] = useState<CourseWithQuestionCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [editingCourse, setEditingCourse] = useState<CourseWithQuestionCount | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState<string | null>(null);
  const [uploadingBadge, setUploadingBadge] = useState(false);
  
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    provider: '',
    description: '',
    examQuestionCount: 50,
    passingPercentage: 70,
    badgeImageUrl: '',
  });

  useEffect(() => {
    loadCourses();
  }, []);

  const loadCourses = async () => {
    try {
      setLoading(true);
      const data = await getAllCourses();
      
      // Load question counts for each course
      const coursesWithCounts = await Promise.all(
        data.map(async (course: Course) => {
          try {
            const questions = await getQuestionsByCourse(course.code);
            return { ...course, loadedQuestions: questions.length };
          } catch {
            return { ...course, loadedQuestions: 0 };
          }
        })
      );
      
      setCourses(coursesWithCounts);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to load courses');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: name === 'examQuestionCount' || name === 'passingPercentage' ? parseInt(value) || 0 : value,
    }));
  };

  const handleBadgeUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Clear previous errors
    setError(null);
    setSuccess(null);

    // Validate file type - check both MIME type and extension
    const validMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    const validExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    const fileExtension = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));
    
    if (!validMimeTypes.includes(file.type.toLowerCase()) && !validExtensions.includes(fileExtension)) {
      setError(`Invalid file type. Please select a JPEG, PNG, GIF, or WebP image. (File type: ${file.type || 'unknown'})`);
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      setError('Image file size must be less than 5MB');
      return;
    }

    try {
      setUploadingBadge(true);
      const result = await uploadImage(file);
      setFormData((prev) => ({
        ...prev,
        badgeImageUrl: result.url,
      }));
      setSuccess('Badge image uploaded successfully!');
      // Clear the error in case there was a previous one
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to upload badge image');
      setSuccess(null);
    } finally {
      setUploadingBadge(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    try {
      if (editingCourse) {
        // Update existing course
        await updateCourse(editingCourse.code, {
          name: formData.name,
          provider: formData.provider,
          description: formData.description,
          examQuestionCount: formData.examQuestionCount,
          passingPercentage: formData.passingPercentage,
          badgeImageUrl: formData.badgeImageUrl || null,
        });
        setSuccess(`Course ${editingCourse.code} updated successfully!`);
      } else {
        // Create new course
        await createCourse({
          ...formData,
          badgeImageUrl: formData.badgeImageUrl || null,
        });
        setSuccess(`Course ${formData.code} created successfully!`);
      }
      
      // Reset form and reload courses
      setFormData({ code: '', name: '', provider: '', description: '', examQuestionCount: 50, passingPercentage: 70, badgeImageUrl: '' });
      setEditingCourse(null);
      setShowForm(false);
      setSelectedCourse(null);
      await loadCourses();
    } catch (err: any) {
      setError(err.message || 'Failed to save course');
    }
  };

  const handleEdit = () => {
    if (!selectedCourse) {
      setError('Please select a course to edit');
      return;
    }

    const course = courses.find(c => c.code === selectedCourse);
    if (!course) {
      setError('Selected course not found');
      return;
    }

    setEditingCourse(course);
    setFormData({
      code: course.code,
      name: course.name,
      provider: course.provider,
      description: course.description,
      examQuestionCount: course.examQuestionCount || 50,
      passingPercentage: course.passingPercentage || 70,
      badgeImageUrl: course.badgeImageUrl || '',
    });
    setShowForm(true);
    setError(null);
    setSuccess(null);
  };

  const handleDelete = async () => {
    if (!selectedCourse) {
      setError('Please select a course to delete');
      return;
    }

    if (!window.confirm(`Are you sure you want to delete course ${selectedCourse}? This action cannot be undone.`)) {
      return;
    }

    try {
      await deleteCourse(selectedCourse);
      setSuccess(`Course ${selectedCourse} deleted successfully!`);
      setSelectedCourse(null);
      await loadCourses();
    } catch (err: any) {
      setError(err.message || 'Failed to delete course');
    }
  };

  const handleCancel = () => {
    setFormData({ code: '', name: '', provider: '', description: '', examQuestionCount: 50, passingPercentage: 70, badgeImageUrl: '' });
    setEditingCourse(null);
    setShowForm(false);
    setSelectedCourse(null);
    setError(null);
    setSuccess(null);
  };

  const handleCourseSelect = (courseCode: string) => {
    setSelectedCourse(selectedCourse === courseCode ? null : courseCode);
    setError(null);
    setSuccess(null);
  };

  if (loading) {
    return <div className="loading">Loading courses...</div>;
  }

  return (
    <div className="course-management">
      <div className="management-header">
        <h2>Course Management</h2>
        <button
          onClick={() => setShowForm(true)}
          className="btn btn-primary"
          disabled={loading}
        >
          Create New Course
        </button>
      </div>
      
      {error && <div className="error-message">{error}</div>}
      {success && <div className="success-message">{success}</div>}

      {/* Create/Edit Form */}
      {showForm && (
        <div className="student-form-container">
          <h3>{editingCourse ? 'Edit Course' : 'Create New Course'}</h3>
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="code">Course Code *</label>
              <input
                type="text"
                id="code"
                name="code"
                value={formData.code}
                onChange={handleInputChange}
                required
                disabled={!!editingCourse || loading}
                placeholder="e.g., CLF, AZ900"
                style={{ textTransform: 'uppercase' }}
              />
              {editingCourse && (
                <small className="form-help">Course code cannot be changed</small>
              )}
            </div>

            <div className="form-group">
              <label htmlFor="name">Course Name *</label>
              <input
                type="text"
                id="name"
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                required
                disabled={loading}
                placeholder="e.g., AWS Certified Cloud Practitioner"
              />
            </div>

            <div className="form-group">
              <label htmlFor="provider">Provider *</label>
              <input
                type="text"
                id="provider"
                name="provider"
                value={formData.provider}
                onChange={handleInputChange}
                required
                disabled={loading}
                placeholder="e.g., AWS, Azure, GCP"
              />
            </div>

            <div className="form-group">
              <label htmlFor="description">Description *</label>
              <textarea
                id="description"
                name="description"
                value={formData.description}
                onChange={handleInputChange}
                required
                disabled={loading}
                placeholder="Brief description of the course"
                rows={3}
              />
            </div>

            <div className="form-group">
              <label htmlFor="examQuestionCount">Number of Questions per Exam *</label>
              <input
                type="number"
                id="examQuestionCount"
                name="examQuestionCount"
                value={formData.examQuestionCount}
                onChange={handleInputChange}
                required
                disabled={loading}
                min="1"
                max="200"
                placeholder="e.g., 50"
              />
              <small className="form-help">How many questions should each exam have?</small>
            </div>

            <div className="form-group">
              <label htmlFor="passingPercentage">Passing Percentage *</label>
              <input
                type="number"
                id="passingPercentage"
                name="passingPercentage"
                value={formData.passingPercentage}
                onChange={handleInputChange}
                required
                disabled={loading}
                min="1"
                max="100"
                placeholder="e.g., 70"
              />
              <small className="form-help">Minimum percentage of correct answers required to pass</small>
            </div>

            <div className="form-group">
              <label htmlFor="badgeImage">Course Badge (Optional)</label>
              
              {/* Show current badge if editing and badge exists */}
              {editingCourse && editingCourse.badgeImageUrl && (
                <div className="current-badge-info">
                  <p className="form-help" style={{ marginBottom: '0.5rem', fontWeight: '600', color: '#2c3e50' }}>
                    Current Badge Image:
                  </p>
                  <div className="badge-preview" style={{ marginBottom: '1rem' }}>
                    <img 
                      src={editingCourse.badgeImageUrl} 
                      alt="Current course badge" 
                      style={{ maxWidth: '200px', borderRadius: '8px', border: '2px solid #3b82f6', cursor: 'pointer' }}
                      onClick={() => window.open(editingCourse.badgeImageUrl!, '_blank')}
                      title="Click to view full size in new tab"
                    />
                    <div style={{ marginTop: '0.5rem' }}>
                      <a 
                        href={editingCourse.badgeImageUrl} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="btn btn-small btn-secondary"
                        style={{ marginRight: '0.5rem' }}
                      >
                        View Full Size
                      </a>
                      <small className="form-help" style={{ display: 'block', marginTop: '0.5rem' }}>
                        URL: {editingCourse.badgeImageUrl.substring(0, 50)}...
                      </small>
                    </div>
                  </div>
                </div>
              )}
              
              <input
                type="file"
                id="badgeImage"
                accept="image/*"
                onChange={handleBadgeUpload}
                disabled={loading || uploadingBadge}
              />
              <small className="form-help">
                {editingCourse && editingCourse.badgeImageUrl 
                  ? 'Upload a new image to replace the current badge (max 5MB)' 
                  : 'Upload a badge image for this course (max 5MB)'}
              </small>
              {uploadingBadge && <p className="upload-status">Uploading badge...</p>}
              {formData.badgeImageUrl && formData.badgeImageUrl !== editingCourse?.badgeImageUrl && (
                <div className="badge-preview">
                  <p className="form-help" style={{ marginTop: '1rem', fontWeight: '600', color: '#28a745' }}>
                    New Badge Preview:
                  </p>
                  <img src={formData.badgeImageUrl} alt="New course badge" style={{ maxWidth: '150px', marginTop: '10px', borderRadius: '8px' }} />
                  <button
                    type="button"
                    onClick={() => setFormData(prev => ({ ...prev, badgeImageUrl: editingCourse?.badgeImageUrl || '' }))}
                    className="btn btn-small btn-secondary"
                    style={{ marginTop: '10px' }}
                  >
                    Cancel New Badge
                  </button>
                </div>
              )}
            </div>

            <div className="form-actions">
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? 'Saving...' : editingCourse ? 'Update Course' : 'Create Course'}
              </button>
              <button type="button" onClick={handleCancel} className="btn btn-secondary" disabled={loading}>
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
            placeholder="Search by course code or name..."
            value=""
            onChange={() => {}}
            className="search-input"
          />
        </div>

        <div className="filter-buttons">
          <button className="filter-btn active">
            All
          </button>
        </div>
      </div>

      {/* Course List */}
      <div className="student-list">
        <div className="list-header">
          <h3>All Courses ({courses.length})</h3>
          {courses.length > 0 && (
            <div className="action-buttons">
              <button
                onClick={handleEdit}
                disabled={!selectedCourse}
                className="btn btn-secondary btn-small"
              >
                Edit Selected
              </button>
              <button
                onClick={handleDelete}
                disabled={!selectedCourse}
                className="btn btn-danger btn-small"
              >
                Delete Selected
              </button>
            </div>
          )}
        </div>
        
        {courses.length === 0 ? (
          <div className="empty-state">
            <p>No courses found. Create your first course above.</p>
          </div>
        ) : (
          <div className="student-table">
            <table>
              <thead>
                <tr>
                  <th>Select</th>
                  <th>Code</th>
                  <th>Name</th>
                  <th>Provider</th>
                  <th>Description</th>
                  <th>Questions per Exam</th>
                  <th>Questions Loaded</th>
                  <th>Pass %</th>
                </tr>
              </thead>
              <tbody>
                {courses.map((course) => (
                  <tr 
                    key={course.code} 
                    className={selectedCourse === course.code ? 'selected' : ''}
                  >
                    <td>
                      <input
                        type="radio"
                        name="selectedCourse"
                        checked={selectedCourse === course.code}
                        onChange={() => handleCourseSelect(course.code)}
                      />
                    </td>
                    <td><strong>{course.code}</strong></td>
                    <td>{course.name}</td>
                    <td>
                      <span className={`provider-badge provider-${course.provider.toLowerCase()}`}>
                        {course.provider}
                      </span>
                    </td>
                    <td>{course.description}</td>
                    <td className="text-center">{course.examQuestionCount || 50}</td>
                    <td className="text-center">
                      <span style={{ 
                        color: (course.loadedQuestions || 0) >= (course.examQuestionCount || 50) ? '#28a745' : '#dc3545',
                        fontWeight: 'bold'
                      }}>
                        {course.loadedQuestions || 0}
                      </span>
                    </td>
                    <td className="text-center">{course.passingPercentage || 70}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default CourseManagement;
