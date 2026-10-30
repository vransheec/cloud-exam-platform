/**
 * Course Selection Component
 * 
 * Displays all enrolled courses grouped by provider (AWS, Azure, GCP)
 * Shows access status and dates for each course
 * Handles multiple enrollments
 */

import React, { useEffect, useState } from 'react';
import { CourseWithAccess, getCourses } from '../services/studentService';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';

interface CourseSelectionProps {
  onSelectCourse: (courseCode: string, language: 'en' | 'es') => void;
}

/**
 * Trial Courses View
 * Shown when student has no enrollments - displays available courses for free trial
 */
const TrialCoursesView: React.FC<{ token: string | null; language: string }> = ({ token, language }) => {
  const [trialCourses, setTrialCourses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [enrolling, setEnrolling] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [enrolled, setEnrolled] = useState(false);

  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

  useEffect(() => {
    loadTrialCourses();
  }, []);

  const loadTrialCourses = async () => {
    try {
      const resp = await fetch(`${API_BASE_URL}/trial/courses`);
      if (resp.ok) {
        const data = await resp.json();
        setTrialCourses(data.courses || []);
      }
    } catch (e) {
      console.error('Failed to load trial courses:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleTrialEnroll = async (courseCode: string) => {
    if (!token) return;
    setEnrolling(courseCode);
    setError(null);
    try {
      // Decode token to get user info
      const payload = JSON.parse(atob(token.split('.')[1]));
      const email = payload.email || '';
      const name = payload.name || email.split('@')[0];

      const resp = await fetch(`${API_BASE_URL}/trial/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name, courseCode, skipUserCreation: true }),
      });

      if (resp.ok) {
        setSuccess(courseCode);
        setEnrolled(true);
        // Show success for 2 seconds then force full page reload to load enrolled course
        setTimeout(() => {
          window.location.replace('/student/courses');
        }, 2000);
      } else {
        const data = await resp.json();
        setError(data.error || 'Failed to enroll');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to enroll');
    } finally {
      setEnrolling(null);
    }
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner"></div>
        <p>{language === 'en' ? 'Loading courses...' : 'Cargando cursos...'}</p>
      </div>
    );
  }

  return (
    <div className="course-selection">
      <h1>{language === 'en' ? 'Welcome!' : '¡Bienvenido!'}</h1>
      <p className="subtitle" style={{ marginBottom: '0.5rem' }}>
        {language === 'en' 
          ? 'You don\'t have any courses yet. Try a free exam to get started!'
          : 'Aún no tienes cursos asignados. ¡Prueba un examen gratis para comenzar!'}
      </p>

      <div style={{
        background: 'linear-gradient(135deg, #d4edda 0%, #c3e6cb 100%)',
        border: '1px solid #28a745',
        borderRadius: '8px',
        padding: '0.75rem 1rem',
        marginBottom: '1.5rem',
        textAlign: 'center',
      }}>
        <strong style={{ color: '#155724' }}>
          🎓 {language === 'en' ? 'Free trial: 10 questions, 2 attempts, 3 days access' : 'Prueba gratuita: 10 preguntas, 2 intentos, 3 días de acceso'}
        </strong>
      </div>

      {error && (
        <div style={{ background: '#f8d7da', color: '#721c24', padding: '0.75rem', borderRadius: '6px', marginBottom: '1rem' }}>
          {error}
        </div>
      )}

      <div className="courses-grid">
        {trialCourses.map((course: any) => (
          <div key={course.code} className="course-card access-granted" style={{ opacity: success === course.code ? 0.7 : 1 }}>
            <div className="course-header">
              <h3 className="course-code">{course.code}</h3>
              <span style={{ background: '#17a2b8', color: 'white', padding: '2px 8px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 700 }}>
                FREE
              </span>
            </div>

            {course.badgeImageUrl && (
              <div className="course-badge-container">
                <img src={course.badgeImageUrl} alt={`${course.name} badge`} className="course-badge-image" />
              </div>
            )}

            <h4 className="course-name">{course.name}</h4>
            <p className="course-description">{course.description}</p>

            <button
              className="btn btn-primary"
              onClick={() => handleTrialEnroll(course.code)}
              disabled={enrolling !== null || enrolled || success === course.code}
              style={{
                background: success === course.code ? '#28a745' : undefined,
              }}
            >
              {success === course.code 
                ? (language === 'en' ? '✓ Enrolled! Redirecting...' : '✓ ¡Inscrito! Redirigiendo...')
                : enrolling === course.code 
                  ? (language === 'en' ? 'Enrolling...' : 'Inscribiendo...')
                  : (language === 'en' ? 'Try Free' : 'Probar Gratis')}
            </button>
          </div>
        ))}
      </div>

      {/* WhatsApp CTA */}
      <div style={{
        marginTop: '2rem', padding: '1.25rem', borderRadius: '12px',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        color: 'white', textAlign: 'center',
      }}>
        <p style={{ margin: '0 0 0.75rem', fontWeight: 600 }}>
          {language === 'en' ? 'Want full access to all questions?' : '¿Quieres acceso completo a todas las preguntas?'}
        </p>
        <a
          href="https://wa.me/000000000000?text=Hola%2C%20quiero%20comprar%20acceso%20completo%20al%20simulador"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'inline-block', padding: '0.6rem 1.5rem', borderRadius: '8px',
            background: '#25D366', color: 'white', textDecoration: 'none', fontWeight: 700,
          }}
        >
          💬 {language === 'en' ? 'Get Full Access via WhatsApp' : 'Obtener Acceso Completo por WhatsApp'}
        </a>
      </div>
    </div>
  );
};

const CourseSelection: React.FC<CourseSelectionProps> = ({ onSelectCourse }) => {
  const { token } = useAuth();
  const { t, language } = useLanguage();
  const [courses, setCourses] = useState<CourseWithAccess[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedLanguage, setSelectedLanguage] = useState<'en' | 'es' | null>(null);
  const [languagePromptCourse, setLanguagePromptCourse] = useState<string | null>(null);

  // Cursos que solo soportan inglés
  const ENGLISH_ONLY_COURSES = new Set(['SOA', 'DEA']);

  useEffect(() => {
    loadCourses();
  }, []);

  const loadCourses = async () => {
    if (!token) return;

    try {
      setLoading(true);
      setError(null);
      const data = await getCourses(token);
      setCourses(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : (language === 'en' ? 'Failed to load courses' : 'Error al cargar cursos'));
    } finally {
      setLoading(false);
    }
  };

  // Group courses by provider
  const groupedCourses = courses.reduce((acc, courseWithAccess) => {
    // Skip if course is null or undefined
    if (!courseWithAccess.course) {
      console.warn('Skipping course with null course data:', courseWithAccess);
      return acc;
    }
    
    const provider = courseWithAccess.course.provider;
    if (!acc[provider]) {
      acc[provider] = [];
    }
    acc[provider].push(courseWithAccess);
    return acc;
  }, {} as Record<string, CourseWithAccess[]>);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString(language === 'en' ? 'en-US' : 'es-ES', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const getAccessStatusClass = (hasAccess: boolean) => {
    return hasAccess ? 'access-granted' : 'access-denied';
  };

  const handleCourseClick = (courseCode: string) => {
    const isEnglishOnly = ENGLISH_ONLY_COURSES.has(courseCode);
    
    if (isEnglishOnly) {
      // Para cursos SOA/DEA, seleccionar automáticamente inglés
      onSelectCourse(courseCode, 'en');
    } else {
      // Para otros cursos, mostrar selector de idioma
      setLanguagePromptCourse(courseCode);
      setSelectedLanguage(null);
    }
  };

  const handleLanguageSelect = (lang: 'en' | 'es') => {
    if (languagePromptCourse) {
      onSelectCourse(languagePromptCourse, lang);
      setLanguagePromptCourse(null);
      setSelectedLanguage(null);
    }
  };

  const handleCloseLanguagePrompt = () => {
    setLanguagePromptCourse(null);
    setSelectedLanguage(null);
  };

  const getAccessStatusText = (accessStatus: CourseWithAccess['accessStatus']) => {
    if (accessStatus.hasAccess) {
      return `${t('student.expires')} ${formatDate(accessStatus.expiresAt)}`;
    }
    return t('student.accessExpired');
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
        <button onClick={loadCourses} className="btn btn-primary">
          {language === 'en' ? 'Try Again' : 'Intentar de Nuevo'}
        </button>
      </div>
    );
  }

  if (courses.length === 0) {
    return (
      <TrialCoursesView token={token} language={language} />
    );
  }

  return (
    <div className="course-selection">
      <h1>{t('nav.myCourses')}</h1>
      <p className="subtitle">{language === 'en' ? 'Select a course to view exams and start practicing' : 'Selecciona un curso para ver exámenes y comenzar a practicar'}</p>

      {Object.entries(groupedCourses).map(([provider, providerCourses]) => (
        <div key={provider} className="provider-group">
          <h2 className="provider-title">
            <span className={`provider-badge provider-${provider.toLowerCase()}`}>
              {provider}
            </span>
          </h2>

          <div className="courses-grid">
            {providerCourses.map((courseWithAccess) => {
              // Skip rendering if course is null
              if (!courseWithAccess.course) {
                return null;
              }
              
              return (
                <div
                  key={courseWithAccess.course.code}
                  className={`course-card ${getAccessStatusClass(courseWithAccess.accessStatus.hasAccess)}`}
                >
                  <div className="course-header">
                    <h3 className="course-code">{courseWithAccess.course.code}</h3>
                    {(courseWithAccess.enrollment as any).enrollmentType === 'trial' && (
                      <span style={{ background: '#ffc107', color: '#000', padding: '2px 8px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 700 }}>
                        TRIAL
                      </span>
                    )}
                    <span className={`access-badge ${getAccessStatusClass(courseWithAccess.accessStatus.hasAccess)}`}>
                      {courseWithAccess.accessStatus.hasAccess ? t('exam.active') : t('exam.inactive')}
                    </span>
                  </div>

                  {courseWithAccess.course.badgeImageUrl && (
                    <div className="course-badge-container">
                      <img 
                        src={courseWithAccess.course.badgeImageUrl} 
                        alt={`${courseWithAccess.course.name} badge`}
                        className="course-badge-image"
                      />
                    </div>
                  )}

                  <h4 className="course-name">{courseWithAccess.course.name}</h4>
                  <p className="course-description">{courseWithAccess.course.description}</p>

                  <div className="course-dates">
                    <div className="date-item">
                      <span className="date-label">{language === 'en' ? 'Course Start:' : 'Inicio del Curso:'}</span>
                      <span className="date-value">
                        {formatDate(courseWithAccess.enrollment.startDate)}
                      </span>
                    </div>
                    <div className="date-item">
                      <span className="date-label">{language === 'en' ? 'Access Start:' : 'Inicio de Acceso:'}</span>
                      <span className="date-value">
                        {formatDate(courseWithAccess.enrollment.accessStartDate)}
                      </span>
                    </div>
                    <div className="date-item">
                      <span className="date-label">{language === 'en' ? 'Access End:' : 'Fin de Acceso:'}</span>
                      <span className="date-value">
                        {formatDate(courseWithAccess.enrollment.accessEndDate)}
                      </span>
                    </div>
                  </div>

                  <div className="access-status">
                    <p className={getAccessStatusClass(courseWithAccess.accessStatus.hasAccess)}>
                      {getAccessStatusText(courseWithAccess.accessStatus)}
                    </p>
                  </div>

                  <button
                    className="btn btn-primary"
                    onClick={() => handleCourseClick(courseWithAccess.course.code)}
                    disabled={!courseWithAccess.accessStatus.hasAccess}
                  >
                    {courseWithAccess.accessStatus.hasAccess ? t('student.viewExam') : t('student.accessDenied')}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* Language Selection Modal */}
      {languagePromptCourse && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '12px',
            padding: '2rem',
            maxWidth: '500px',
            width: '90%',
            boxShadow: '0 10px 40px rgba(0, 0, 0, 0.3)',
            textAlign: 'center',
          }}>
            <h2 style={{ marginBottom: '1rem', color: '#333' }}>
              {language === 'en' ? 'Select Exam Language' : 'Selecciona el Idioma del Examen'}
            </h2>
            <p style={{ marginBottom: '2rem', color: '#666', fontSize: '1rem' }}>
              {language === 'en' 
                ? 'Choose the language for your exam:'
                : 'Elige el idioma para tu examen:'}
            </p>

            <div style={{
              display: 'flex',
              gap: '1rem',
              justifyContent: 'center',
              marginBottom: '1.5rem',
              flexWrap: 'wrap',
            }}>
              <button
                onClick={() => handleLanguageSelect('en')}
                aria-label="Iniciar examen en inglés"
                style={{
                  padding: '1rem 2rem',
                  fontSize: '1.1rem',
                  border: '2px solid #007bff',
                  borderRadius: '8px',
                  backgroundColor: selectedLanguage === 'en' ? '#007bff' : 'white',
                  color: selectedLanguage === 'en' ? 'white' : '#007bff',
                  cursor: 'pointer',
                  fontWeight: 600,
                  transition: 'all 0.3s ease',
                  minWidth: '150px',
                }}
                onMouseEnter={(e) => {
                  if (selectedLanguage !== 'en') {
                    e.currentTarget.style.backgroundColor = '#f0f0f0';
                  }
                }}
                onMouseLeave={(e) => {
                  if (selectedLanguage !== 'en') {
                    e.currentTarget.style.backgroundColor = 'white';
                  }
                }}
              >
                🇺🇸 {language === 'en' ? 'English' : 'Inglés'}
              </button>

              <button
                onClick={() => handleLanguageSelect('es')}
                aria-label="Iniciar examen en español"
                style={{
                  padding: '1rem 2rem',
                  fontSize: '1.1rem',
                  border: '2px solid #28a745',
                  borderRadius: '8px',
                  backgroundColor: selectedLanguage === 'es' ? '#28a745' : 'white',
                  color: selectedLanguage === 'es' ? 'white' : '#28a745',
                  cursor: 'pointer',
                  fontWeight: 600,
                  transition: 'all 0.3s ease',
                  minWidth: '150px',
                }}
                onMouseEnter={(e) => {
                  if (selectedLanguage !== 'es') {
                    e.currentTarget.style.backgroundColor = '#f0f0f0';
                  }
                }}
                onMouseLeave={(e) => {
                  if (selectedLanguage !== 'es') {
                    e.currentTarget.style.backgroundColor = 'white';
                  }
                }}
              >
                🇪🇸 {language === 'en' ? 'Spanish' : 'Español'}
              </button>
            </div>

            <button
              onClick={handleCloseLanguagePrompt}
              style={{
                padding: '0.75rem 1.5rem',
                fontSize: '0.95rem',
                border: 'none',
                borderRadius: '6px',
                backgroundColor: '#e9ecef',
                color: '#495057',
                cursor: 'pointer',
                fontWeight: 500,
              }}
            >
              {language === 'en' ? 'Cancel' : 'Cancelar'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default CourseSelection;
