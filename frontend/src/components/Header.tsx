/**
 * Header Component
 * 
 * Displays the application header with user info and logout button.
 * Shows different navigation options based on user role.
 * Mobile: Shows hamburger menu with role-specific navigation.
 */

import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { UserRole } from '../types/auth';
import { logout } from '../services/authService';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import logo from '../assets/logo.svg';
import whatsappIcon from '../assets/whatsapp.webp';

interface HeaderProps {
  userRole: UserRole;
  userName?: string;
  userEmail?: string;
}

const Header: React.FC<HeaderProps> = ({ userRole, userName, userEmail }) => {
  const navigate = useNavigate();
  const { clearAuth } = useAuth();
  const { language, setLanguage, t } = useLanguage();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('darkMode');
    if (saved !== null) return saved === 'true';
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  React.useEffect(() => {
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light');
    localStorage.setItem('darkMode', String(darkMode));
  }, [darkMode]);

  /**
   * Handles user logout
   * Clears authentication data and redirects to login
   */
  const handleLogout = async () => {
    try {
      const token = localStorage.getItem('authToken');
      if (token) {
        await logout(token);
      }
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      // Clear authentication data using AuthContext
      clearAuth();
      
      // Redirect to login page
      navigate('/login', { replace: true });
    }
  };

  const toggleLanguage = () => {
    setLanguage(language === 'en' ? 'es' : 'en');
  };

  /**
   * Gets navigation links based on user role
   */
  const getNavigationLinks = () => {
    switch (userRole) {
      case 'operator':
        return (
          <>
            <li><Link to="/operator/dashboard">{t('nav.dashboard')}</Link></li>
          </>
        );
      case 'assistant':
        return (
          <>
            <li><Link to="/assistant/dashboard">{t('nav.dashboard')}</Link></li>
            <li><Link to="/assistant/questions">{t('nav.questions')}</Link></li>
          </>
        );
      case 'student':
        return (
          <>
            <li><Link to="/student/courses">{t('nav.myCourses')}</Link></li>
            <li><Link to="/student/history">{t('nav.examHistory')}</Link></li>
          </>
        );
      default:
        return null;
    }
  };

  /**
   * Gets mobile navigation items based on user role
   */
  const getMobileNavItems = () => {
    const items: { label: string; path: string }[] = [];
    
    switch (userRole) {
      case 'operator':
        items.push({ label: t('nav.dashboard'), path: '/operator/dashboard' });
        break;
      case 'assistant':
        items.push({ label: t('nav.dashboard'), path: '/assistant/dashboard' });
        items.push({ label: t('nav.questions'), path: '/assistant/questions' });
        break;
      case 'student':
        items.push({ label: t('nav.myCourses'), path: '/student/courses' });
        items.push({ label: t('nav.examHistory'), path: '/student/history' });
        break;
    }
    
    return items;
  };

  const handleMobileNavClick = (path: string) => {
    setMobileMenuOpen(false);
    navigate(path);
  };

  const handleMobileLogout = () => {
    setMobileMenuOpen(false);
    handleLogout();
  };

  return (
    <header className="app-header">
      <div className="header-content">
        <div className="header-brand">
          <img src={logo} alt="Cloud Exam Platform" className="header-logo" />
          <div className="header-text">
            <h1 className="header-title">Cloud Exam Platform</h1>
            <p className="header-subtitle">{t('header.subtitle')}</p>
          </div>
        </div>

        {/* Mobile hamburger button */}
        <button 
          className="mobile-menu-btn"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label="Toggle menu"
        >
          <span className="hamburger-line"></span>
          <span className="hamburger-line"></span>
          <span className="hamburger-line"></span>
        </button>
        
        {/* Desktop navigation */}
        <nav className="header-nav desktop-nav">
          <ul className="nav-links">
            {getNavigationLinks()}
          </ul>
          
          <div className="user-info">
            <button 
              onClick={toggleLanguage}
              className="lang-toggle"
              title={language === 'en' ? 'Cambiar a Español' : 'Switch to English'}
            >
              {language === 'en' ? '🇺🇸 EN' : '🇪🇸 ES'}
            </button>
            <button
              onClick={() => setDarkMode(!darkMode)}
              className="lang-toggle"
              title={darkMode ? 'Light mode' : 'Dark mode'}
            >
              {darkMode ? '☀️' : '🌙'}
            </button>
            <span className="user-name">
              {userName || userEmail || 'User'}
            </span>
            <div className="role-container">
              <span className="role-label">{t('header.role')}</span>
              <span className="user-role-badge">{userRole}</span>
            </div>
            <button 
              onClick={handleLogout}
              className="logout-button"
            >
              {t('header.logout')}
            </button>
          </div>
        </nav>

        {/* Mobile navigation menu */}
        <div 
          className={`mobile-menu-overlay ${mobileMenuOpen ? 'open' : ''}`} 
          onClick={() => setMobileMenuOpen(false)}
        >
          <nav className="mobile-menu" onClick={(e) => e.stopPropagation()}>
            <div className="mobile-menu-header">
              <span className="mobile-user-name">{userName || userEmail || 'User'}</span>
              <span className="mobile-role-badge">{userRole}</span>
            </div>
            
            <button 
              onClick={toggleLanguage}
              className="mobile-lang-toggle"
            >
              {language === 'en' ? '🇺🇸 English' : '🇪🇸 Español'}
            </button>
            <button
              onClick={() => setDarkMode(!darkMode)}
              className="mobile-lang-toggle"
            >
              {darkMode ? '☀️ Light Mode' : '🌙 Dark Mode'}
            </button>
            
            <ul className="mobile-nav-links">
              {getMobileNavItems().map((item) => (
                <li key={item.path}>
                  <button onClick={() => handleMobileNavClick(item.path)}>
                    {item.label}
                  </button>
                </li>
              ))}
            </ul>
            
            <button 
              onClick={handleMobileLogout}
              className="mobile-logout-btn"
            >
              {t('header.logout')}
            </button>
          </nav>
        </div>
      </div>
      
      <div className="header-footer">
        <div className="footer-content">
          <a href="https://exam.example.com" target="_blank" rel="noopener noreferrer" className="footer-link">{t('header.visitSite')}</a>
          <span className="separator">|</span>
          <span className="footer-promo">{t('header.needMoreTime')}</span>
          <a 
            href="https://wa.me/000000000000?text=Necesito%20dos%20semanas%20m%C3%A1s%20de%20tiempo%20al%20simulador%20por%2014%20USD" 
            target="_blank" 
            rel="noopener noreferrer" 
            className="whatsapp-btn"
          >
            <img src={whatsappIcon} alt="WhatsApp" className="whatsapp-btn-icon" />
          </a>
        </div>
      </div>
    </header>
  );
};

export default Header;
