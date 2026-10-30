/**
 * Exam Results Component
 * 
 * Displays exam results after completion with pagination (5 questions per page):
 * - Score and percentage
 * - Paginated questions with correct answers highlighted
 * - Student's selected answers
 * - Option to return to course selection
 */

import React, { useState, useEffect } from 'react';
import {
  ExamCompletionResponse,
  QuestionWithAlternatives,
  completeExam,
} from '../services/studentService';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';

interface ExamResultsProps {
  sessionId: string;
  questions: QuestionWithAlternatives[];
  onReturnToCourses: () => void;
  sessionLanguage?: 'en' | 'es';
}

const QUESTIONS_PER_PAGE = 5;

const ExamResults: React.FC<ExamResultsProps> = ({
  sessionId,
  questions,
  onReturnToCourses,
  sessionLanguage = 'en',
}) => {
  const { token } = useAuth();
  const { t, language } = useLanguage();
  const [results, setResults] = useState<ExamCompletionResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    loadResults();
  }, []);

  const loadResults = async () => {
    if (!token) return;
    try {
      setLoading(true);
      setError(null);
      const data = await completeExam(token, sessionId);
      setResults(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : (language === 'en' ? 'Failed to load exam results' : 'Error al cargar resultados del examen'));
    } finally {
      setLoading(false);
    }
  };

  // Helper to render English badge when field is in English but session is Spanish
  const renderEnglishBadge = (fieldLanguage?: 'en' | 'es') => {
    if (sessionLanguage === 'es' && fieldLanguage === 'en') {
      return (
        <span
          className="english-badge"
          aria-label={t('results.englishNotAvailable')}
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

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
        <p>{language === 'en' ? 'Calculating your results...' : 'Calculando tus resultados...'}</p>
      </div>
    );
  }

  if (error || !results) {
    return (
      <div className="error-container">
        <p className="error-message">{error || (language === 'en' ? 'Failed to load results' : 'Error al cargar resultados')}</p>
        <button onClick={onReturnToCourses} className="btn btn-primary">
          {t('results.backToCourses')}
        </button>
      </div>
    );
  }

  const percentage = Math.round((results.result.score / results.result.totalQuestions) * 100);
  const passed = percentage >= 70;

  // Count unscored questions
  const unscoredCount = results.answers.filter(a => a.isUnscored).length;

  const answersMap = results.answers.reduce((acc, answer) => {
    acc[answer.questionId] = answer;
    return acc;
  }, {} as Record<string, typeof results.answers[0]>);

  // Pagination
  const totalPages = Math.ceil(questions.length / QUESTIONS_PER_PAGE);
  const startIndex = (currentPage - 1) * QUESTIONS_PER_PAGE;
  const paginatedQuestions = questions.slice(startIndex, startIndex + QUESTIONS_PER_PAGE);

  return (
    <div className="exam-results">
      {/* Score Summary */}
      <div className={`score-summary ${passed ? 'passed' : 'failed'}`}>
        <h1>{language === 'en' ? 'Exam Complete!' : '¡Examen Completado!'}</h1>
        
        <div className="score-display">
          <div className="score-circle">
            <span className="score-percentage">{percentage}%</span>
          </div>
          <div className="score-details">
            <p className="score-text">
              {language === 'en' 
                ? <>You scored <strong>{results.result.score}</strong> out of <strong>{results.result.totalQuestions}</strong></>
                : <>Obtuviste <strong>{results.result.score}</strong> de <strong>{results.result.totalQuestions}</strong></>
              }
            </p>
            <p className={`pass-status ${passed ? 'passed' : 'failed'}`}>
              {passed ? `✓ ${t('results.passed')}` : `✗ ${t('results.failed')}`}
            </p>
          </div>
        </div>

        <p className="completion-date">
          {language === 'en' ? 'Completed on' : 'Completado el'}{' '}
          {new Date(results.result.completedAt).toLocaleDateString(language === 'en' ? 'en-US' : 'es-ES', {
            year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
          })}
        </p>
        {unscoredCount > 0 && (
          <p style={{ fontSize: '0.85rem', color: '#6c757d', marginTop: '0.5rem', fontStyle: 'italic' }}>
            {language === 'en' 
              ? `${unscoredCount} question${unscoredCount > 1 ? 's were' : ' was'} randomly selected as unscored (pretest), as in the official exam.`
              : `${unscoredCount} pregunta${unscoredCount > 1 ? 's fueron seleccionadas' : ' fue seleccionada'} al azar como no evaluada${unscoredCount > 1 ? 's' : ''} (pretest), tal como en el examen oficial.`}
          </p>
        )}
      </div>

      {/* Question Review */}
      <div className="questions-review">
        <h2>{t('results.reviewAnswers')}</h2>
        <p className="review-subtitle">
          {language === 'en' 
            ? `Showing questions ${startIndex + 1}-${Math.min(startIndex + QUESTIONS_PER_PAGE, questions.length)} of ${questions.length}`
            : `Mostrando preguntas ${startIndex + 1}-${Math.min(startIndex + QUESTIONS_PER_PAGE, questions.length)} de ${questions.length}`}
        </p>

        {paginatedQuestions.map((questionWithAlts, pageIndex) => {
          const globalIndex = startIndex + pageIndex;
          const answer = answersMap[questionWithAlts.question.id];
          const correctAlternatives = questionWithAlts.alternatives.filter(
            (alt) => answer.correctAlternativeIds.includes(alt.id)
          );
          const selectedAlternatives = questionWithAlts.alternatives.filter(
            (alt) => answer.selectedAlternativeIds.includes(alt.id)
          );
          const isUnscored = answer.isUnscored || false;

          return (
            <div
              key={questionWithAlts.question.id}
              className={`question-review-item ${isUnscored ? 'unscored' : answer.isCorrect ? 'correct' : 'incorrect'}`}
            >
              <div className="question-review-header">
                <h3>
                  {t('examTaking.question')} {globalIndex + 1}
                  {isUnscored ? (
                    <span className="result-badge" style={{ background: '#6c757d', color: 'white', padding: '2px 8px', borderRadius: '4px', fontSize: '0.8rem', marginLeft: '8px' }}>
                      {language === 'en' ? '⊘ Not Scored' : '⊘ No Evaluada'}
                    </span>
                  ) : (
                    <span className={`result-badge ${answer.isCorrect ? 'correct' : 'incorrect'}`}>
                      {answer.isCorrect ? `✓ ${t('results.correct')}` : `✗ ${t('results.incorrect')}`}
                    </span>
                  )}
                </h3>
              </div>

              <div className="question-review-content">
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
                  <p className="question-text">{questionWithAlts.question.questionText}</p>
                  {renderEnglishBadge(questionWithAlts.fieldLanguages?.questionText)}
                </div>

                {questionWithAlts.question.imageUrl && (
                  <div className="question-image">
                    <img src={questionWithAlts.question.imageUrl} alt={language === 'en' ? 'Question illustration' : 'Ilustración de la pregunta'} loading="lazy" />
                  </div>
                )}

                <div className="alternatives-review">
                  {questionWithAlts.alternatives
                    .sort((a, b) => a.order - b.order)
                    .map((alternative) => {
                      const isCorrect = answer.correctAlternativeIds.includes(alternative.id);
                      const isSelected = answer.selectedAlternativeIds.includes(alternative.id);
                      return (
                        <div key={alternative.id} className={`alternative-review-item ${isCorrect ? 'correct-answer' : ''} ${isSelected ? 'selected-answer' : ''}`}>
                          <div className="alternative-review-content">
                            <div className="alternative-indicators">
                              {isCorrect && <span className="correct-indicator" title={language === 'en' ? 'Correct Answer' : 'Respuesta Correcta'}>✓</span>}
                              {isSelected && !isCorrect && <span className="incorrect-indicator" title={language === 'en' ? 'Your Answer' : 'Tu Respuesta'}>✗</span>}
                              {isSelected && isCorrect && <span className="selected-indicator" title={language === 'en' ? 'Your Answer' : 'Tu Respuesta'}>●</span>}
                            </div>
                            <span style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
                              <span className="alternative-text">{alternative.text}</span>
                              {renderEnglishBadge(questionWithAlts.fieldLanguages?.alternatives?.[alternative.id]?.text)}
                            </span>
                            {alternative.imageUrl && (
                              <div className="alternative-image">
                                <img src={alternative.imageUrl} alt={language === 'en' ? 'Alternative illustration' : 'Ilustración de alternativa'} loading="lazy" />
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                </div>

                {!answer.isCorrect && (
                  <div className="answer-explanation">
                    <p><strong>{t('results.yourAnswer')}</strong>{' '}{selectedAlternatives.length > 0 ? selectedAlternatives.map(alt => alt.text).join(', ') : (language === 'en' ? 'No answer selected' : 'Sin respuesta seleccionada')}</p>
                    <p><strong>{t('results.correctAnswer')}</strong>{' '}{correctAlternatives.map(alt => alt.text).join(', ')}</p>
                  </div>
                )}

                {answer.isCorrect && selectedAlternatives.length > 0 && (
                  <div className="answer-explanation" style={{ background: '#d4edda', borderColor: '#28a745' }}>
                    <p><strong>{language === 'en' ? 'Your correct answer:' : 'Tu respuesta correcta:'}</strong>{' '}{selectedAlternatives.map(alt => alt.text).join(', ')}</p>
                  </div>
                )}

                {answer.explanation && (
                  <div className="answer-explanation" style={{ background: '#e8f4fd', borderColor: '#0d6efd', borderLeft: '4px solid #0d6efd', padding: '0.75rem 1rem', marginTop: '0.5rem' }}>
                    <p style={{ margin: 0, display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
                      <span><strong>✨ {language === 'en' ? 'AI Explanation:' : 'Explicación IA:'}</strong></span>
                      {renderEnglishBadge(questionWithAlts.fieldLanguages?.explanation)}
                    </p>
                    {(() => {
                      const exp = answer.explanation;
                      const text = typeof exp === 'string' ? exp : (typeof exp === 'object' ? Object.entries(exp).map(([k, v]) => `• ${k}: ${v}`).join('\n\n') : String(exp));
                      return text.split('\n').filter(Boolean).map((line, i) => (
                        <p key={i} style={{ margin: '0.3rem 0 0 0', lineHeight: '1.5' }}>{line}</p>
                      ));
                    })()}
                  </div>
                )}

                {answer.incorrectExplanation && (
                  <div className="answer-explanation" style={{ background: '#fff3cd', borderColor: '#ffc107', borderLeft: '4px solid #ffc107', padding: '0.75rem 1rem', marginTop: '0.5rem' }}>
                    <p style={{ margin: '0 0 0.4rem 0', display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
                      <span><strong>🔍 {language === 'en' ? 'Why the other options are incorrect:' : 'Por qué las otras opciones son incorrectas:'}</strong></span>
                      {renderEnglishBadge(questionWithAlts.fieldLanguages?.incorrectExplanation)}
                    </p>
                    {(() => {
                      const iexp = answer.incorrectExplanation;
                      const text = typeof iexp === 'string' ? iexp : (typeof iexp === 'object' ? Object.entries(iexp).map(([k, v]) => `• ${k}: ${v}`).join('\n\n') : String(iexp));
                      // Split by bullet points or newlines to create separate paragraphs
                      const lines = text.split(/\n+|(?=•)/).map(l => l.trim()).filter(Boolean);
                      return lines.map((line, i) => (
                        <p key={i} style={{ margin: '0.25rem 0', lineHeight: '1.5', paddingLeft: line.startsWith('•') ? '0' : '0' }}>{line}</p>
                      ));
                    })()}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem', margin: '1.5rem 0', flexWrap: 'wrap' }}>
          <button
            className="btn btn-secondary"
            onClick={() => setCurrentPage(1)}
            disabled={currentPage === 1}
            style={{ padding: '0.4rem 0.75rem', fontSize: '0.9rem' }}
          >
            «
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => setCurrentPage(p => p - 1)}
            disabled={currentPage === 1}
            style={{ padding: '0.4rem 0.75rem', fontSize: '0.9rem' }}
          >
            ‹ {language === 'en' ? 'Prev' : 'Ant'}
          </button>
          
          {Array.from({ length: totalPages }, (_, i) => i + 1)
            .filter(p => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 2)
            .reduce((acc: (number | string)[], p, i, arr) => {
              if (i > 0 && typeof arr[i - 1] === 'number' && (p as number) - (arr[i - 1] as number) > 1) {
                acc.push('...');
              }
              acc.push(p);
              return acc;
            }, [])
            .map((item, i) => 
              item === '...' ? (
                <span key={`ellipsis-${i}`} style={{ padding: '0 0.25rem', color: '#6c757d' }}>...</span>
              ) : (
                <button
                  key={item}
                  className={`btn ${currentPage === item ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setCurrentPage(item as number)}
                  style={{ padding: '0.4rem 0.75rem', fontSize: '0.9rem', minWidth: '2.2rem' }}
                >
                  {item}
                </button>
              )
            )}
          
          <button
            className="btn btn-secondary"
            onClick={() => setCurrentPage(p => p + 1)}
            disabled={currentPage === totalPages}
            style={{ padding: '0.4rem 0.75rem', fontSize: '0.9rem' }}
          >
            {language === 'en' ? 'Next' : 'Sig'} ›
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => setCurrentPage(totalPages)}
            disabled={currentPage === totalPages}
            style={{ padding: '0.4rem 0.75rem', fontSize: '0.9rem' }}
          >
            »
          </button>
        </div>
      )}

      {/* Trial CTA */}
      {results.isTrial && (
        <div style={{
          margin: '2rem 0', padding: '1.5rem', borderRadius: '12px',
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          color: 'white', textAlign: 'center',
        }}>
          <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.3rem' }}>
            {language === 'en' ? '🎓 Ready to ace your certification?' : '🎓 ¿Listo para aprobar tu certificación?'}
          </h2>
          <p style={{ margin: '0 0 1rem', opacity: 0.9, fontSize: '0.95rem' }}>
            {language === 'en'
              ? `You just practiced with 10 questions. Unlock the full bank with detailed explanations and unlimited attempts.`
              : `Acabas de practicar con 10 preguntas. Desbloquea el banco completo con explicaciones detalladas e intentos ilimitados.`}
          </p>
          <a
            href="https://wa.me/000000000000?text=Hola%2C%20quiero%20comprar%20acceso%20completo%20al%20simulador"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-block', padding: '0.75rem 2rem', borderRadius: '8px',
              background: '#25D366', color: 'white', textDecoration: 'none',
              fontWeight: 700, fontSize: '1rem',
            }}
          >
            💬 {language === 'en' ? 'Get Full Access via WhatsApp' : 'Obtener Acceso Completo por WhatsApp'}
          </a>
        </div>
      )}

      {/* Actions */}
      <div className="results-actions">
        <button onClick={onReturnToCourses} className="btn btn-primary btn-large">
          {t('results.backToCourses')}
        </button>
      </div>
    </div>
  );
};

export default ExamResults;
