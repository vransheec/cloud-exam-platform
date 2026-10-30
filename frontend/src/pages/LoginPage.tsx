/**
 * Login Page V2 — Unified Login + Registration
 * 
 * Single page with two tabs: Login and Register.
 * Both support email/password and Google sign-in.
 * Registration messaging emphasizes free trial access.
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { login } from '../services/authService';
import { UserRole } from '../types/auth';
import logo from '../assets/logo.svg';

type TabType = 'login' | 'register';

const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const { setAuthData } = useAuth();
  const { language, setLanguage } = useLanguage();
  
  const [activeTab, setActiveTab] = useState<TabType>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const toggleLanguage = () => setLanguage(language === 'en' ? 'es' : 'en');

  const redirectToDashboard = (role: UserRole) => {
    switch (role) {
      case 'operator': navigate('/operator/dashboard'); break;
      case 'assistant': navigate('/assistant/dashboard'); break;
      default: navigate('/student/dashboard');
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!email || !password) {
      setError(language === 'en' ? 'Please enter email and password' : 'Ingresa correo y contraseña');
      return;
    }
    setIsLoading(true);
    try {
      const response = await login({ email, password });
      setAuthData(response.token, response.userId, response.userType);
      redirectToDashboard(response.userType);
    } catch (err) {
      setError(err instanceof Error ? err.message : (language === 'en' ? 'Login failed' : 'Error al iniciar sesión'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!email || !password || !name) {
      setError(language === 'en' ? 'Please fill all fields' : 'Completa todos los campos');
      return;
    }
    if (password.length < 8) {
      setError(language === 'en' ? 'Password must be at least 8 characters' : 'La contraseña debe tener al menos 8 caracteres');
      return;
    }
    setIsLoading(true);
    try {
      // Call trial register endpoint to create account + trial enrollment
      const apiUrl = import.meta.env.VITE_API_BASE_URL;
      const response = await fetch(`${apiUrl}/trial/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name, password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Registration failed');
      
      // Auto-login after registration
      const loginResponse = await login({ email, password });
      setAuthData(loginResponse.token, loginResponse.userId, loginResponse.userType);
      redirectToDashboard(loginResponse.userType);
    } catch (err) {
      setError(err instanceof Error ? err.message : (language === 'en' ? 'Registration failed' : 'Error al registrarse'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = () => {
    const cognitoDomain = import.meta.env.VITE_COGNITO_DOMAIN || 'your-cognito-domain';
    const clientId = import.meta.env.VITE_COGNITO_CLIENT_ID;
    const redirectUri = encodeURIComponent(`${window.location.origin}/auth/callback`);
    const googleUrl = `https://${cognitoDomain}.auth.us-east-1.amazoncognito.com/oauth2/authorize?identity_provider=Google&redirect_uri=${redirectUri}&response_type=code&client_id=${clientId}&scope=openid+email+profile`;
    window.location.href = googleUrl;
  };

  return (
    <div className="login-page">
      <div className="login-container" style={{ maxWidth: '420px', padding: '2rem' }}>
        {/* Header */}
        <div className="login-header">
          <img src={logo} alt="Cloud Exam Platform" className="login-logo" />
          <h1 style={{ fontSize: '1.4rem', margin: '0.5rem 0 0.25rem' }}>Cloud Exam Platform</h1>
          <p style={{ color: '#6c757d', fontSize: '0.85rem', margin: 0 }}>
            {language === 'en' ? 'Cloud Certification Exam Simulator' : 'Simulador de Exámenes de Certificación Cloud'}
          </p>
        </div>

        {/* Language toggle */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.5rem', paddingRight: '0.25rem' }}>
          <button onClick={toggleLanguage} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.85rem', color: '#6c757d' }}>
            {language === 'en' ? '🇺🇸 EN' : '🇪🇸 ES'}
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '2px solid #e9ecef', marginBottom: '1.25rem' }}>
          <button
            onClick={() => { setActiveTab('login'); setError(''); }}
            style={{
              flex: 1, padding: '0.75rem', border: 'none', background: 'none', cursor: 'pointer',
              fontWeight: 600, fontSize: '0.95rem',
              color: activeTab === 'login' ? '#0d6efd' : '#6c757d',
              borderBottom: activeTab === 'login' ? '2px solid #0d6efd' : '2px solid transparent',
              marginBottom: '-2px',
            }}
          >
            {language === 'en' ? 'Sign In' : 'Iniciar Sesión'}
          </button>
          <button
            onClick={() => { setActiveTab('register'); setError(''); }}
            style={{
              flex: 1, padding: '0.75rem', border: 'none', background: 'none', cursor: 'pointer',
              fontWeight: 600, fontSize: '0.95rem',
              color: activeTab === 'register' ? '#0d6efd' : '#6c757d',
              borderBottom: activeTab === 'register' ? '2px solid #0d6efd' : '2px solid transparent',
              marginBottom: '-2px',
            }}
          >
            {language === 'en' ? 'Register Free' : 'Registrarse Gratis'}
          </button>
        </div>

        {/* Free trial badge - only on register tab */}
        {activeTab === 'register' && (
          <div style={{
            background: 'linear-gradient(135deg, #d4edda 0%, #c3e6cb 100%)',
            border: '1px solid #28a745',
            borderRadius: '8px',
            padding: '0.75rem 1rem',
            marginBottom: '1rem',
            marginLeft: '0',
            marginRight: '0',
            textAlign: 'center',
          }}>
            <span style={{ fontSize: '1.1rem' }}>🎓 </span>
            <strong style={{ color: '#155724', fontSize: '0.9rem' }}>
              {language === 'en' ? 'Free access — No credit card required' : 'Acceso gratuito — Sin tarjeta de crédito'}
            </strong>
            <p style={{ margin: '0.25rem 0 0', fontSize: '0.78rem', color: '#155724' }}>
              {language === 'en' 
                ? 'Practice with real exam questions from AWS, Azure & GCP'
                : 'Practica con preguntas reales de exámenes AWS, Azure y GCP'}
            </p>
          </div>
        )}

        {/* Error */}
        {error && (
          <div style={{ background: '#f8d7da', color: '#721c24', padding: '0.75rem', borderRadius: '6px', marginBottom: '1rem', fontSize: '0.9rem' }}>
            {error}
          </div>
        )}

        {/* Google button - always visible */}
        <button
          onClick={handleGoogleSignIn}
          disabled={isLoading}
          style={{
            width: '100%', padding: '0.75rem', border: '2px solid #4285F4', borderRadius: '8px',
            background: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center',
            justifyContent: 'center', gap: '0.75rem', fontSize: '0.95rem', fontWeight: 600,
            color: '#3c4043',
            boxSizing: 'border-box',
            transition: 'background 0.2s, box-shadow 0.2s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = '#f0f4ff'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(66,133,244,0.3)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'white'; e.currentTarget.style.boxShadow = 'none'; }}
        >
          <svg width="18" height="18" viewBox="0 0 18 18">
            <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" fill="#4285F4"/>
            <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
            <path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
            <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
          </svg>
          {activeTab === 'login'
            ? (language === 'en' ? 'Sign in with Google' : 'Iniciar sesión con Google')
            : (language === 'en' ? 'Register with Google' : 'Registrarse con Google')}
        </button>

        {/* Divider */}
        <div style={{ display: 'flex', alignItems: 'center', margin: '0.75rem 0', gap: '0.75rem' }}>
          <div style={{ flex: 1, height: '1px', background: '#dee2e6' }}></div>
          <span style={{ color: '#adb5bd', fontSize: '0.8rem' }}>
            {language === 'en' ? 'or with email' : 'o con correo'}
          </span>
          <div style={{ flex: 1, height: '1px', background: '#dee2e6' }}></div>
        </div>

        {/* Login Form */}
        {activeTab === 'login' && (
          <form onSubmit={handleLogin}>
            <div className="form-group" style={{ marginBottom: '0.75rem' }}>
              <input
                type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder={language === 'en' ? 'Email' : 'Correo electrónico'}
                disabled={isLoading} required
                style={{ width: '100%', padding: '0.7rem', borderRadius: '6px', border: '1px solid #ced4da', fontSize: '0.95rem', boxSizing: 'border-box' }}
              />
            </div>
            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <input
                type="password" value={password} onChange={e => setPassword(e.target.value)}
                placeholder={language === 'en' ? 'Password' : 'Contraseña'}
                disabled={isLoading} required
                style={{ width: '100%', padding: '0.7rem', borderRadius: '6px', border: '1px solid #ced4da', fontSize: '0.95rem', boxSizing: 'border-box' }}
              />
            </div>
            <button type="submit" disabled={isLoading} style={{
              width: '100%', padding: '0.75rem', borderRadius: '8px', border: 'none',
              background: '#0d6efd', color: 'white', fontWeight: 600, fontSize: '0.95rem',
              cursor: 'pointer', opacity: isLoading ? 0.7 : 1,
              boxSizing: 'border-box',
            }}>
              {isLoading ? '...' : (language === 'en' ? 'Sign In' : 'Iniciar Sesión')}
            </button>
          </form>
        )}

        {/* Register Form */}
        {activeTab === 'register' && (
          <form onSubmit={handleRegister}>
            <div className="form-group" style={{ marginBottom: '0.75rem' }}>
              <input
                type="text" value={name} onChange={e => setName(e.target.value)}
                placeholder={language === 'en' ? 'Full name' : 'Nombre completo'}
                disabled={isLoading} required
                style={{ width: '100%', padding: '0.7rem', borderRadius: '6px', border: '1px solid #ced4da', fontSize: '0.95rem', boxSizing: 'border-box' }}
              />
            </div>
            <div className="form-group" style={{ marginBottom: '0.75rem' }}>
              <input
                type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder={language === 'en' ? 'Email' : 'Correo electrónico'}
                disabled={isLoading} required
                style={{ width: '100%', padding: '0.7rem', borderRadius: '6px', border: '1px solid #ced4da', fontSize: '0.95rem', boxSizing: 'border-box' }}
              />
            </div>
            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <input
                type="password" value={password} onChange={e => setPassword(e.target.value)}
                placeholder={language === 'en' ? 'Password (min 8 characters)' : 'Contraseña (mín 8 caracteres)'}
                disabled={isLoading} required minLength={8}
                title={language === 'en' 
                  ? 'Must contain: 8+ characters, uppercase, lowercase, number, and special character (!@#$%)'
                  : 'Debe contener: 8+ caracteres, mayúscula, minúscula, número y carácter especial (!@#$%)'}
                style={{ width: '100%', padding: '0.7rem', borderRadius: '6px', border: '1px solid #ced4da', fontSize: '0.95rem', boxSizing: 'border-box' }}
              />
              <p style={{ margin: '0.3rem 0 0', fontSize: '0.72rem', color: '#6c757d' }}>
                {language === 'en' 
                  ? 'Min 8 chars, uppercase, lowercase, number & special character'
                  : 'Mín 8 caracteres, mayúscula, minúscula, número y carácter especial'}
              </p>
            </div>
            <button type="submit" disabled={isLoading} style={{
              width: '100%', padding: '0.75rem', borderRadius: '8px', border: 'none',
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              color: 'white', fontWeight: 600, fontSize: '0.95rem',
              cursor: 'pointer', opacity: isLoading ? 0.7 : 1,
              boxSizing: 'border-box',
            }}>
              {isLoading ? '...' : (language === 'en' ? 'Create Free Account' : 'Crear Cuenta Gratis')}
            </button>
          </form>
        )}

        {/* Footer */}
        <p style={{ textAlign: 'center', marginTop: '1.25rem', fontSize: '0.8rem', color: '#adb5bd' }}>
          {language === 'en' 
            ? 'Practice exams for AWS, Azure & GCP certifications'
            : 'Exámenes de práctica para certificaciones AWS, Azure y GCP'}
        </p>
      </div>
    </div>
  );
};

export default LoginPage;
