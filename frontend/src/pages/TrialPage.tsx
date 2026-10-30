/**
 * Trial Registration Page
 * 
 * Public page where users can self-register for a free trial exam.
 * Shows available courses and collects user data including phone with country code.
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { login } from '../services/authService';
import logo from '../assets/logo.svg';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

interface TrialCourse {
  code: string;
  name: string;
  provider: string;
  description: string;
  questionCount: number;
}

const COUNTRIES = [
  { code: '+51', flag: '🇵🇪', name: 'Perú' },
  { code: '+52', flag: '🇲🇽', name: 'México' },
  { code: '+57', flag: '🇨🇴', name: 'Colombia' },
  { code: '+56', flag: '🇨🇱', name: 'Chile' },
  { code: '+54', flag: '🇦🇷', name: 'Argentina' },
  { code: '+593', flag: '🇪🇨', name: 'Ecuador' },
  { code: '+58', flag: '🇻🇪', name: 'Venezuela' },
  { code: '+591', flag: '🇧🇴', name: 'Bolivia' },
  { code: '+595', flag: '🇵🇾', name: 'Paraguay' },
  { code: '+598', flag: '🇺🇾', name: 'Uruguay' },
  { code: '+506', flag: '🇨🇷', name: 'Costa Rica' },
  { code: '+507', flag: '🇵🇦', name: 'Panamá' },
  { code: '+503', flag: '🇸🇻', name: 'El Salvador' },
  { code: '+502', flag: '🇬🇹', name: 'Guatemala' },
  { code: '+504', flag: '🇭🇳', name: 'Honduras' },
  { code: '+505', flag: '🇳🇮', name: 'Nicaragua' },
  { code: '+1', flag: '🇺🇸', name: 'USA' },
  { code: '+1', flag: '🇨🇦', name: 'Canada' },
  { code: '+55', flag: '🇧🇷', name: 'Brasil' },
  { code: '+34', flag: '🇪🇸', name: 'España' },
];

const TrialPage: React.FC = () => {
  const navigate = useNavigate();
  const { language, setLanguage, t } = useLanguage();
  const { setAuthData, isAuthenticated } = useAuth();

  const [courses, setCourses] = useState<TrialCourse[]>([]);
  const [loadingCourses, setLoadingCourses] = useState(true);
  const [selectedCourse, setSelectedCourse] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [countryCode, setCountryCode] = useState('+51');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isAuthenticated) navigate('/student/courses', { replace: true });
  }, [isAuthenticated, navigate]);

  useEffect(() => { loadCourses(); }, []);

  const loadCourses = async () => {
    try {
      const resp = await fetch(`${API_BASE_URL}/trial/courses`);
      if (resp.ok) {
        const data = await resp.json();
        setCourses(data.courses || []);
      }
    } catch (err) {
      console.error('Failed to load courses:', err);
    } finally {
      setLoadingCourses(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!name || !email || !password || !selectedCourse || !phone) {
      setError(language === 'en'
        ? 'Please fill in all fields and select a course'
        : 'Por favor completa todos los campos y selecciona un curso');
      return;
    }

    if (password.length < 8) {
      setError(language === 'en'
        ? 'Password must be at least 8 characters'
        : 'La contraseña debe tener al menos 8 caracteres');
      return;
    }

    setSubmitting(true);

    try {
      const resp = await fetch(`${API_BASE_URL}/trial/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name, password, courseCode: selectedCourse, countryCode, phone }),
      });

      const data = await resp.json();

      if (!resp.ok) {
        setError(data.error || (language === 'en' ? 'Registration failed' : 'Error en el registro'));
        return;
      }

      try {
        const loginResp = await login({ email, password });
        setAuthData(loginResp.token, loginResp.userId, loginResp.userType);
        navigate('/student/courses', { replace: true });
      } catch {
        setSuccess(language === 'en'
          ? 'Registration successful! You can now log in with your credentials.'
          : '¡Registro exitoso! Ya puedes iniciar sesión con tus credenciales.');
      }
    } catch {
      setError(language === 'en'
        ? 'An error occurred. Please try again.'
        : 'Ocurrió un error. Por favor intenta de nuevo.');
    } finally {
      setSubmitting(false);
    }
  };

  const grouped = courses.reduce((acc, c) => {
    if (!acc[c.provider]) acc[c.provider] = [];
    acc[c.provider].push(c);
    return acc;
  }, {} as Record<string, TrialCourse[]>);

  const providerLabels: Record<string, string> = {
    AWS: 'Amazon Web Services',
    Azure: 'Microsoft Azure',
    GCP: 'Google Cloud Platform',
  };

  return (
    <div className="login-page">
      <div className="login-container" style={{ maxWidth: '500px' }}>
        <div className="login-header">
          <img src={logo} alt="Cloud Exam Platform" className="login-logo" />
          <h1>Cloud Exam Platform</h1>
          <p style={{ fontSize: '1.1rem', color: '#0d6efd', fontWeight: 600 }}>
            {language === 'en' ? '🎯 Free Trial Exam' : '🎯 Examen de Prueba Gratis'}
          </p>
          <p style={{ fontSize: '0.85rem', color: '#6c757d', marginTop: '0.25rem' }}>
            {language === 'en'
              ? '10 questions • 2 attempts • Full review with explanations'
              : '10 preguntas • 2 intentos • Revisión completa con explicaciones'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          <div className="login-form-header">
            <h2>{language === 'en' ? 'Register for Free Trial' : 'Regístrate para Prueba Gratis'}</h2>
            <button type="button" onClick={() => setLanguage(language === 'en' ? 'es' : 'en')} className="login-lang-toggle">
              {language === 'en' ? '🇺🇸 EN' : '🇪🇸 ES'}
            </button>
          </div>

          {error && <div className="error-message" role="alert">{error}</div>}
          {success && <div style={{ padding: '0.75rem', background: '#d4edda', color: '#155724', borderRadius: '6px', marginBottom: '1rem' }}>{success}</div>}

          <div className="form-group">
            <label htmlFor="trial-name">{language === 'en' ? 'Full Name' : 'Nombre Completo'}</label>
            <input id="trial-name" type="text" value={name} onChange={e => setName(e.target.value)}
              placeholder={language === 'en' ? 'Enter your full name' : 'Ingresa tu nombre completo'}
              disabled={submitting} required />
          </div>

          <div className="form-group">
            <label htmlFor="trial-email">{language === 'en' ? 'Email' : 'Correo Electrónico'}</label>
            <input id="trial-email" type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder={language === 'en' ? 'Enter your email' : 'Ingresa tu correo'}
              disabled={submitting} required />
          </div>

          <div className="form-group">
            <label>{language === 'en' ? 'Phone Number' : 'Número de Teléfono'}</label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <select
                value={countryCode}
                onChange={e => setCountryCode(e.target.value)}
                disabled={submitting}
                style={{ width: '160px', padding: '0.5rem', borderRadius: '6px', border: '1px solid #ced4da', fontSize: '0.95rem' }}
                required
              >
                {COUNTRIES.map((c, i) => (
                  <option key={`${c.code}-${i}`} value={c.code}>
                    {c.flag} {c.code} {c.name}
                  </option>
                ))}
              </select>
              <input
                type="tel"
                value={phone}
                onChange={e => setPhone(e.target.value.replace(/\D/g, ''))}
                placeholder={language === 'en' ? 'Phone number' : 'Número de teléfono'}
                disabled={submitting}
                required
                style={{ flex: 1, padding: '0.5rem', borderRadius: '6px', border: '1px solid #ced4da', fontSize: '0.95rem' }}
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="trial-password">{language === 'en' ? 'Password' : 'Contraseña'}</label>
            <input id="trial-password" type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder={language === 'en' ? 'Min. 8 characters' : 'Mín. 8 caracteres'}
              disabled={submitting} required minLength={8} />
          </div>

          <div className="form-group">
            <label>{language === 'en' ? 'Select a Course' : 'Selecciona un Curso'}</label>
            {loadingCourses ? (
              <p style={{ color: '#6c757d', fontSize: '0.9rem' }}>{language === 'en' ? 'Loading courses...' : 'Cargando cursos...'}</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {Object.entries(grouped).map(([provider, provCourses]) => (
                  <div key={provider}>
                    <p style={{ fontSize: '0.75rem', color: '#6c757d', margin: '0.5rem 0 0.25rem', fontWeight: 600 }}>
                      {providerLabels[provider] || provider}
                    </p>
                    {provCourses.map(c => (
                      <label key={c.code} style={{
                        display: 'flex', alignItems: 'center', gap: '0.5rem',
                        padding: '0.6rem 0.75rem', borderRadius: '8px', cursor: 'pointer',
                        border: selectedCourse === c.code ? '2px solid #0d6efd' : '1px solid #dee2e6',
                        background: selectedCourse === c.code ? '#e8f4fd' : '#fff',
                      }}>
                        <input type="radio" name="course" value={c.code}
                          checked={selectedCourse === c.code}
                          onChange={() => setSelectedCourse(c.code)}
                          disabled={submitting} />
                        <div>
                          <span style={{ fontWeight: 600 }}>{c.code}</span>
                          <span style={{ color: '#6c757d', fontSize: '0.85rem', marginLeft: '0.5rem' }}>{c.name}</span>
                          <span style={{ color: '#0d6efd', fontSize: '0.75rem', marginLeft: '0.5rem' }}>({c.questionCount} {language === 'en' ? 'questions' : 'preguntas'})</span>
                        </div>
                      </label>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>

          <button type="submit" className="login-button" disabled={submitting || !selectedCourse || !phone}>
            {submitting
              ? (language === 'en' ? 'Registering...' : 'Registrando...')
              : (language === 'en' ? '🚀 Start Free Trial' : '🚀 Iniciar Prueba Gratis')}
          </button>
        </form>

        <div className="login-footer">
          <p>
            {language === 'en' ? 'Already have an account?' : '¿Ya tienes cuenta?'}{' '}
            <a href="/login" onClick={e => { e.preventDefault(); navigate('/login'); }}>
              {language === 'en' ? 'Log in' : 'Iniciar sesión'}
            </a>
          </p>
          <p>
            <a href="https://exam.example.com" target="_blank" rel="noopener noreferrer">{t('header.visitSite')}</a>
          </p>
        </div>
      </div>
    </div>
  );
};

export default TrialPage;
