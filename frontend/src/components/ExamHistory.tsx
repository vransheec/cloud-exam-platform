/**
 * Exam History Component
 * 
 * Displays student's exam history:
 * - List all completed exams
 * - Show scores and dates
 * - Filter by course
 */

import React, { useState, useEffect } from 'react';
import { ExamResult, getExamHistory } from '../services/studentService';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';

interface ExamHistoryProps {
  onBack: () => void;
}

const ExamHistory: React.FC<ExamHistoryProps> = ({ onBack }) => {
  const { token } = useAuth();
  const { t, language } = useLanguage();
  const [history, setHistory] = useState<ExamResult[]>([]);
  const [filteredHistory, setFilteredHistory] = useState<ExamResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCourse, setSelectedCourse] = useState<string>('all');

  useEffect(() => {
    loadHistory();
  }, []);

  useEffect(() => {
    filterHistory();
  }, [selectedCourse, history]);

  const loadHistory = async () => {
    if (!token) return;

    try {
      setLoading(true);
      setError(null);
      const data = await getExamHistory(token);
      const sortedData = data.sort(
        (a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime()
      );
      setHistory(sortedData);
      setFilteredHistory(sortedData);
    } catch (err) {
      setError(err instanceof Error ? err.message : (language === 'en' ? 'Failed to load exam history' : 'Error al cargar historial de exámenes'));
    } finally {
      setLoading(false);
    }
  };

  const filterHistory = () => {
    if (selectedCourse === 'all') {
      setFilteredHistory(history);
    } else {
      setFilteredHistory(history.filter((exam) => exam.courseCode === selectedCourse));
    }
  };

  const courseCodes = Array.from(new Set(history.map((exam) => exam.courseCode)));

  const calculatePercentage = (score: number, total: number) => {
    return Math.round((score / total) * 100);
  };

  const getPassStatus = (score: number, total: number) => {
    const percentage = calculatePercentage(score, total);
    return percentage >= 70 ? 'passed' : 'failed';
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString(language === 'en' ? 'en-US' : 'es-ES', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
        <p>{t('common.loading')}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="error-container">
        <p className="error-message">{error}</p>
        <button onClick={loadHistory} className="btn btn-primary">
          {language === 'en' ? 'Try Again' : 'Intentar de Nuevo'}
        </button>
        <button onClick={onBack} className="btn btn-secondary">
          {language === 'en' ? 'Back' : 'Volver'}
        </button>
      </div>
    );
  }

  return (
    <div className="exam-history">
      <button onClick={onBack} className="btn btn-link back-button">
        {language === 'en' ? '← Back to Dashboard' : '← Volver al Panel'}
      </button>

      <div className="history-header">
        <h1>{t('history.title')}</h1>
        <p className="subtitle">{language === 'en' ? 'View all your completed exams and scores' : 'Ve todos tus exámenes completados y puntajes'}</p>
      </div>

      {history.length === 0 ? (
        <div className="empty-state">
          <h2>{language === 'en' ? 'No Exam History' : 'Sin Historial de Exámenes'}</h2>
          <p>{t('history.noExams')}</p>
          <p>{language === 'en' ? 'Start taking exams to see your results here.' : 'Comienza a tomar exámenes para ver tus resultados aquí.'}</p>
          <button onClick={onBack} className="btn btn-primary">
            {language === 'en' ? 'Go to Courses' : 'Ir a Cursos'}
          </button>
        </div>
      ) : (
        <>
          {/* Filter Controls */}
          <div className="history-filters">
            <label htmlFor="course-filter">{language === 'en' ? 'Filter by course:' : 'Filtrar por curso:'}</label>
            <select
              id="course-filter"
              value={selectedCourse}
              onChange={(e) => setSelectedCourse(e.target.value)}
              className="filter-select"
            >
              <option value="all">{language === 'en' ? 'All Courses' : 'Todos los Cursos'}</option>
              {courseCodes.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </div>

          {/* Statistics Summary */}
          <div className="history-stats">
            <div className="stat-card">
              <span className="stat-value">{filteredHistory.length}</span>
              <span className="stat-label">{language === 'en' ? 'Total Exams' : 'Total Exámenes'}</span>
            </div>
            <div className="stat-card">
              <span className="stat-value">
                {filteredHistory.filter((exam) => getPassStatus(exam.score, exam.totalQuestions) === 'passed').length}
              </span>
              <span className="stat-label">{language === 'en' ? 'Passed' : 'Aprobados'}</span>
            </div>
            <div className="stat-card">
              <span className="stat-value">
                {filteredHistory.length > 0
                  ? Math.round(
                      filteredHistory.reduce(
                        (sum, exam) => sum + calculatePercentage(exam.score, exam.totalQuestions),
                        0
                      ) / filteredHistory.length
                    )
                  : 0}
                %
              </span>
              <span className="stat-label">{language === 'en' ? 'Average Score' : 'Puntaje Promedio'}</span>
            </div>
          </div>

          {/* Exam History List */}
          <div className="history-list">
            {filteredHistory.length === 0 ? (
              <div className="empty-filter-state">
                <p>{language === 'en' ? 'No exams found for the selected course.' : 'No se encontraron exámenes para el curso seleccionado.'}</p>
              </div>
            ) : (
              filteredHistory.map((exam) => {
                const percentage = calculatePercentage(exam.score, exam.totalQuestions);
                const passStatus = getPassStatus(exam.score, exam.totalQuestions);

                return (
                  <div key={exam.id} className={`history-item ${passStatus}`}>
                    <div className="history-item-header">
                      <div className="course-info">
                        <h3 className="course-code">{exam.courseCode}</h3>
                        <span className={`pass-badge ${passStatus}`}>
                          {passStatus === 'passed' ? `✓ ${t('results.passed')}` : `✗ ${t('results.failed')}`}
                        </span>
                      </div>
                      <div className="exam-date">{formatDate(exam.completedAt)}</div>
                    </div>

                    <div className="history-item-body">
                      <div className="score-display">
                        <div className="score-circle-small">
                          <span className="score-percentage">{percentage}%</span>
                        </div>
                        <div className="score-details">
                          <p className="score-text">
                            {exam.score} / {exam.totalQuestions} {language === 'en' ? 'correct' : 'correctas'}
                          </p>
                        </div>
                      </div>

                      <div className="score-bar">
                        <div
                          className={`score-bar-fill ${passStatus}`}
                          style={{ width: `${percentage}%` }}
                        ></div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default ExamHistory;
