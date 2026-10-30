/**
 * Student Dashboard Page
 * 
 * Main dashboard for students to access courses and exams.
 * Manages navigation between different views:
 * - Course selection
 * - Exam session
 * - Exam results
 * - Exam history
 */

import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import CourseSelection from '../components/CourseSelection';
import ExamSession from '../components/ExamSession';
import ExamResults from '../components/ExamResults';
import ExamHistory from '../components/ExamHistory';
import { QuestionWithAlternatives } from '../services/studentService';
import { useLanguage } from '../contexts/LanguageContext';

type ViewType = 'courses' | 'exam' | 'results' | 'history';

const StudentDashboard: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [currentView, setCurrentView] = useState<ViewType>('courses');
  const [selectedCourse, setSelectedCourse] = useState<string | null>(null);
  const [selectedLanguage, setSelectedLanguage] = useState<'en' | 'es'>('en');
  const [completedSessionId, setCompletedSessionId] = useState<string | null>(null);
  const [examQuestions, setExamQuestions] = useState<QuestionWithAlternatives[]>([]);

  // Update view based on current route
  useEffect(() => {
    const path = location.pathname;
    
    if (path.includes('/history')) {
      setCurrentView('history');
      // Clear exam state when navigating to history
      setSelectedCourse(null);
      setCompletedSessionId(null);
      setExamQuestions([]);
    } else if (path.includes('/courses') || path.includes('/dashboard')) {
      setCurrentView('courses');
      // Clear exam state when navigating to courses
      setSelectedCourse(null);
      setCompletedSessionId(null);
      setExamQuestions([]);
    }
  }, [location.pathname]);

  const handleSelectCourse = (courseCode: string, language: 'en' | 'es' = 'en') => {
    setSelectedCourse(courseCode);
    setSelectedLanguage(language);
    setCurrentView('exam');
  };

  const handleExamComplete = (sessionId: string, questions: QuestionWithAlternatives[]) => {
    setCompletedSessionId(sessionId);
    setExamQuestions(questions);
    setCurrentView('results');
  };

  const handleReturnToCourses = () => {
    setSelectedCourse(null);
    setCompletedSessionId(null);
    setExamQuestions([]);
    setCurrentView('courses');
    navigate('/student/courses', { replace: true });
  };

  const handleViewHistory = () => {
    setCurrentView('history');
    navigate('/student/history', { replace: true });
  };

  const handleBackFromHistory = () => {
    setCurrentView('courses');
    navigate('/student/courses', { replace: true });
  };

  return (
    <div className="dashboard student-dashboard">

      {currentView === 'courses' && (
        <div>
          <div className="dashboard-header">
            <h1>{t('nav.dashboard')}</h1>
            <button onClick={handleViewHistory} className="btn btn-secondary">
              {t('nav.examHistory')}
            </button>
          </div>
          <CourseSelection onSelectCourse={handleSelectCourse} />
        </div>
      )}

      {currentView === 'exam' && selectedCourse && (
        <ExamSession
          courseCode={selectedCourse}
          language={selectedLanguage}
          onBack={handleReturnToCourses}
          onExamComplete={handleExamComplete}
        />
      )}

      {currentView === 'results' && completedSessionId && (
        <ExamResults
          sessionId={completedSessionId}
          questions={examQuestions}
          onReturnToCourses={handleReturnToCourses}
          sessionLanguage={selectedLanguage}
        />
      )}

      {currentView === 'history' && (
        <ExamHistory onBack={handleBackFromHistory} />
      )}
    </div>
  );
};

export default StudentDashboard;
