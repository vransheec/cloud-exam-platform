/**
 * Question Management Component
 * 
 * Allows assistants to create and manage exam questions with alternatives.
 * Supports image uploads for questions and alternatives.
 * 
 * Requirements:
 * - 2.1: Upload questions with alternatives
 * - 2.2: Validate course codes
 * - 2.3: Store questions with proper categorization
 */

import React, { useState, useEffect } from 'react';
import {
  getQuestionsByCourse,
  createQuestion,
  deleteQuestion,
  uploadImage,
  bulkImportQuestions,
  downloadCSVTemplate,
  exportQuestionsToCSV,
  getAllCourses,
  updateCourse,
  QuestionWithAlternatives,
  CreateQuestionRequest,
} from '../services/assistantService';
import QuestionEditor from './QuestionEditor';

// Supported course codes
// Fallback course list - will be replaced by dynamic loading from API
const COURSES_FALLBACK = [
  { code: 'CLF', name: 'AWS Certified Cloud Practitioner', provider: 'AWS' },
  { code: 'DVA', name: 'AWS Certified Developer Associate', provider: 'AWS' },
  { code: 'SAA', name: 'AWS Certified Solutions Architect Associate', provider: 'AWS' },
  { code: 'SAP', name: 'AWS Certified Solutions Architect Professional', provider: 'AWS' },
  { code: 'DEA', name: 'AWS Certified Data Engineer Associate', provider: 'AWS' },
  { code: 'SOA', name: 'AWS Certified SysOps Administrator Associate', provider: 'AWS' },
  { code: 'SCS', name: 'AWS Certified Security Specialty', provider: 'AWS' },
  { code: 'AZ900', name: 'Azure Fundamentals', provider: 'Azure' },
  { code: 'AZ104', name: 'Azure Administrator Associate', provider: 'Azure' },
  { code: 'AZ305', name: 'Azure Solutions Architect Expert', provider: 'Azure' },
  { code: 'GCDL', name: 'Google Cloud Digital Leader', provider: 'GCP' },
  { code: 'GACE', name: 'Google Cloud Engineer', provider: 'GCP' },
];

interface Alternative {
  text: string;
  imageUrl: string | null;
  isCorrect: boolean;
  order: number;
}

interface QuestionType {
  type: 'single' | 'multiple';
  label: string;
  description: string;
}

const QUESTION_TYPES: QuestionType[] = [
  {
    type: 'single',
    label: 'Single Correct Answer',
    description: 'Only one alternative is correct (most common)'
  },
  {
    type: 'multiple',
    label: 'Multiple Correct Answers',
    description: 'Two or more alternatives can be correct'
  }
];

const QuestionManagement: React.FC = () => {
  const [selectedCourse, setSelectedCourse] = useState<string>('CLF');
  const [courses, setCourses] = useState<Array<{ code: string; name: string; provider: string }>>(COURSES_FALLBACK);
  const [questions, setQuestions] = useState<QuestionWithAlternatives[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  // Selection state for bulk operations
  const [selectedQuestions, setSelectedQuestions] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  
  // Form state
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [questionType, setQuestionType] = useState<'single' | 'multiple'>('single');
  const [questionText, setQuestionText] = useState('');
  const [questionImageUrl, setQuestionImageUrl] = useState<string | null>(null);
  const [alternatives, setAlternatives] = useState<Alternative[]>([
    { text: '', imageUrl: null, isCorrect: true, order: 0 },
    { text: '', imageUrl: null, isCorrect: false, order: 1 },
  ]);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  
  // CSV Import state
  const [showImportForm, setShowImportForm] = useState(false);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    imported: number;
    failed: number;
    errors: Array<{ row: number; field?: string; message: string }>;
  } | null>(null);
  
  // Export state
  const [exporting, setExporting] = useState(false);

  // Review Mode state
  const [reviewModeEnabled, setReviewModeEnabled] = useState(false);
  const [togglingReviewMode, setTogglingReviewMode] = useState(false);

  // Load courses dynamically from API on mount
  useEffect(() => {
    const loadCourses = async () => {
      try {
        const apiCourses = await getAllCourses();
        if (apiCourses && apiCourses.length > 0) {
          setCourses(apiCourses.map((c: any) => ({ code: c.code, name: c.name, provider: c.provider })));
        }
      } catch (err) {
        console.error('Failed to load courses from API, using fallback list');
      }
    };
    loadCourses();
  }, []);

  // Load questions when course changes
  useEffect(() => {
    loadQuestions();
    loadCourseReviewMode();
    setSelectedQuestions(new Set()); // Clear selection when course changes
  }, [selectedCourse]);

  /**
   * Loads questions for the selected course
   */
  const loadQuestions = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getQuestionsByCourse(selectedCourse);
      setQuestions(data);
    } catch (err) {
      console.error('Failed to load questions:', err);
      if (err instanceof Error) {
        // Check if it's a "no questions" scenario vs actual error
        if (err.message.includes('No questions found') || err.message.includes('not found')) {
          setError(null); // Don't show error for empty results
        } else {
          setError(`Unable to load questions: ${err.message}`);
        }
      } else {
        setError('Unable to load questions. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  /**
   * Loads review mode status for the selected course
   */
  const loadCourseReviewMode = async () => {
    try {
      const courses = await getAllCourses();
      const course = courses.find((c: any) => c.code === selectedCourse);
      setReviewModeEnabled(course?.reviewModeEnabled || false);
    } catch (err) {
      console.error('Failed to load course review mode:', err);
    }
  };

  /**
   * Toggles review mode for the selected course
   */
  const handleToggleReviewMode = async () => {
    try {
      setTogglingReviewMode(true);
      setError(null);
      const newValue = !reviewModeEnabled;
      await updateCourse(selectedCourse, { reviewModeEnabled: newValue });
      setReviewModeEnabled(newValue);
      setSuccess(`Review Mode ${newValue ? 'enabled' : 'disabled'} for ${selectedCourse}`);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to toggle review mode');
    } finally {
      setTogglingReviewMode(false);
    }
  };

  /**
   * Handles image upload for question or alternative
   */
  const handleImageUpload = async (
    file: File,
    type: 'question' | 'alternative',
    index?: number
  ) => {
    try {
      setUploadingImage(true);
      setError(null);
      
      // Validate file type
      if (!['image/jpeg', 'image/png', 'image/gif'].includes(file.type)) {
        throw new Error('Image must be JPEG, PNG, or GIF');
      }
      
      // Validate file size (5MB max)
      if (file.size > 5 * 1024 * 1024) {
        throw new Error('Image must be under 5MB');
      }
      
      const result = await uploadImage(file);
      
      if (type === 'question') {
        setQuestionImageUrl(result.url);
      } else if (type === 'alternative' && index !== undefined) {
        const newAlternatives = [...alternatives];
        newAlternatives[index].imageUrl = result.url;
        setAlternatives(newAlternatives);
      }
      
      setSuccess('Image uploaded successfully');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload image');
    } finally {
      setUploadingImage(false);
    }
  };

  /**
   * Adds a new alternative to the form
   */
  const addAlternative = () => {
    setAlternatives([
      ...alternatives,
      { text: '', imageUrl: null, isCorrect: false, order: alternatives.length },
    ]);
  };

  /**
   * Removes an alternative from the form
   */
  const removeAlternative = (index: number) => {
    if (alternatives.length <= 2) {
      setError('Question must have at least two alternatives');
      return;
    }
    const newAlternatives = alternatives.filter((_, i) => i !== index);
    // Update order
    newAlternatives.forEach((alt, i) => {
      alt.order = i;
    });
    setAlternatives(newAlternatives);
  };

  /**
   * Updates an alternative field
   */
  const updateAlternative = (
    index: number,
    field: keyof Alternative,
    value: string | boolean
  ) => {
    const newAlternatives = [...alternatives];
    if (field === 'isCorrect' && value === true) {
      if (questionType === 'single') {
        // For single answer questions, unmark others
        newAlternatives.forEach((alt, i) => {
          alt.isCorrect = i === index;
        });
      } else {
        // For multiple answer questions, just update this one
        newAlternatives[index].isCorrect = true;
      }
    } else if (field === 'isCorrect' && value === false) {
      newAlternatives[index].isCorrect = false;
    } else {
      (newAlternatives[index][field] as any) = value;
    }
    setAlternatives(newAlternatives);
  };

  /**
   * Validates the question form
   */
  const validateForm = (): string | null => {
    if (!questionText.trim()) {
      return 'Question text is required';
    }
    
    if (alternatives.length < 2) {
      return 'Question must have at least two alternatives';
    }
    
    const hasCorrect = alternatives.some((alt) => alt.isCorrect);
    if (!hasCorrect) {
      return 'Question must have at least one correct alternative';
    }
    
    for (const alt of alternatives) {
      if (!alt.text.trim()) {
        return 'All alternatives must have text';
      }
    }
    
    return null;
  };

  /**
   * Handles question creation
   */
  const handleCreateQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }
    
    try {
      setLoading(true);
      setError(null);
      
      const questionData: CreateQuestionRequest = {
        courseCode: selectedCourse,
        questionText: questionText.trim(),
        questionType: questionType,
        imageUrl: questionImageUrl,
        alternatives: alternatives.map((alt) => ({
          text: alt.text.trim(),
          imageUrl: alt.imageUrl,
          isCorrect: alt.isCorrect,
          order: alt.order,
        })),
      };
      
      await createQuestion(questionData);
      
      // Reset form
      setQuestionType('single');
      setQuestionText('');
      setQuestionImageUrl(null);
      setAlternatives([
        { text: '', imageUrl: null, isCorrect: true, order: 0 },
        { text: '', imageUrl: null, isCorrect: false, order: 1 },
      ]);
      setShowCreateForm(false);
      
      setSuccess('Question created successfully');
      setTimeout(() => setSuccess(null), 3000);
      
      // Reload questions
      await loadQuestions();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create question');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Handles question deletion
   */
  const handleDeleteQuestion = async (questionId: string) => {
    if (!confirm('Are you sure you want to delete this question?')) {
      return;
    }
    
    try {
      setLoading(true);
      setError(null);
      await deleteQuestion(questionId);
      setSuccess('Question deleted successfully');
      setTimeout(() => setSuccess(null), 3000);
      await loadQuestions();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete question');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Handles selecting/deselecting a question
   */
  const handleSelectQuestion = (questionId: string, checked: boolean) => {
    const newSelected = new Set(selectedQuestions);
    if (checked) {
      newSelected.add(questionId);
    } else {
      newSelected.delete(questionId);
    }
    setSelectedQuestions(newSelected);
  };

  /**
   * Handles selecting/deselecting all questions
   */
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedQuestions(new Set(questions.map(q => q.question.id)));
    } else {
      setSelectedQuestions(new Set());
    }
  };

  /**
   * Handles bulk deletion of selected questions
   */
  const handleBulkDelete = async () => {
    if (selectedQuestions.size === 0) {
      setError('Please select at least one question to delete');
      return;
    }

    const confirmMessage = `Are you sure you want to delete ${selectedQuestions.size} question(s)? This action cannot be undone.`;
    if (!confirm(confirmMessage)) {
      return;
    }

    try {
      setDeleting(true);
      setError(null);
      
      let deletedCount = 0;
      let failedCount = 0;
      
      for (const questionId of selectedQuestions) {
        try {
          await deleteQuestion(questionId);
          deletedCount++;
        } catch {
          failedCount++;
        }
      }
      
      if (deletedCount > 0) {
        setSuccess(`Successfully deleted ${deletedCount} question(s)${failedCount > 0 ? `. Failed to delete ${failedCount} question(s).` : ''}`);
        setTimeout(() => setSuccess(null), 5000);
      }
      
      if (failedCount > 0 && deletedCount === 0) {
        setError(`Failed to delete ${failedCount} question(s)`);
      }
      
      setSelectedQuestions(new Set());
      await loadQuestions();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete questions');
    } finally {
      setDeleting(false);
    }
  };

  /**
   * Handles CSV file selection
   */
  const handleCSVFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file type
      if (!file.name.endsWith('.csv')) {
        setError('Please select a CSV file');
        return;
      }
      setCsvFile(file);
      setError(null);
      setImportResult(null);
    }
  };

  /**
   * Handles CSV template download
   */
  const handleDownloadTemplate = async () => {
    try {
      setError(null);
      const csvContent = await downloadCSVTemplate();
      
      // Create a blob and download
      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'question-import-template.csv';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      
      setSuccess('Template downloaded successfully');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to download template');
    }
  };

  /**
   * Handles CSV import
   */
  const handleImportCSV = async () => {
    if (!csvFile) {
      setError('Please select a CSV file');
      return;
    }

    try {
      setImporting(true);
      setError(null);
      setImportResult(null);

      // Read file content
      const fileContent = await csvFile.text();

      // Import questions
      const result = await bulkImportQuestions(selectedCourse, fileContent);

      setImportResult({
        imported: result.imported,
        failed: result.failed,
        errors: result.errors
      });

      if (result.imported > 0) {
        setSuccess(`Successfully imported ${result.imported} question(s)`);
        setTimeout(() => setSuccess(null), 5000);
        await loadQuestions();
      }

      if (result.failed > 0) {
        setError(`Failed to import ${result.failed} question(s). See details below.`);
      }

      // Clear file input
      setCsvFile(null);
      const fileInput = document.getElementById('csv-file-input') as HTMLInputElement;
      if (fileInput) {
        fileInput.value = '';
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import questions');
    } finally {
      setImporting(false);
    }
  };

  /**
   * Closes the import form and resets state
   */
  const handleCloseImportForm = () => {
    setShowImportForm(false);
    setCsvFile(null);
    setImportResult(null);
    const fileInput = document.getElementById('csv-file-input') as HTMLInputElement;
    if (fileInput) {
      fileInput.value = '';
    }
  };

  /**
   * Handles exporting questions to CSV
   */
  const handleExportQuestions = async () => {
    try {
      setExporting(true);
      setError(null);
      
      const csvContent = await exportQuestionsToCSV(selectedCourse);
      
      // Create a blob and download
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${selectedCourse}-questions-export.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      
      setSuccess(`Successfully exported ${questions.length} question(s)`);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to export questions');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="question-management">
      {/* Question editor modal */}
      {editingQuestionId && (
        <QuestionEditor
          questionId={editingQuestionId}
          onClose={() => setEditingQuestionId(null)}
          onSave={() => {
            setEditingQuestionId(null);
            setSuccess('Question updated successfully');
            setTimeout(() => setSuccess(null), 3000);
            loadQuestions();
          }}
        />
      )}

      <div className="management-header">
        <h2>Question Management</h2>
        <div className="header-actions">
          <button
            className="btn btn-secondary"
            onClick={handleExportQuestions}
            disabled={loading || importing || exporting || questions.length === 0}
          >
            {exporting ? 'Exporting...' : 'Export to CSV'}
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => setShowImportForm(!showImportForm)}
            disabled={loading || importing}
          >
            {showImportForm ? 'Cancel Import' : 'Import from CSV'}
          </button>
          <button
            className="btn btn-primary"
            onClick={() => setShowCreateForm(!showCreateForm)}
            disabled={loading || importing}
          >
            {showCreateForm ? 'Cancel' : 'Create New Question'}
          </button>
        </div>
      </div>

      {/* Course selector */}
      <div className="course-selector">
        <label htmlFor="course-select">Select Course:</label>
        <select
          id="course-select"
          value={selectedCourse}
          onChange={(e) => setSelectedCourse(e.target.value)}
          disabled={loading}
        >
          {courses.map((course) => (
            <option key={course.code} value={course.code}>
              {course.code} - {course.name} ({course.provider})
            </option>
          ))}
        </select>

        {/* Review Mode Toggle */}
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', marginLeft: '1.5rem' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.9rem' }}>
            <input
              type="checkbox"
              checked={reviewModeEnabled}
              onChange={handleToggleReviewMode}
              disabled={togglingReviewMode || loading}
              style={{ transform: 'scale(1.3)', cursor: 'pointer' }}
            />
            📖 Review Mode
          </label>
          <span style={{ fontSize: '0.8rem', color: reviewModeEnabled ? '#28a745' : '#6c757d' }}>
            {togglingReviewMode ? '...' : (reviewModeEnabled ? '(Enabled)' : '(Disabled)')}
          </span>
        </div>
      </div>

      {/* Error and success messages */}
      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      {/* CSV Import form */}
      {showImportForm && (
        <div className="create-question-form">
          <h3>Import Questions from CSV</h3>
          
          <div className="import-instructions">
            <p>Upload a CSV file to import multiple questions at once. This is much faster than creating questions one by one.</p>
            <ul>
              <li>Download the template below to see the required format</li>
              <li>Fill in your questions following the template structure</li>
              <li>Upload the completed CSV file</li>
              <li>Questions will be imported for the currently selected course: <strong>{selectedCourse}</strong></li>
            </ul>
          </div>

          <div className="form-actions" style={{ marginBottom: '1.5rem' }}>
            <button
              type="button"
              onClick={handleDownloadTemplate}
              className="btn btn-secondary"
              disabled={importing}
            >
              Download CSV Template
            </button>
          </div>

          <div className="form-group">
            <label htmlFor="csv-file-input">Select CSV File</label>
            <input
              id="csv-file-input"
              type="file"
              accept=".csv"
              onChange={handleCSVFileChange}
              disabled={importing}
            />
            {csvFile && (
              <p className="form-help">
                Selected file: {csvFile.name} ({(csvFile.size / 1024).toFixed(2)} KB)
              </p>
            )}
          </div>

          {importResult && (
            <div className="import-result">
              <h4>Import Results</h4>
              <div className="result-summary">
                <p>
                  <strong>Successfully imported:</strong> {importResult.imported} question(s)
                </p>
                {importResult.failed > 0 && (
                  <p>
                    <strong>Failed to import:</strong> {importResult.failed} question(s)
                  </p>
                )}
              </div>

              {importResult.errors.length > 0 && (
                <div className="import-errors">
                  <h5>Errors:</h5>
                  <ul>
                    {importResult.errors.map((err, index) => (
                      <li key={index}>
                        <strong>Row {err.row}:</strong> {err.field && `(${err.field}) `}{err.message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          <div className="form-actions">
            <button
              type="button"
              onClick={handleImportCSV}
              disabled={!csvFile || importing}
              className="btn btn-primary"
            >
              {importing ? 'Importing...' : 'Import Questions'}
            </button>
            <button
              type="button"
              onClick={handleCloseImportForm}
              disabled={importing}
              className="btn btn-secondary"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Create question form */}
      {showCreateForm && (
        <div className="create-question-form">
          <h3>Create New Question</h3>
          <form onSubmit={handleCreateQuestion}>
            {/* Question Type Selection */}
            <div className="form-group">
              <label>Question Type *</label>
              <div className="question-type-selector">
                {QUESTION_TYPES.map((type) => (
                  <label key={type.type} className="radio-option">
                    <input
                      type="radio"
                      name="questionType"
                      value={type.type}
                      checked={questionType === type.type}
                      onChange={(e) => setQuestionType(e.target.value as 'single' | 'multiple')}
                      disabled={loading}
                    />
                    <div className="radio-content">
                      <strong>{type.label}</strong>
                      <p>{type.description}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Question text */}
            <div className="form-group">
              <label htmlFor="question-text">Question Text *</label>
              <textarea
                id="question-text"
                value={questionText}
                onChange={(e) => setQuestionText(e.target.value)}
                rows={3}
                placeholder="Enter the question text..."
                disabled={loading}
                required
              />
            </div>

            {/* Question image */}
            <div className="form-group">
              <label htmlFor="question-image">Question Image (Optional)</label>
              <input
                type="file"
                id="question-image"
                accept="image/jpeg,image/png,image/gif"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleImageUpload(file, 'question');
                }}
                disabled={loading || uploadingImage}
              />
              {questionImageUrl && (
                <div className="image-preview">
                  <img src={questionImageUrl} alt="Question" />
                  <button
                    type="button"
                    onClick={() => setQuestionImageUrl(null)}
                    disabled={loading}
                  >
                    Remove
                  </button>
                </div>
              )}
            </div>

            {/* Alternatives */}
            <div className="alternatives-section">
              <h4>Alternatives</h4>
              {alternatives.map((alt, index) => (
                <div key={index} className="alternative-item">
                  <div className="alternative-header">
                    <span>Alternative {index + 1}</span>
                    {alternatives.length > 2 && (
                      <button
                        type="button"
                        onClick={() => removeAlternative(index)}
                        disabled={loading}
                        className="btn-remove"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  
                  <div className="form-group">
                    <input
                      type="text"
                      value={alt.text}
                      onChange={(e) => updateAlternative(index, 'text', e.target.value)}
                      placeholder="Alternative text..."
                      disabled={loading}
                      required
                    />
                  </div>
                  
                  <div className="form-group">
                    <label>
                      <input
                        type={questionType === 'single' ? 'radio' : 'checkbox'}
                        name={questionType === 'single' ? 'correctAnswer' : undefined}
                        checked={alt.isCorrect}
                        onChange={(e) => updateAlternative(index, 'isCorrect', e.target.checked)}
                        disabled={loading}
                      />
                      Correct Answer
                    </label>
                  </div>
                  
                  <div className="form-group">
                    <label>Alternative Image (Optional)</label>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/gif"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleImageUpload(file, 'alternative', index);
                      }}
                      disabled={loading || uploadingImage}
                    />
                    {alt.imageUrl && (
                      <div className="image-preview">
                        <img src={alt.imageUrl} alt={`Alternative ${index + 1}`} />
                        <button
                          type="button"
                          onClick={() => updateAlternative(index, 'imageUrl', '')}
                          disabled={loading}
                        >
                          Remove
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              
              <button
                type="button"
                onClick={addAlternative}
                disabled={loading}
                className="btn btn-secondary"
              >
                Add Alternative
              </button>
            </div>

            {/* Submit button */}
            <div className="form-actions">
              <button
                type="submit"
                disabled={loading || uploadingImage}
                className="btn btn-primary"
              >
                {loading ? 'Creating...' : 'Create Question'}
              </button>
              <button
                type="button"
                onClick={() => setShowCreateForm(false)}
                disabled={loading}
                className="btn btn-secondary"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Questions list */}
      <div className="questions-list">
        <div className="questions-list-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3>
            Questions for {selectedCourse} ({questions.length})
          </h3>
          {questions.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={selectedQuestions.size === questions.length && questions.length > 0}
                  onChange={(e) => handleSelectAll(e.target.checked)}
                  disabled={loading || deleting}
                  style={{ transform: 'scale(1.2)' }}
                />
                <span style={{ fontSize: '0.9rem', color: '#666' }}>Select All</span>
              </label>
              {selectedQuestions.size > 0 && (
                <button
                  onClick={handleBulkDelete}
                  disabled={loading || deleting}
                  className="btn btn-danger"
                  style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                >
                  {deleting ? 'Deleting...' : `Delete Selected (${selectedQuestions.size})`}
                </button>
              )}
            </div>
          )}
        </div>
        
        {loading && <p>Loading questions...</p>}
        
        {!loading && questions.length === 0 && (
          <div className="no-questions">
            <p>No questions available for {selectedCourse} yet.</p>
            <p>Click "Create New Question" above to add the first question for this course.</p>
          </div>
        )}
        
        {!loading && questions.length > 0 && (
          <div className="questions-grid">
            {questions.map((item) => (
              <div key={item.question.id} className={`question-card ${selectedQuestions.has(item.question.id) ? 'selected' : ''}`}>
                <div className="question-header">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <input
                      type="checkbox"
                      checked={selectedQuestions.has(item.question.id)}
                      onChange={(e) => handleSelectQuestion(item.question.id, e.target.checked)}
                      disabled={loading || deleting}
                      style={{ transform: 'scale(1.2)', cursor: 'pointer' }}
                    />
                    <span className="question-id">
                      Question #{item.question.id.substring(0, 8)}
                    </span>
                  </div>
                  <div className="question-actions">
                    <button
                      onClick={() => setEditingQuestionId(item.question.id)}
                      disabled={loading || deleting}
                      className="btn-edit"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDeleteQuestion(item.question.id)}
                      disabled={loading || deleting}
                      className="btn-delete"
                    >
                      Delete
                    </button>
                  </div>
                </div>
                
                <div className="question-content">
                  <p className="question-text">{item.question.questionText}</p>
                  {item.question.imageUrl && (
                    <img
                      src={item.question.imageUrl}
                      alt="Question"
                      className="question-image"
                    />
                  )}
                </div>
                
                <div className="alternatives-list">
                  <strong>Alternatives:</strong>
                  <ul>
                    {item.alternatives.map((alt) => (
                      <li
                        key={alt.id}
                        className={alt.isCorrect ? 'correct' : ''}
                      >
                        {alt.text}
                        {alt.isCorrect && <span className="badge">Correct</span>}
                        {alt.imageUrl && <span className="badge">Has Image</span>}
                      </li>
                    ))}
                  </ul>
                </div>
                
                <div className="question-meta">
                  <small>
                    Version {item.question.version} • 
                    Created {new Date(item.question.createdAt).toLocaleDateString()}
                  </small>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default QuestionManagement;
