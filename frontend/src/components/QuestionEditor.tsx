/**
 * Question Editor Component
 * 
 * Allows assistants to edit existing questions and alternatives.
 * Supports updating question text, alternatives, correct answers, and images.
 * 
 * Requirements:
 * - 2.4: Allow updating which alternative is correct
 * - 2.5: Preserve question history
 */

import React, { useState, useEffect } from 'react';
import {
  getQuestion,
  updateQuestion,
  uploadImage,
  QuestionWithAlternatives,
  UpdateQuestionRequest,
} from '../services/assistantService';

interface QuestionEditorProps {
  questionId: string;
  onClose: () => void;
  onSave: () => void;
}

interface EditableAlternative {
  id: string;
  text: string;
  imageUrl: string | null;
  isCorrect: boolean;
}

const QuestionEditor: React.FC<QuestionEditorProps> = ({
  questionId,
  onClose,
  onSave,
}) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  
  // Question data
  const [questionText, setQuestionText] = useState('');
  const [questionImageUrl, setQuestionImageUrl] = useState<string | null>(null);
  const [explanation, setExplanation] = useState('');
  const [incorrectExplanation, setIncorrectExplanation] = useState('');
  const [alternatives, setAlternatives] = useState<EditableAlternative[]>([]);
  const [originalData, setOriginalData] = useState<QuestionWithAlternatives | null>(null);
  
  // Extended data for new question types
  const [trueFalseStatements, setTrueFalseStatements] = useState<Array<{text: string; isTrue: boolean}>>([]);
  const [dropdownStatements, setDropdownStatements] = useState<Array<{text: string; options: string[]; correctOption: string}>>([]);
  const [orderingItems, setOrderingItems] = useState<Array<{text: string; correctPosition: number}>>([]);

  // Load question data
  useEffect(() => {
    loadQuestion();
  }, [questionId]);

  /**
   * Loads the question data
   */
  const loadQuestion = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getQuestion(questionId);
      setOriginalData(data);
      setQuestionText(data.question.questionText);
      setQuestionImageUrl(data.question.imageUrl);
      setExplanation(data.question.explanation || '');
      setIncorrectExplanation((data.question as any).incorrectExplanation || '');
      setAlternatives(
        data.alternatives.map((alt) => ({
          id: alt.id,
          text: alt.text,
          imageUrl: alt.imageUrl,
          isCorrect: alt.isCorrect,
        }))
      );
      
      // Load extended data for new question types
      const ext = (data.question as any).extendedData;
      if (ext) {
        if (ext.trueFalseStatements) setTrueFalseStatements(ext.trueFalseStatements);
        if (ext.dropdownStatements) setDropdownStatements(ext.dropdownStatements);
        if (ext.orderingItems) setOrderingItems(ext.orderingItems);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load question');
    } finally {
      setLoading(false);
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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload image');
    } finally {
      setUploadingImage(false);
    }
  };

  /**
   * Updates an alternative field
   */
  const updateAlternative = (
    index: number,
    field: keyof EditableAlternative,
    value: string | boolean
  ) => {
    const newAlternatives = [...alternatives];
    if (field === 'isCorrect' && value === true) {
      // If marking as correct, unmark others (for single-answer questions)
      newAlternatives.forEach((alt, i) => {
        alt.isCorrect = i === index;
      });
    } else {
      (newAlternatives[index][field] as any) = value;
    }
    setAlternatives(newAlternatives);
  };

  /**
   * Validates the form
   */
  const validateForm = (): string | null => {
    if (!questionText.trim()) {
      return 'Question text is required';
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
   * Checks if the form has changes
   */
  const hasChanges = (): boolean => {
    if (!originalData) return false;
    
    if (questionText !== originalData.question.questionText) return true;
    if (questionImageUrl !== originalData.question.imageUrl) return true;
    if (explanation !== (originalData.question.explanation || '')) return true;
    if (incorrectExplanation !== ((originalData.question as any).incorrectExplanation || '')) return true;
    
    // Check alternatives
    for (let i = 0; i < alternatives.length; i++) {
      const current = alternatives[i];
      const original = originalData.alternatives.find((a) => a.id === current.id);
      
      if (!original) return true;
      if (current.text !== original.text) return true;
      if (current.imageUrl !== original.imageUrl) return true;
      if (current.isCorrect !== original.isCorrect) return true;
    }
    
    return false;
  };

  /**
   * Handles saving the question
   */
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }
    
    if (!hasChanges()) {
      setError('No changes to save');
      return;
    }
    
    try {
      setSaving(true);
      setError(null);
      
      const updates: UpdateQuestionRequest = {
        questionText: questionText.trim(),
        imageUrl: questionImageUrl,
        explanation: explanation.trim() || null,
        incorrectExplanation: incorrectExplanation.trim() || null,
        alternatives: alternatives.map((alt) => ({
          id: alt.id,
          text: alt.text.trim(),
          imageUrl: alt.imageUrl,
          isCorrect: alt.isCorrect,
        })),
      };
      
      // Include extended data for new question types
      const qType = originalData?.question.questionType;
      if (qType === 'truefalse' && trueFalseStatements.length > 0) {
        (updates as any).extendedData = { trueFalseStatements };
      } else if (qType === 'dropdown' && dropdownStatements.length > 0) {
        (updates as any).extendedData = { dropdownStatements };
      } else if (qType === 'ordering' && orderingItems.length > 0) {
        (updates as any).extendedData = { orderingItems };
      }
      
      await updateQuestion(questionId, updates);
      onSave();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update question');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="question-editor-modal">
        <div className="modal-content">
          <p>Loading question...</p>
        </div>
      </div>
    );
  }

  if (!originalData) {
    return (
      <div className="question-editor-modal">
        <div className="modal-content">
          <p>Question not found</p>
          <button onClick={onClose} className="btn btn-secondary">
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="question-editor-modal">
      <div className="modal-content">
        <div className="modal-header">
          <h2>Edit Question</h2>
          <button onClick={onClose} className="btn-close" disabled={saving}>
            ×
          </button>
        </div>

        {error && <div className="alert alert-error">{error}</div>}

        <form onSubmit={handleSave}>
          {/* Question text */}
          <div className="form-group">
            <label htmlFor="question-text">Question Text *</label>
            <textarea
              id="question-text"
              value={questionText}
              onChange={(e) => setQuestionText(e.target.value)}
              rows={3}
              placeholder="Enter the question text..."
              disabled={saving}
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
              disabled={saving || uploadingImage}
            />
            {questionImageUrl && (
              <div className="image-preview">
                <img src={questionImageUrl} alt="Question" />
                <button
                  type="button"
                  onClick={() => setQuestionImageUrl(null)}
                  disabled={saving}
                >
                  Remove
                </button>
              </div>
            )}
            {/* Additional Images */}
            {originalData?.question && (originalData.question as any).extendedData?.additionalImages?.map((imgUrl: string, idx: number) => (
              <div className="image-preview" key={`addimg-${idx}`} style={{ marginTop: '0.5rem' }}>
                <p style={{ fontSize: '0.8rem', color: '#6c757d', margin: '0 0 0.25rem 0' }}>Additional Image {idx + 1}</p>
                <img src={imgUrl} alt={`Additional ${idx + 1}`} />
              </div>
            ))}
          </div>

          {/* Explanation */}
          <div className="form-group">
            <label htmlFor="explanation">Explanation (Optional - shown in Review Mode)</label>
            <textarea
              id="explanation"
              value={explanation}
              onChange={(e) => setExplanation(e.target.value)}
              rows={2}
              placeholder="Explain why the correct answer is correct..."
              disabled={saving}
              style={{ fontSize: '0.9rem' }}
            />
          </div>

          {/* Incorrect Alternatives Explanation */}
          <div className="form-group">
            <label htmlFor="incorrect-explanation">Incorrect Alternatives Explanation (Optional)</label>
            <textarea
              id="incorrect-explanation"
              value={incorrectExplanation}
              onChange={(e) => setIncorrectExplanation(e.target.value)}
              rows={2}
              placeholder="Explain why each incorrect alternative is wrong..."
              disabled={saving}
              style={{ fontSize: '0.9rem' }}
            />
          </div>

          {/* Alternatives - only for single/multiple */}
          {(!originalData.question.questionType || originalData.question.questionType === 'single' || originalData.question.questionType === 'multiple') && (
          <div className="alternatives-section">
            <h4>Alternatives</h4>
            {alternatives.map((alt, index) => (
              <div key={alt.id} className="alternative-item">
                <div className="alternative-header">
                  <span>Alternative {index + 1}</span>
                </div>
                
                <div className="form-group">
                  <input
                    type="text"
                    value={alt.text}
                    onChange={(e) => updateAlternative(index, 'text', e.target.value)}
                    placeholder="Alternative text..."
                    disabled={saving}
                    required
                  />
                </div>
                
                <div className="form-group">
                  <label>
                    <input
                      type="checkbox"
                      checked={alt.isCorrect}
                      onChange={(e) => updateAlternative(index, 'isCorrect', e.target.checked)}
                      disabled={saving}
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
                    disabled={saving || uploadingImage}
                  />
                  {alt.imageUrl && (
                    <div className="image-preview">
                      <img src={alt.imageUrl} alt={`Alternative ${index + 1}`} />
                      <button
                        type="button"
                        onClick={() => updateAlternative(index, 'imageUrl', '')}
                        disabled={saving}
                      >
                        Remove
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
          )}

          {/* True/False Statements Editor */}
          {originalData.question.questionType === 'truefalse' && (
          <div className="alternatives-section">
            <h4>True/False Statements</h4>
            {trueFalseStatements.map((stmt, index) => (
              <div key={index} className="alternative-item" style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.75rem', marginBottom: '0.5rem', background: stmt.isTrue ? '#d4edda' : '#f8d7da', borderRadius: '8px', border: stmt.isTrue ? '2px solid #28a745' : '2px solid #dc3545' }}>
                <input
                  type="text"
                  value={stmt.text}
                  onChange={(e) => {
                    const updated = [...trueFalseStatements];
                    updated[index] = { ...updated[index], text: e.target.value };
                    setTrueFalseStatements(updated);
                  }}
                  style={{ flex: 1 }}
                  disabled={saving}
                />
                <span style={{ fontWeight: 'bold', fontSize: '0.85rem', color: '#6c757d' }}>Correct:</span>
                <select
                  value={stmt.isTrue ? 'yes' : 'no'}
                  onChange={(e) => {
                    const updated = [...trueFalseStatements];
                    updated[index] = { ...updated[index], isTrue: e.target.value === 'yes' };
                    setTrueFalseStatements(updated);
                  }}
                  disabled={saving}
                  style={{ padding: '0.4rem', borderRadius: '4px', fontWeight: 'bold', color: stmt.isTrue ? '#155724' : '#721c24', background: stmt.isTrue ? '#c3e6cb' : '#f5c6cb' }}
                >
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
                <button type="button" onClick={() => setTrueFalseStatements(trueFalseStatements.filter((_, i) => i !== index))} disabled={saving} style={{ color: '#dc3545', background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem' }}>✕</button>
              </div>
            ))}
            <button type="button" onClick={() => setTrueFalseStatements([...trueFalseStatements, { text: '', isTrue: false }])} disabled={saving} style={{ padding: '0.4rem 0.8rem', background: '#0d6efd', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', marginTop: '0.5rem' }}>+ Add Statement</button>
          </div>
          )}

          {/* Dropdown Statements Editor */}
          {originalData.question.questionType === 'dropdown' && (
          <div className="alternatives-section">
            <h4>Dropdown Statements</h4>
            {dropdownStatements.map((stmt, index) => (
              <div key={index} className="alternative-item" style={{ padding: '0.75rem', marginBottom: '0.75rem', background: '#f8f9fa', borderRadius: '8px', border: '1px solid #dee2e6' }}>
                <div className="form-group" style={{ marginBottom: '0.5rem' }}>
                  <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>Statement {index + 1}</label>
                  <input type="text" value={stmt.text} onChange={(e) => { const u = [...dropdownStatements]; u[index] = { ...u[index], text: e.target.value }; setDropdownStatements(u); }} disabled={saving} style={{ width: '100%' }} />
                </div>
                <div className="form-group" style={{ marginBottom: '0.5rem' }}>
                  <label style={{ fontSize: '0.85rem' }}>Options (comma-separated)</label>
                  <input type="text" value={stmt.options.join(', ')} onChange={(e) => { const u = [...dropdownStatements]; u[index] = { ...u[index], options: e.target.value.split(',').map(o => o.trim()).filter(o => o) }; setDropdownStatements(u); }} disabled={saving} style={{ width: '100%' }} />
                </div>
                <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <label style={{ fontSize: '0.85rem', fontWeight: 'bold' }}>✅ Correct:</label>
                  <select value={stmt.correctOption} onChange={(e) => { const u = [...dropdownStatements]; u[index] = { ...u[index], correctOption: e.target.value }; setDropdownStatements(u); }} disabled={saving} style={{ padding: '0.3rem', borderRadius: '4px', fontWeight: 'bold', background: stmt.correctOption ? '#c3e6cb' : '#fff', color: stmt.correctOption ? '#155724' : '#000' }}>
                    <option value="">-- Select --</option>
                    {stmt.options.map((opt, oi) => <option key={oi} value={opt}>{opt}</option>)}
                  </select>
                  <button type="button" onClick={() => setDropdownStatements(dropdownStatements.filter((_, i) => i !== index))} disabled={saving} style={{ marginLeft: 'auto', color: '#dc3545', background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem' }}>✕</button>
                </div>
              </div>
            ))}
            <button type="button" onClick={() => setDropdownStatements([...dropdownStatements, { text: '', options: [], correctOption: '' }])} disabled={saving} style={{ padding: '0.4rem 0.8rem', background: '#0d6efd', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', marginTop: '0.5rem' }}>+ Add Statement</button>
          </div>
          )}

          {/* Ordering Items Editor */}
          {originalData.question.questionType === 'ordering' && (
          <div className="alternatives-section">
            <h4>Ordering Items</h4>
            <p style={{ fontSize: '0.85rem', color: '#6c757d' }}>Set position to -1 for distractors (items that should NOT be selected).</p>
            {orderingItems.map((item, index) => (
              <div key={index} className="alternative-item" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem', marginBottom: '0.4rem', background: item.correctPosition >= 0 ? '#d4edda' : '#f8f9fa', borderRadius: '6px' }}>
                <input type="text" value={item.text} onChange={(e) => { const u = [...orderingItems]; u[index] = { ...u[index], text: e.target.value }; setOrderingItems(u); }} disabled={saving} style={{ flex: 1 }} />
                <label style={{ fontSize: '0.85rem', whiteSpace: 'nowrap' }}>Pos:</label>
                <input type="number" value={item.correctPosition} onChange={(e) => { const u = [...orderingItems]; u[index] = { ...u[index], correctPosition: parseInt(e.target.value) || -1 }; setOrderingItems(u); }} disabled={saving} style={{ width: '60px', padding: '0.3rem', borderRadius: '4px', border: '1px solid #ced4da' }} min={-1} />
                <button type="button" onClick={() => setOrderingItems(orderingItems.filter((_, i) => i !== index))} disabled={saving} style={{ color: '#dc3545', background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem' }}>✕</button>
              </div>
            ))}
            <button type="button" onClick={() => setOrderingItems([...orderingItems, { text: '', correctPosition: -1 }])} disabled={saving} style={{ padding: '0.4rem 0.8rem', background: '#0d6efd', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', marginTop: '0.5rem' }}>+ Add Item</button>
          </div>
          )}

          {/* Version info */}
          <div className="version-info">
            <p>
              <strong>Current Version:</strong> {originalData.question.version}
            </p>
            <p className="help-text">
              Saving will create version {originalData.question.version + 1} and preserve the current version in history.
            </p>
          </div>

          {/* Form actions */}
          <div className="form-actions">
            <button
              type="submit"
              disabled={saving || uploadingImage || !hasChanges()}
              className="btn btn-primary"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="btn btn-secondary"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default QuestionEditor;
