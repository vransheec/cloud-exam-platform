/**
 * Authentication Context
 * 
 * Provides authentication state and methods throughout the application.
 * Manages user authentication status using AWS Cognito, token storage, and user information.
 */

import React, { createContext, useContext, useState, useEffect, useRef, useCallback, ReactNode } from 'react';
import { User, UserRole } from '../types/auth';
import { getCurrentUser, getCurrentSession, refreshSession, logout as cognitoLogout } from '../services/authService';

interface AuthContextType {
  isAuthenticated: boolean;
  user: User | null;
  token: string | null;
  loading: boolean;
  setAuthData: (token: string, userId: string, userRole: UserRole) => void;
  clearAuth: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

/**
 * Authentication Provider Component
 * Wraps the application to provide authentication state using Cognito
 */
export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Schedules a token refresh 5 minutes before expiration
   */
  const scheduleTokenRefresh = useCallback((idTokenJwt: string) => {
    // Clear any existing timer
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }

    try {
      // Decode token to get expiration
      const payload = JSON.parse(atob(idTokenJwt.split('.')[1]));
      const exp = payload.exp * 1000; // Convert to ms
      const now = Date.now();
      const refreshIn = exp - now - (5 * 60 * 1000); // 5 minutes before expiry

      if (refreshIn <= 0) {
        // Token already expired or about to expire, refresh now
        performTokenRefresh();
        return;
      }

      console.log(`Token refresh scheduled in ${Math.round(refreshIn / 60000)} minutes`);
      refreshTimerRef.current = setTimeout(() => {
        performTokenRefresh();
      }, refreshIn);
    } catch (e) {
      console.warn('Could not schedule token refresh:', e);
    }
  }, []);

  /**
   * Performs the actual token refresh via Cognito
   */
  const performTokenRefresh = async () => {
    try {
      const newSession = await refreshSession();
      if (newSession && newSession.isValid()) {
        const idToken = newSession.getIdToken();
        const newJwt = idToken.getJwtToken();

        localStorage.setItem('authToken', newJwt);
        setToken(newJwt);
        console.log('Token refreshed successfully');

        // Schedule next refresh
        scheduleTokenRefresh(newJwt);
      }
    } catch (error) {
      console.error('Token refresh failed:', error);
      // Don't clear auth — the user might still have a valid session
      // The next API call will fail with 401 and the user will be redirected to login
    }
  };

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
      }
    };
  }, []);

  /**
   * Checks for existing Cognito session on mount
   */
  useEffect(() => {
    checkAuth();
  }, []);

  /**
   * Checks if user is authenticated by verifying Cognito session
   */
  const checkAuth = async () => {
    try {
      const session = await getCurrentSession();
      
      if (session && session.isValid()) {
        const idToken = session.getIdToken();
        const idTokenJwt = idToken.getJwtToken();
        const payload = idToken.payload;
        
        // Get user info from ID token
        const userId = payload['cognito:username'] || payload.email;
        const groups = payload['cognito:groups'] || [];
        
        // Determine role from groups
        let userRole: UserRole = 'student';
        if (groups.includes('operators')) userRole = 'operator';
        else if (groups.includes('assistants')) userRole = 'assistant';
        
        // Store in localStorage for persistence
        localStorage.setItem('authToken', idTokenJwt);
        localStorage.setItem('userId', userId);
        localStorage.setItem('userRole', userRole);
        
        setToken(idTokenJwt);
        setIsAuthenticated(true);
        
        // Schedule automatic token refresh before expiration
        scheduleTokenRefresh(idTokenJwt);
        
        // Fetch full user data from backend
        try {
          const userData = await getCurrentUser(idTokenJwt);
          setUser(userData);
        } catch (error) {
          console.error('Failed to fetch user data:', error);
          // Continue with basic info from token
        }
      } else {
        // Cognito SDK session not found - check localStorage fallback (for OAuth/Google users)
        const storedToken = localStorage.getItem('authToken');
        if (storedToken) {
          try {
            const payload = JSON.parse(atob(storedToken.split('.')[1]));
            const exp = payload.exp * 1000;
            if (exp > Date.now()) {
              // Token still valid
              const userId = payload['cognito:username'] || payload.sub;
              const groups = payload['cognito:groups'] || [];
              let userRole: UserRole = 'student';
              if (groups.includes('operators')) userRole = 'operator';
              else if (groups.includes('assistants')) userRole = 'assistant';

              setToken(storedToken);
              setIsAuthenticated(true);
              scheduleTokenRefresh(storedToken);

              setUser({
                userId,
                email: payload.email || userId,
                role: userRole,
              });
            } else {
              clearAuth();
            }
          } catch {
            clearAuth();
          }
        } else {
          clearAuth();
        }
      }
    } catch (error) {
      console.error('Auth check error:', error);
      clearAuth();
    } finally {
      setLoading(false);
    }
  };

  /**
   * Sets authentication data after successful login
   */
  const setAuthData = (newToken: string, userId: string, userRole: UserRole) => {
    localStorage.setItem('authToken', newToken);
    localStorage.setItem('userId', userId);
    localStorage.setItem('userRole', userRole);
    
    setToken(newToken);
    setIsAuthenticated(true);
    
    // Schedule automatic token refresh
    scheduleTokenRefresh(newToken);
    
    // Fetch full user data (non-blocking, don't fail auth if this fails)
    refreshUser().catch(err => {
      console.warn('Could not fetch full user data:', err);
      // Set basic user info from token if backend call fails
      setUser({
        userId: userId,
        email: userId, // Use userId as email fallback
        role: userRole,
      });
    });
  };

  /**
   * Clears all authentication data and signs out from Cognito
   */
  const clearAuth = () => {
    // Clear refresh timer
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
    
    // Sign out from Cognito
    cognitoLogout('').catch(err => console.error('Cognito logout error:', err));
    
    // Clear local storage
    localStorage.removeItem('authToken');
    localStorage.removeItem('userId');
    localStorage.removeItem('userRole');
    
    setToken(null);
    setUser(null);
    setIsAuthenticated(false);
  };

  /**
   * Refreshes user data from the server
   */
  const refreshUser = async () => {
    const currentToken = token || localStorage.getItem('authToken');
    if (currentToken) {
      try {
        const userData = await getCurrentUser(currentToken);
        setUser(userData);
      } catch (error) {
        console.error('Failed to refresh user data:', error);
        // Don't clear auth - user might not exist in backend yet
        // Just log the error and continue with token-based auth
      }
    }
  };

  const value: AuthContextType = {
    isAuthenticated,
    user,
    token,
    loading,
    setAuthData,
    clearAuth,
    refreshUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

/**
 * Hook to use authentication context
 * Must be used within AuthProvider
 */
export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
