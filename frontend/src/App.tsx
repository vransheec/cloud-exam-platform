/**
 * Root Application Component
 * 
 * Sets up routing, authentication context, and main application structure.
 * Handles navigation between login and role-specific dashboards.
 */

import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ToastProvider } from './contexts/ToastContext';
import { LanguageProvider } from './contexts/LanguageContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import TrialPage from './pages/TrialPage';
import AuthCallback from './pages/AuthCallback';
import OperatorDashboard from './pages/OperatorDashboard';
import AssistantDashboard from './pages/AssistantDashboard';
import StudentDashboard from './pages/StudentDashboard';
import ErrorBoundary from './components/ErrorBoundary';
import CloudLoading from './components/CloudLoading';

/**
 * Main App Routes Component
 * Defines all application routes with authentication protection
 * Fixed to prevent navigation throttling by avoiding redirect loops
 */
const AppRoutes: React.FC = () => {
  const { isAuthenticated, user, loading } = useAuth();

  // Show loading state while checking authentication
  if (loading) {
    return <CloudLoading />;
  }

  return (
    <Routes>
      {/* Public route - Login */}
      <Route 
        path="/login" 
        element={
          isAuthenticated && user ? (
            user.role === 'student' ? (
              <Navigate to="/student/courses" replace />
            ) : (
              <Navigate to={`/${user.role}/dashboard`} replace />
            )
          ) : (
            <LoginPage />
          )
        } 
      />

      {/* Public route - Trial Registration */}
      <Route 
        path="/trial" 
        element={
          isAuthenticated && user ? (
            <Navigate to="/student/courses" replace />
          ) : (
            <TrialPage />
          )
        } 
      />

      {/* Public route - OAuth Callback */}
      <Route path="/auth/callback" element={<AuthCallback />} />

      {/* Protected routes - Operator */}
      <Route
        path="/operator/dashboard"
        element={
          <ProtectedRoute allowedRoles={['operator']}>
            <Layout 
              userRole="operator" 
              userName={user?.name} 
              userEmail={user?.email}
            >
              <OperatorDashboard />
            </Layout>
          </ProtectedRoute>
        }
      />

      {/* Protected routes - Assistant */}
      <Route
        path="/assistant/dashboard"
        element={
          <ProtectedRoute allowedRoles={['assistant', 'operator']}>
            <Layout 
              userRole={user?.role || 'assistant'} 
              userName={user?.name} 
              userEmail={user?.email}
            >
              <AssistantDashboard />
            </Layout>
          </ProtectedRoute>
        }
      />

      {/* Protected routes - Student */}
      <Route
        path="/student/dashboard"
        element={
          <ProtectedRoute allowedRoles={['student']}>
            <Layout 
              userRole="student" 
              userName={user?.name} 
              userEmail={user?.email}
            >
              <StudentDashboard />
            </Layout>
          </ProtectedRoute>
        }
      />
      
      <Route
        path="/student/courses"
        element={
          <ProtectedRoute allowedRoles={['student']}>
            <Layout 
              userRole="student" 
              userName={user?.name} 
              userEmail={user?.email}
            >
              <StudentDashboard />
            </Layout>
          </ProtectedRoute>
        }
      />
      
      <Route
        path="/student/history"
        element={
          <ProtectedRoute allowedRoles={['student']}>
            <Layout 
              userRole="student" 
              userName={user?.name} 
              userEmail={user?.email}
            >
              <StudentDashboard />
            </Layout>
          </ProtectedRoute>
        }
      />

      {/* Default route - redirect based on authentication */}
      <Route
        path="/"
        element={
          isAuthenticated && user ? (
            user.role === 'student' ? (
              <Navigate to="/student/courses" replace />
            ) : (
              <Navigate to={`/${user.role}/dashboard`} replace />
            )
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />

      {/* Catch all - redirect to home */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

/**
 * Root App Component
 * Wraps the application with necessary providers and error boundary
 */
function App() {
  return (
    <ErrorBoundary>
      <LanguageProvider>
        <BrowserRouter>
          <AuthProvider>
            <ToastProvider>
              <AppRoutes />
            </ToastProvider>
          </AuthProvider>
        </BrowserRouter>
      </LanguageProvider>
    </ErrorBoundary>
  );
}

export default App;
