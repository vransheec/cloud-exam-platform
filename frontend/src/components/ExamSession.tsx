/**
 * Exam Session Component
 * 
 * Manages exam session lifecycle:
 * - Checks for active session before starting
 * - Prevents starting multiple exams
 * - Handles exam failures with restart option
 * - Provides clear error messages
 */

import React, { useState, useEffect } from 'react';
import {
  ExamInfo,
  ExamSessionWithQuestions,
  QuestionWithAlternatives,
  getExamInfo,
  startExam,
  getActiveExam,
  abandonExam,
} from '../services/studentService';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import ExamTaking from './ExamTaking';

interface ExamSessionProps {
  courseCode: string;
  language?: 'en' | 'es';
  onBack: () => void;
  onExamComplete: (sessionId: string, questions: QuestionWithAlternatives[]) => void;
}

const ExamSession: React.FC<ExamSessionProps> = ({
  courseCode,
  language: selectedLanguage = 'en',
  onBack,
  onExamComplete,
}) => {
  const { token } = useAuth();
  const { t, language } = useLanguage();
  const [examInfo, setExamInfo] = useState<ExamInfo | null>(null);
  const [activeSession, setActiveSession] = useState<ExamSessionWithQuestions | null>(null);
  const [staleSession, setStaleSession] = useState<ExamSessionWithQuestions | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [abandoning, setAbandoning] = useState(false);
  const [reviewMode, setReviewMode] = useState(false);

  useEffect(() => {
    loadExamInfo();
    checkActiveSession();
  }, [courseCode]);

  const loadExamInfo = async () => {
    if (!token) return;

    try {
      setLoading(true);
      setError(null);
      const info = await getExamInfo(token, courseCode);
      setExamInfo(info);
    } catch (err) {
      setError(err instanceof Error ? err.message : (language === 'en' ? 'Failed to load exam information' : 'Error al cargar información del examen'));
    } finally {
      setLoading(false);
    }
  };

  const checkActiveSession = async () => {
    if (!token) return;

    try {
      const response = await getActiveExam(token);
      if (response && response.session && response.session.courseCode === courseCode) {
        const sessionStart = new Date(response.session.startTime);
        const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
        
        if (sessionStart < twoHoursAgo) {
          setStaleSession(response);
        } else {
          setActiveSession(response);
        }
      } else if (response && response.session) {
        const sessionStart = new Date(response.session.startTime);
        const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
        
        if (sessionStart < twoHoursAgo) {
          setError(
            language === 'en' 
              ? `You have a stale exam session for ${response.session.courseCode}. Would you like to abandon it and start a new exam?`
              : `Tienes una sesión de examen pendiente para ${response.session.courseCode}. ¿Deseas abandonarla y comenzar un nuevo examen?`
          );
          setStaleSession(response);
        }
      }
    } catch (err) {
      console.error('Error checking active session:', err);
    }
  };

  const handleAbandonExam = async () => {
    if (!token) return;

    try {
      setAbandoning(true);
      setError(null);
      
      await abandonExam(token);
      
      setStaleSession(null);
      setActiveSession(null);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : (language === 'en' ? 'Failed to abandon exam' : 'Error al abandonar examen'));
    } finally {
      setAbandoning(false);
    }
  };

  const handleContinueStaleExam = () => {
    if (staleSession) {
      setActiveSession(staleSession);
      setStaleSession(null);
    }
  };

  const handleStartExam = async () => {
    if (!token) return;

    try {
      setStarting(true);
      setError(null);

      const session = await startExam(token, courseCode, selectedLanguage);
      setActiveSession(session);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : (language === 'en' ? 'Failed to start exam' : 'Error al iniciar examen');
      
      if (errorMessage.includes('active exam session')) {
        setError(
          language === 'en'
            ? 'You have an active exam session. Please complete or cancel it before starting a new exam.'
            : 'Tienes una sesión de examen activa. Por favor complétala o cancélala antes de iniciar un nuevo examen.'
        );
      } else if (errorMessage.includes('Access denied') || errorMessage.includes('not have access')) {
        setError(
          language === 'en'
            ? 'You do not have access to this exam. Please check your enrollment status and access dates.'
            : 'No tienes acceso a este examen. Por favor verifica tu estado de inscripción y fechas de acceso.'
        );
      } else if (errorMessage.includes('ENGLISH_ONLY_COURSE')) {
        setError(
          language === 'en'
            ? 'This exam is only available in English.'
            : 'Este examen solo está disponible en inglés.'
        );
      } else {
        setError(errorMessage);
      }
    } finally {
      setStarting(false);
    }
  };

  const handleExamError = (errorMessage: string) => {
    setError(errorMessage);
    
    if (errorMessage.includes('session encountered an error')) {
      setActiveSession(null);
    }
  };

  const handleRestartExam = () => {
    setActiveSession(null);
    setError(null);
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
        <p>{t('common.loading')}</p>
      </div>
    );
  }

  if (!examInfo) {
    return (
      <div className="error-container">
        <p className="error-message">{language === 'en' ? 'Failed to load exam information' : 'Error al cargar información del examen'}</p>
        <button onClick={onBack} className="btn btn-secondary">
          {t('results.backToCourses')}
        </button>
      </div>
    );
  }

  if (activeSession) {
    return (
      <div className="exam-session-container">
        <ExamTaking
          sessionId={activeSession.session.id}
          questions={activeSession.questions}
          onComplete={() => onExamComplete(activeSession.session.id, activeSession.questions)}
          onError={handleExamError}
          reviewMode={reviewMode}
          timeLimitMinutes={!reviewMode ? ((examInfo as any)?.timeLimitMinutes || examInfo?.course?.timeLimitMinutes) : undefined}
          startTime={activeSession.session.startTime}
          sessionLanguage={activeSession.session.language || 'en'}
        />
      </div>
    );
  }

  if (staleSession) {
    const sessionStart = new Date(staleSession.session.startTime);
    const hoursAgo = Math.floor((Date.now() - sessionStart.getTime()) / (1000 * 60 * 60));
    
    return (
      <div className="exam-start-screen">
        <button onClick={onBack} className="btn btn-link back-button">
          {t('exam.backToCourses')}
        </button>

        <div className="exam-info-card">
          <h1>{t('stale.title')}</h1>
          <p className="course-code">{staleSession.session.courseCode}</p>
          
          <div className="stale-session-info" style={{ 
            backgroundColor: '#fff3cd', 
            border: '1px solid #ffc107', 
            borderRadius: '8px', 
            padding: '20px', 
            marginBottom: '20px' 
          }}>
            <h3 style={{ color: '#856404', marginBottom: '10px' }}>⚠️ {t('stale.warning')}</h3>
            <p style={{ color: '#856404' }}>
              {t('stale.startedAgo')} <strong>{hoursAgo} {t('stale.hoursAgo')}</strong> {t('stale.on')}{' '}
              {sessionStart.toLocaleDateString(language === 'en' ? 'en-US' : 'es-ES', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </p>
            <p style={{ color: '#856404', marginTop: '10px' }}>
              {t('stale.continueOrAbandon')}
            </p>
          </div>

          {error && (
            <div className="error-message-box">
              <p className="error-message">{error}</p>
            </div>
          )}

          <div className="stale-session-actions" style={{ display: 'flex', gap: '15px', justifyContent: 'center' }}>
            <button
              onClick={handleContinueStaleExam}
              className="btn btn-primary btn-large"
              disabled={abandoning}
            >
              {t('stale.continueExam')}
            </button>
            <button
              onClick={handleAbandonExam}
              disabled={abandoning}
              className="btn btn-secondary btn-large"
              style={{ backgroundColor: '#dc3545', borderColor: '#dc3545', color: 'white' }}
            >
              {abandoning ? t('exam.abandoning') : t('stale.abandonStart')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="exam-start-screen">
      <button onClick={onBack} className="btn btn-link back-button">
        {t('exam.backToCourses')}
      </button>

      <div className="exam-info-card">
        <h1>{examInfo.course.name}</h1>
        <p className="course-code">{examInfo.course.code}</p>
        <p className="course-description">{examInfo.course.description}</p>

        <div className="exam-details">
          <div className="detail-item">
            <span className="detail-label">{t('exam.provider')}</span>
            <span className={`provider-badge provider-${examInfo.course.provider.toLowerCase()}`}>
              {examInfo.course.provider}
            </span>
          </div>

          <div className="detail-item">
            <span className="detail-label">{t('exam.numberOfQuestions')}</span>
            <span className="detail-value">
              {examInfo.questionCount}
              {(examInfo as any).isTrial && (examInfo as any).trialQuestionCount && (
                <span style={{ color: '#dc3545', fontWeight: 700, marginLeft: '0.5rem', fontSize: '0.85rem' }}>
                  → {(examInfo as any).trialQuestionCount} {language === 'en' ? 'in Trial mode' : 'en modo Prueba'}
                </span>
              )}
            </span>
          </div>

          <div className="detail-item">
            <span className="detail-label">{t('exam.passingScore')}</span>
            <span className="detail-value">{examInfo.course.passingPercentage || 70}%</span>
          </div>

          {((examInfo as any).timeLimitMinutes || examInfo.course.timeLimitMinutes) && ((examInfo as any).timeLimitMinutes || examInfo.course.timeLimitMinutes) > 0 && (
            <div className="detail-item">
              <span className="detail-label">{language === 'en' ? 'Time Limit' : 'Tiempo Límite'}</span>
              <span className="detail-value">
                {examInfo.course.timeLimitMinutes || (examInfo as any).timeLimitMinutes} {language === 'en' ? 'minutes' : 'minutos'}
                {(examInfo as any).isTrial && (examInfo as any).timeLimitMinutes && (
                  <span style={{ color: '#dc3545', fontWeight: 700, marginLeft: '0.5rem', fontSize: '0.85rem' }}>
                    → {(examInfo as any).timeLimitMinutes} {language === 'en' ? 'min in Trial mode' : 'min en modo Prueba'}
                  </span>
                )}
              </span>
            </div>
          )}

          <div className="detail-item">
            <span className="detail-label">{t('exam.accessStatus')}</span>
            <span className={`access-badge ${examInfo.hasAccess ? 'access-granted' : 'access-denied'}`}>
              {examInfo.hasAccess ? t('exam.active') : t('exam.inactive')}
            </span>
          </div>

          {examInfo.hasAccess && (
            <div className="detail-item">
              <span className="detail-label">{t('exam.accessExpires')}</span>
              <span className="detail-value">
                {new Date(examInfo.accessStatus.expiresAt).toLocaleDateString(language === 'en' ? 'en-US' : 'es-ES', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </span>
            </div>
          )}
        </div>

        {error && (
          <div className="error-message-box">
            <p className="error-message">{error}</p>
            {error.includes('session encountered an error') && (
              <button onClick={handleRestartExam} className="btn btn-primary">
                {t('exam.restartExam')}
              </button>
            )}
            {(error.includes('active exam session') || error.includes('stale exam session') || error.includes('sesión de examen')) && (
              <button 
                onClick={handleAbandonExam} 
                disabled={abandoning}
                className="btn btn-secondary"
                style={{ marginTop: '10px', backgroundColor: '#dc3545', borderColor: '#dc3545', color: 'white' }}
              >
                {abandoning ? t('exam.abandoning') : t('exam.abandonPrevious')}
              </button>
            )}
          </div>
        )}

        {!examInfo.hasAccess ? (
          <div className="access-denied-message">
            <p className="warning-text">{examInfo.accessStatus.reason}</p>
            <button onClick={onBack} className="btn btn-secondary">
              {t('results.backToCourses')}
            </button>
          </div>
        ) : (
          <div className="exam-instructions">
            <h2>{t('exam.instructions')}</h2>
            <ul>
              <li>{language === 'en' ? `You will be presented with ${examInfo.questionCount} questions` : `Se te presentarán ${examInfo.questionCount} preguntas`}
                {(examInfo as any).isTrial && (examInfo as any).trialQuestionCount && (
                  <span style={{ color: '#dc3545', fontWeight: 700 }}>
                    {' → '}{(examInfo as any).trialQuestionCount} {language === 'en' ? 'in Trial mode' : 'en modo Prueba'}
                  </span>
                )}
              </li>
              <li>{t('exam.instruction2')}</li>
              <li>{t('exam.instruction3')}</li>
              <li>{t('exam.instruction4')}</li>
              <li>{t('exam.instruction5')}</li>
              <li>{t('exam.instruction6')}</li>
              <li>{t('exam.instruction7')}</li>
              {!reviewMode && ((examInfo as any).timeLimitMinutes || examInfo.course.timeLimitMinutes) > 0 && (
                <li style={{ color: '#dc3545', fontWeight: 'bold' }}>
                  {language === 'en' 
                    ? `⏱ You have ${(examInfo as any).timeLimitMinutes || examInfo.course.timeLimitMinutes} minutes to complete this exam. The exam will auto-submit when time runs out.`
                    : `⏱ Tienes ${(examInfo as any).timeLimitMinutes || examInfo.course.timeLimitMinutes} minutos para completar este examen. El examen se enviará automáticamente cuando se agote el tiempo.`}
                </li>
              )}
              {(examInfo as any).isTrial && (
                <li style={{ color: '#764ba2', fontWeight: 'bold' }}>
                  {language === 'en'
                    ? '🎯 This is a trial exam with limited questions. Purchase full access to unlock all questions and unlimited attempts.'
                    : '🎯 Este es un examen de prueba con preguntas limitadas. Adquiere acceso completo para desbloquear todas las preguntas e intentos ilimitados.'}
                </li>
              )}
            </ul>

            <button
              onClick={handleStartExam}
              disabled={starting}
              className="btn btn-primary btn-large"
            >
              {starting ? t('exam.startingExam') : (reviewMode 
                ? (language === 'en' ? '📖 Start Review Mode' : '📖 Iniciar Modo Repaso')
                : t('exam.startExam'))}
            </button>

            {examInfo.course.reviewModeEnabled && (
              <div style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '1rem', color: '#495057' }}>
                  <input
                    type="checkbox"
                    checked={reviewMode}
                    onChange={(e) => setReviewMode(e.target.checked)}
                    style={{ transform: 'scale(1.3)', cursor: 'pointer' }}
                  />
                  📖 {language === 'en' ? 'Review Mode' : 'Modo Repaso'}
                </label>
                <span style={{ fontSize: '0.85rem', color: '#6c757d' }}>
                  {language === 'en' 
                    ? '(See explanations for each question)' 
                    : '(Ver explicaciones por cada pregunta)'}
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ExamSession;
