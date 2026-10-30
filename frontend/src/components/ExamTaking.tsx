/**
 * Exam Taking Component
 * 
 * Displays one question at a time with all alternatives
 * Shows navigation buttons (previous, next)
 * Includes progress indicator
 * Displays images if present
 */

import React, { useState, useEffect } from 'react';
import { QuestionWithAlternatives, submitAnswer } from '../services/studentService';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';

interface ExamTakingProps {
  sessionId: string;
  questions: QuestionWithAlternatives[];
  onComplete: () => void;
  onError: (error: string) => void;
  reviewMode?: boolean;
  timeLimitMinutes?: number;
  startTime?: string;
  sessionLanguage?: 'en' | 'es';
}

const ExamTaking: React.FC<ExamTakingProps> = ({
  sessionId,
  questions,
  onComplete,
  onError,
  reviewMode = false,
  timeLimitMinutes,
  startTime,
  sessionLanguage = 'en',
}) => {
  const { token } = useAuth();
  const { t, language } = useLanguage();
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, string[]>>({});
  const [submitting, setSubmitting] = useState(false);
  const [flaggedQuestions, setFlaggedQuestions] = useState<Set<string>>(new Set());
  const [showFlaggedPanel, setShowFlaggedPanel] = useState(false);
  const [showExplanation, setShowExplanation] = useState<Record<string, boolean>>({});
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const [timeExpired, setTimeExpired] = useState(false);
  // State for new question types
  const [dropdownAnswers, setDropdownAnswers] = useState<Record<string, string[]>>({});
  const [trueFalseAnswers, setTrueFalseAnswers] = useState<Record<string, boolean[]>>({});
  const [orderingAnswers, setOrderingAnswers] = useState<Record<string, string[]>>({});

  // Timer effect
  useEffect(() => {
    if (!timeLimitMinutes || timeLimitMinutes <= 0 || reviewMode || !startTime) return;

    const endTime = new Date(startTime).getTime() + timeLimitMinutes * 60 * 1000;

    const updateTimer = () => {
      const remaining = Math.max(0, Math.floor((endTime - Date.now()) / 1000));
      setTimeRemaining(remaining);
      if (remaining <= 0 && !timeExpired) {
        setTimeExpired(true);
        onComplete();
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [timeLimitMinutes, startTime, reviewMode, timeExpired, onComplete]);

  const formatTime = (seconds: number): string => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // Helper to render English badge when field is in English but session is Spanish
  const renderEnglishBadge = (fieldLanguage?: 'en' | 'es') => {
    if (sessionLanguage === 'es' && fieldLanguage === 'en') {
      return (
        <span
          className="english-badge"
          aria-label={t('examTaking.englishNotAvailable')}
          style={{
            display: 'inline-block',
            marginLeft: '0.5rem',
            padding: '0.2rem 0.5rem',
            backgroundColor: '#e7f3ff',
            border: '1px solid #91d5ff',
            borderRadius: '4px',
            fontSize: '0.75rem',
            fontWeight: 600,
            color: '#0050b3',
            whiteSpace: 'nowrap',
          }}
        >
          🇺🇸 EN
        </span>
      );
    }
    return null;
  };

  const currentQuestion = questions[currentQuestionIndex];
  const totalQuestions = questions.length;
  const progress = ((currentQuestionIndex + 1) / totalQuestions) * 100;

  // Check if current question has been answered
  const currentAnswers = selectedAnswers[currentQuestion.question.id] || [];
  const isQuestionAnswered = currentAnswers.length > 0;
  const isCurrentFlagged = flaggedQuestions.has(currentQuestion.question.id);

  // Toggle flag for current question
  const toggleFlag = () => {
    setFlaggedQuestions(prev => {
      const newSet = new Set(prev);
      if (newSet.has(currentQuestion.question.id)) {
        newSet.delete(currentQuestion.question.id);
      } else {
        newSet.add(currentQuestion.question.id);
      }
      return newSet;
    });
  };

  // Navigate to a specific question (used from flagged panel)
  const goToQuestion = (index: number) => {
    setCurrentQuestionIndex(index);
    setShowFlaggedPanel(false);
  };

  // Handle answer selection for single/multiple
  const handleSelectAnswer = async (alternativeId: string) => {
    if (!token) {
      onError(language === 'en' ? 'Authentication token not available' : 'Token de autenticación no disponible');
      return;
    }
    
    if (submitting) {
      return;
    }

    try {
      setSubmitting(true);

      const currentSelections = selectedAnswers[currentQuestion.question.id] || [];
      let newSelections: string[];
      
      if (currentQuestion.question.questionType === 'single') {
        newSelections = [alternativeId];
      } else {
        if (currentSelections.includes(alternativeId)) {
          newSelections = currentSelections.filter(id => id !== alternativeId);
        } else {
          newSelections = [...currentSelections, alternativeId];
        }
      }

      await submitAnswer(token, sessionId, currentQuestion.question.id, newSelections);
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : (language === 'en' ? 'Failed to submit answer' : 'Error al enviar respuesta');
      onError(errorMessage);
    } finally {
      setSubmitting(false);
    }
  };

  // Handle dropdown answer change
  const handleDropdownChange = async (statementIndex: number, value: string) => {
    if (!token || submitting) return;
    const qId = currentQuestion.question.id;
    const current = dropdownAnswers[qId] || [];
    const updated = [...current];
    updated[statementIndex] = value;
    setDropdownAnswers(prev => ({ ...prev, [qId]: updated }));
    // Also mark as answered in selectedAnswers for progress tracking
    setSelectedAnswers(prev => ({ ...prev, [qId]: [JSON.stringify(updated)] }));
    try {
      setSubmitting(true);
      await submitAnswer(token, sessionId, qId, [JSON.stringify(updated)]);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Error');
    } finally {
      setSubmitting(false);
    }
  };

  // Handle true/false answer change
  const handleTrueFalseChange = async (statementIndex: number, value: boolean) => {
    if (!token || submitting) return;
    const qId = currentQuestion.question.id;
    const stmts = currentQuestion.question.extendedData?.trueFalseStatements || [];
    const current = trueFalseAnswers[qId] || new Array(stmts.length).fill(null);
    const updated = [...current];
    updated[statementIndex] = value;
    setTrueFalseAnswers(prev => ({ ...prev, [qId]: updated }));
    setSelectedAnswers(prev => ({ ...prev, [qId]: [JSON.stringify(updated)] }));
    try {
      setSubmitting(true);
      await submitAnswer(token, sessionId, qId, [JSON.stringify(updated)]);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Error');
    } finally {
      setSubmitting(false);
    }
  };

  // Handle ordering: move item up or down within selected items
  const handleOrderingMove = async (fromIndex: number, direction: 'up' | 'down') => {
    if (!token || submitting) return;
    const qId = currentQuestion.question.id;
    const current = orderingAnswers[qId] || [];
    const updated = [...current];
    const toIndex = direction === 'up' ? fromIndex - 1 : fromIndex + 1;
    if (toIndex < 0 || toIndex >= updated.length) return;
    [updated[fromIndex], updated[toIndex]] = [updated[toIndex], updated[fromIndex]];
    setOrderingAnswers(prev => ({ ...prev, [qId]: updated }));
    setSelectedAnswers(prev => ({ ...prev, [qId]: [JSON.stringify(updated)] }));
    try {
      setSubmitting(true);
      await submitAnswer(token, sessionId, qId, [JSON.stringify(updated)]);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Error');
    } finally {
      setSubmitting(false);
    }
  };

  // Navigate to previous question
  const handlePrevious = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(currentQuestionIndex - 1);
    }
  };

  // Navigate to next question
  const handleNext = () => {
    if (currentQuestionIndex < totalQuestions - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
    }
  };

  // Check if all questions have been answered (optional - allow partial completion)
  const answeredQuestionsCount = Object.keys(selectedAnswers).filter(
    questionId => selectedAnswers[questionId] && selectedAnswers[questionId].length > 0
  ).length;

  // Check if this is the last question
  const isLastQuestion = currentQuestionIndex === totalQuestions - 1;

  return (
    <div className="exam-taking">
      {/* Progress Bar */}
      <div className="exam-progress">
        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${progress}%` }}></div>
        </div>
        <div className="progress-info">
          <p className="progress-text">
            {t('examTaking.question')} {currentQuestionIndex + 1} {t('examTaking.of')} {totalQuestions}
          </p>
          <button 
            className="btn-show-flagged"
            onClick={() => setShowFlaggedPanel(true)}
          >
            🚩 {t('examTaking.flagged')} ({flaggedQuestions.size})
          </button>
          {timeRemaining !== null && (
            <span style={{
              fontWeight: 'bold',
              fontSize: '1.1rem',
              color: timeRemaining <= 300 ? '#dc3545' : timeRemaining <= 600 ? '#fd7e14' : '#495057',
              background: timeRemaining <= 300 ? '#f8d7da' : timeRemaining <= 600 ? '#fff3cd' : '#e9ecef',
              padding: '0.3rem 0.75rem',
              borderRadius: '6px',
              animation: timeRemaining <= 60 ? 'pulse 1s infinite' : 'none',
            }}>
              ⏱ {formatTime(timeRemaining)}
            </span>
          )}
        </div>
      </div>

      {/* Flagged Questions Panel */}
      {showFlaggedPanel && (
        <div className="flagged-panel-overlay" onClick={() => setShowFlaggedPanel(false)}>
          <div className="flagged-panel" onClick={e => e.stopPropagation()}>
            <div className="flagged-panel-header">
              <h3>🚩 {t('examTaking.flaggedQuestions')} ({flaggedQuestions.size})</h3>
              <button className="btn-close" onClick={() => setShowFlaggedPanel(false)}>×</button>
            </div>
            <div className="flagged-panel-content">
              {flaggedQuestions.size === 0 ? (
                <p className="no-flagged">{t('examTaking.noFlagged')}</p>
              ) : (
                <ul className="flagged-list">
                  {questions.map((q, index) => {
                    if (!flaggedQuestions.has(q.question.id)) return null;
                    const isAnswered = selectedAnswers[q.question.id]?.length > 0;
                    return (
                      <li key={q.question.id} className="flagged-item" onClick={() => goToQuestion(index)}>
                        <span className="flagged-number">Q{index + 1}</span>
                        <span className="flagged-preview">
                          {q.question.questionText.substring(0, 60)}...
                        </span>
                        <span className={`flagged-status ${isAnswered ? 'answered' : 'unanswered'}`}>
                          {isAnswered ? '✓' : '○'}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Question Display */}
      <div className="question-container">
        <div className="question-header">
          <h2>{t('examTaking.question')} {currentQuestionIndex + 1}</h2>
          <button 
            className={`btn-flag ${isCurrentFlagged ? 'flagged' : ''}`}
            onClick={toggleFlag}
            title={isCurrentFlagged ? (language === 'en' ? 'Remove flag' : 'Quitar marca') : (language === 'en' ? 'Flag for review' : 'Marcar para revisar')}
          >
            {isCurrentFlagged ? '🚩' : '⚑'}
          </button>
        </div>

        <div className="question-content">
          {/* Render content blocks if available (interleaved text+images) */}
          {currentQuestion.question.extendedData?.contentBlocks ? (
            <>
              {currentQuestion.question.extendedData.contentBlocks.map((block, idx) => (
                block.type === 'text' ? (
                  <p key={`block-${idx}`} className="question-text">{block.value}</p>
                ) : (
                  <div key={`block-${idx}`} className="question-image">
                    <img src={block.value} alt={`${language === 'en' ? 'Illustration' : 'Ilustración'} ${idx + 1}`} loading="lazy" />
                  </div>
                )
              ))}
            </>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
                <p className="question-text">{currentQuestion.question.questionText}</p>
                {renderEnglishBadge(currentQuestion.fieldLanguages?.questionText)}
              </div>

              {/* Question Image */}
              {currentQuestion.question.imageUrl && (
                <div className="question-image">
                  <img
                    src={currentQuestion.question.imageUrl}
                    alt={language === 'en' ? 'Question illustration' : 'Ilustración de la pregunta'}
                    loading="lazy"
                  />
                </div>
              )}
              {/* Additional Images */}
              {currentQuestion.question.extendedData?.additionalImages?.map((imgUrl, idx) => (
                <div className="question-image" key={`addimg-${idx}`}>
                  <img src={imgUrl} alt={`${language === 'en' ? 'Illustration' : 'Ilustración'} ${idx + 2}`} loading="lazy" />
                </div>
              ))}
            </>
          )}
        </div>

        {/* Render based on question type */}
        {(currentQuestion.question.questionType === 'single' || currentQuestion.question.questionType === 'multiple') && (
          <div className="alternatives-container">
            <h3>{currentQuestion.question.questionType === 'multiple' ? t('examTaking.selectAnswers') : t('examTaking.selectAnswer')}</h3>
          <div className="alternatives-list">
            {currentQuestion.alternatives
              .sort((a, b) => a.order - b.order)
              .map((alternative) => {
                const isSelected = currentAnswers.includes(alternative.id);
                const inputType = currentQuestion.question.questionType === 'single' ? 'radio' : 'checkbox';
                const isExplanationVisible = reviewMode && showExplanation[currentQuestion.question.id];
                const isCorrectAlt = isExplanationVisible && alternative.isCorrect;
                
                return (
                  <div
                    key={alternative.id}
                    className={`alternative-item ${isSelected ? 'selected' : ''} ${isCorrectAlt ? 'correct-highlight' : ''}`}
                    style={{ 
                      cursor: submitting ? 'not-allowed' : 'pointer',
                      border: isCorrectAlt ? '3px solid #28a745' : isSelected ? '3px solid #3b82f6' : '2px solid #e0e0e0',
                      backgroundColor: isCorrectAlt ? '#d4edda' : isSelected ? '#dbeafe' : '#f8f9fa'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', padding: '8px' }}>
                      <input
                        type={inputType}
                        id={`alt-${alternative.id}`}
                        name={currentQuestion.question.questionType === 'single' ? `q-${currentQuestion.question.id}` : undefined}
                        checked={isSelected}
                        onChange={() => {
                          if (!submitting) {
                            const newSelections = currentQuestion.question.questionType === 'single' 
                              ? [alternative.id]
                              : isSelected 
                                ? currentAnswers.filter(id => id !== alternative.id)
                                : [...currentAnswers, alternative.id];
                            
                            setSelectedAnswers(prev => ({
                              ...prev,
                              [currentQuestion.question.id]: newSelections
                            }));
                            
                            handleSelectAnswer(alternative.id);
                          }
                        }}
                        disabled={submitting}
                        style={{ 
                          marginRight: '12px',
                          transform: 'scale(1.5)',
                          cursor: 'pointer'
                        }}
                      />
                      <label 
                        htmlFor={`alt-${alternative.id}`}
                        style={{ 
                          cursor: 'pointer', 
                          flex: 1,
                          fontSize: '16px',
                          lineHeight: '1.5'
                        }}
                      >
                        {isCorrectAlt && (
                          <span style={{ color: '#28a745', fontWeight: 'bold', marginRight: '6px' }}>✓</span>
                        )}
                        <span style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
                          <span>{alternative.text}</span>
                          {renderEnglishBadge(currentQuestion.fieldLanguages?.alternatives?.[alternative.id]?.text)}
                        </span>
                        
                        {alternative.imageUrl && (
                          <div style={{ marginTop: '8px' }}>
                            <img
                              src={alternative.imageUrl}
                              alt={language === 'en' ? 'Alternative illustration' : 'Ilustración de alternativa'}
                              style={{ maxWidth: '100%', borderRadius: '4px' }}
                            />
                          </div>
                        )}
                      </label>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
        )}

        {/* Dropdown Question Type */}
        {currentQuestion.question.questionType === 'dropdown' && currentQuestion.question.extendedData?.dropdownStatements && (
          <div className="alternatives-container">
            <h3>{language === 'en' ? 'Select the correct option for each statement' : 'Selecciona la opción correcta para cada enunciado'}</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {currentQuestion.question.extendedData.dropdownStatements.map((stmt, idx) => {
                const currentVal = (dropdownAnswers[currentQuestion.question.id] || [])[idx] || '';
                return (
                  <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.75rem', background: '#f8f9fa', borderRadius: '8px', border: '1px solid #dee2e6' }}>
                    <span style={{ flex: 1, fontSize: '0.95rem' }}>{stmt.text}</span>
                    <select
                      value={currentVal}
                      onChange={(e) => handleDropdownChange(idx, e.target.value)}
                      disabled={submitting}
                      style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid #ced4da', minWidth: '200px', fontSize: '0.9rem' }}
                    >
                      <option value="">{language === 'en' ? '-- Select --' : '-- Seleccionar --'}</option>
                      {stmt.options.map((opt, optIdx) => (
                        <option key={optIdx} value={opt}>{opt}</option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* True/False Question Type */}
        {currentQuestion.question.questionType === 'truefalse' && currentQuestion.question.extendedData?.trueFalseStatements && (
          <div className="alternatives-container">
            <h3>{language === 'en' ? 'Mark each statement as Yes or No' : 'Marca cada enunciado como Sí o No'}</h3>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #dee2e6' }}>
                  <th style={{ textAlign: 'left', padding: '0.75rem', fontWeight: 600 }}>{language === 'en' ? 'Statement' : 'Enunciado'}</th>
                  <th style={{ width: '80px', textAlign: 'center', padding: '0.75rem', fontWeight: 600 }}>{language === 'en' ? 'Yes' : 'Sí'}</th>
                  <th style={{ width: '80px', textAlign: 'center', padding: '0.75rem', fontWeight: 600 }}>No</th>
                </tr>
              </thead>
              <tbody>
                {currentQuestion.question.extendedData.trueFalseStatements.map((stmt, idx) => {
                  const answers = trueFalseAnswers[currentQuestion.question.id] || [];
                  const currentVal = answers[idx];
                  return (
                    <tr key={idx} style={{ borderBottom: '1px solid #dee2e6' }}>
                      <td style={{ padding: '0.75rem', fontSize: '0.95rem' }}>{stmt.text}</td>
                      <td style={{ textAlign: 'center', padding: '0.75rem' }}>
                        <input
                          type="radio"
                          name={`tf-${currentQuestion.question.id}-${idx}`}
                          checked={currentVal === true}
                          onChange={() => handleTrueFalseChange(idx, true)}
                          disabled={submitting}
                          style={{ transform: 'scale(1.4)', cursor: 'pointer' }}
                        />
                      </td>
                      <td style={{ textAlign: 'center', padding: '0.75rem' }}>
                        <input
                          type="radio"
                          name={`tf-${currentQuestion.question.id}-${idx}`}
                          checked={currentVal === false}
                          onChange={() => handleTrueFalseChange(idx, false)}
                          disabled={submitting}
                          style={{ transform: 'scale(1.4)', cursor: 'pointer' }}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Ordering Question Type (Drag & Drop: select + order) */}
        {currentQuestion.question.questionType === 'ordering' && currentQuestion.question.extendedData?.orderingItems && (() => {
          const qId = currentQuestion.question.id;
          const allItems = currentQuestion.question.extendedData!.orderingItems!;
          const selected = orderingAnswers[qId] || [];
          const available = allItems.map(i => i.text).filter(t => !selected.includes(t));
          
          return (
          <div className="alternatives-container">
            <h3>{language === 'en' ? 'Select and arrange the items in the correct order' : 'Selecciona y ordena los elementos en el orden correcto'}</h3>
            
            {/* Available items pool */}
            <div style={{ marginBottom: '1rem' }}>
              <p style={{ fontWeight: 600, marginBottom: '0.5rem', color: '#495057' }}>{language === 'en' ? 'Available items:' : 'Elementos disponibles:'}</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                {available.length === 0 ? (
                  <p style={{ color: '#6c757d', fontStyle: 'italic', fontSize: '0.9rem' }}>{language === 'en' ? 'All items have been placed' : 'Todos los elementos han sido colocados'}</p>
                ) : available.map((itemText, idx) => (
                  <div key={`avail-${idx}`} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.6rem 0.75rem', background: '#fff', borderRadius: '8px', border: '1px solid #dee2e6' }}>
                    <span style={{ flex: 1, fontSize: '0.95rem' }}>{itemText}</span>
                    <button
                      onClick={() => {
                        const updated = [...selected, itemText];
                        setOrderingAnswers(prev => ({ ...prev, [qId]: updated }));
                        setSelectedAnswers(prev => ({ ...prev, [qId]: [JSON.stringify(updated)] }));
                        if (token) {
                          setSubmitting(true);
                          submitAnswer(token, sessionId, qId, [JSON.stringify(updated)]).catch(() => {}).finally(() => setSubmitting(false));
                        }
                      }}
                      disabled={submitting}
                      style={{ padding: '0.3rem 0.75rem', background: '#0d6efd', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem' }}
                    >→ {language === 'en' ? 'Add' : 'Agregar'}</button>
                  </div>
                ))}
              </div>
            </div>
            
            {/* Answer area (selected + ordered) */}
            <div>
              <p style={{ fontWeight: 600, marginBottom: '0.5rem', color: '#495057' }}>{language === 'en' ? 'Answer area (in order):' : 'Área de respuesta (en orden):'}</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', minHeight: '60px', padding: '0.5rem', background: '#f0f7ff', borderRadius: '8px', border: '2px dashed #0d6efd' }}>
                {selected.length === 0 ? (
                  <p style={{ color: '#6c757d', fontStyle: 'italic', fontSize: '0.9rem', textAlign: 'center', padding: '1rem' }}>{language === 'en' ? 'Place items here' : 'Coloca los elementos aquí'}</p>
                ) : selected.map((itemText, idx) => (
                  <div key={`sel-${idx}`} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.6rem 0.75rem', background: '#dbeafe', borderRadius: '8px', border: '1px solid #93c5fd' }}>
                    <span style={{ fontWeight: 'bold', color: '#1e40af', minWidth: '24px' }}>{idx + 1}.</span>
                    <span style={{ flex: 1, fontSize: '0.95rem' }}>{itemText}</span>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button onClick={() => handleOrderingMove(idx, 'up')} disabled={idx === 0 || submitting} style={{ padding: '2px 8px', border: '1px solid #93c5fd', borderRadius: '4px', background: idx === 0 ? '#e9ecef' : '#fff', cursor: idx === 0 ? 'not-allowed' : 'pointer', fontSize: '0.8rem' }}>▲</button>
                      <button onClick={() => handleOrderingMove(idx, 'down')} disabled={idx === selected.length - 1 || submitting} style={{ padding: '2px 8px', border: '1px solid #93c5fd', borderRadius: '4px', background: idx === selected.length - 1 ? '#e9ecef' : '#fff', cursor: idx === selected.length - 1 ? 'not-allowed' : 'pointer', fontSize: '0.8rem' }}>▼</button>
                      <button
                        onClick={() => {
                          const updated = selected.filter((_, i) => i !== idx);
                          setOrderingAnswers(prev => ({ ...prev, [qId]: updated }));
                          setSelectedAnswers(prev => ({ ...prev, [qId]: updated.length > 0 ? [JSON.stringify(updated)] : [] }));
                          if (token && updated.length > 0) {
                            setSubmitting(true);
                            submitAnswer(token, sessionId, qId, [JSON.stringify(updated)]).catch(() => {}).finally(() => setSubmitting(false));
                          }
                        }}
                        disabled={submitting}
                        style={{ padding: '2px 8px', border: '1px solid #f87171', borderRadius: '4px', background: '#fee2e2', color: '#dc2626', cursor: 'pointer', fontSize: '0.8rem' }}
                      >✕</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          );
        })()}

        {/* Review Mode: Show Explanation Button */}
        {reviewMode && currentQuestion.question.explanation && (
          <div style={{ marginTop: '1rem' }}>
            <button
              className="btn btn-secondary"
              onClick={() => setShowExplanation(prev => ({
                ...prev,
                [currentQuestion.question.id]: !prev[currentQuestion.question.id]
              }))}
              style={{ 
                display: 'flex', alignItems: 'center', gap: '0.5rem',
                background: showExplanation[currentQuestion.question.id] ? '#0d6efd' : '#6c757d',
                color: 'white', border: 'none', padding: '0.5rem 1rem', borderRadius: '6px', cursor: 'pointer'
              }}
            >
              ✨ {showExplanation[currentQuestion.question.id] 
                ? (language === 'en' ? 'Hide AI Explanation' : 'Ocultar Explicación IA')
                : (language === 'en' ? 'Show AI Explanation' : 'Ver Explicación IA')}
            </button>
            {showExplanation[currentQuestion.question.id] && (
              <div style={{ 
                marginTop: '0.75rem', padding: '1rem', background: '#e8f4fd', 
                borderLeft: '4px solid #0d6efd', borderRadius: '4px' 
              }}>
                <p style={{ margin: 0, fontSize: '0.95rem' }}>
                  <strong>✨ {language === 'en' ? 'AI Explanation:' : 'Explicación IA:'}</strong>
                  {renderEnglishBadge(currentQuestion.fieldLanguages?.explanation)}
                </p>
                {(() => {
                  const exp = currentQuestion.question.explanation;
                  const text = typeof exp === 'string' ? exp : (typeof exp === 'object' && exp ? Object.entries(exp).map(([k, v]) => `• ${k}: ${v}`).join('\n\n') : String(exp || ''));
                  return text.split('\n').filter(Boolean).map((line: string, i: number) => (
                    <p key={i} style={{ margin: '0.3rem 0 0 0', fontSize: '0.95rem', lineHeight: '1.5' }}>{line}</p>
                  ));
                })()}
              </div>
            )}
            {showExplanation[currentQuestion.question.id] && currentQuestion.question.incorrectExplanation && (
              <div style={{ 
                marginTop: '0.5rem', padding: '1rem', background: '#fff3cd', 
                borderLeft: '4px solid #ffc107', borderRadius: '4px' 
              }}>
                <p style={{ margin: '0 0 0.4rem 0', fontSize: '0.95rem' }}>
                  <strong>🔍 {language === 'en' ? 'Why the other options are incorrect:' : 'Por qué las otras opciones son incorrectas:'}</strong>
                  {renderEnglishBadge(currentQuestion.fieldLanguages?.incorrectExplanation)}
                </p>
                {(() => {
                  const iexp = currentQuestion.question.incorrectExplanation;
                  const text = typeof iexp === 'string' ? iexp : (typeof iexp === 'object' && iexp ? Object.entries(iexp).map(([k, v]) => `• ${k}: ${v}`).join('\n\n') : String(iexp || ''));
                  const lines = text.split(/\n+|(?=•)/).map((l: string) => l.trim()).filter(Boolean);
                  return lines.map((line: string, i: number) => (
                    <p key={i} style={{ margin: '0.25rem 0', fontSize: '0.95rem', lineHeight: '1.5' }}>{line}</p>
                  ));
                })()}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Navigation Buttons */}
      <div className="exam-navigation">
        <button
          className="btn btn-secondary"
          onClick={handlePrevious}
          disabled={currentQuestionIndex === 0 || submitting}
        >
          {t('examTaking.previous')}
        </button>

        <div className="navigation-center">
          {!isQuestionAnswered && (
            <p className="answer-reminder">
              {currentQuestion.question.questionType === 'multiple' 
                ? t('examTaking.selectAllCorrect')
                : t('examTaking.pleaseSelect')}
            </p>
          )}
        </div>

        {!isLastQuestion ? (
          <button
            className="btn btn-primary"
            onClick={handleNext}
            disabled={submitting}
          >
            {t('examTaking.next')}
          </button>
        ) : (
          <button
            className="btn btn-primary"
            onClick={handleNext}
            disabled={true}
            style={{ visibility: 'hidden' }}
          >
            {t('examTaking.next')}
          </button>
        )}
      </div>

      {/* Finish Exam Button - Always visible */}
      <div className="finish-exam-section">
        <button
          className="btn btn-success btn-large"
          onClick={onComplete}
          disabled={submitting}
        >
          {t('examTaking.finishExam')}
        </button>
        <p className="finish-note">
          {answeredQuestionsCount < totalQuestions 
            ? `${t('examTaking.warningUnanswered')} ${totalQuestions - answeredQuestionsCount} ${t('examTaking.unansweredQuestions')}`
            : t('examTaking.allAnswered')}
        </p>
        <p className="answer-count">
          {t('examTaking.answered')} {answeredQuestionsCount} {t('examTaking.of')} {totalQuestions} {t('examTaking.questions')}
        </p>
      </div>
    </div>
  );
};

export default ExamTaking;
