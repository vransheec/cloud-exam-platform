/**
 * Auth Callback Page
 * 
 * Handles the OAuth2 callback from Cognito after Google sign-in.
 * Exchanges the authorization code for tokens and redirects to dashboard.
 */

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { UserRole } from '../types/auth';

const AuthCallback: React.FC = () => {
  const navigate = useNavigate();
  const { setAuthData } = useAuth();
  const [error, setError] = useState<string | null>(null);

  const processIdToken = async (idToken: string) => {
    const payload = JSON.parse(atob(idToken.split('.')[1]));
    const userId = payload['cognito:username'] || payload.sub;
    const groups = payload['cognito:groups'] || [];

    let userRole: UserRole = 'student';
    if (groups.includes('operators')) userRole = 'operator';
    else if (groups.includes('assistants')) userRole = 'assistant';

    setAuthData(idToken, userId, userRole);

    switch (userRole) {
      case 'operator': navigate('/operator/dashboard', { replace: true }); break;
      case 'assistant': navigate('/assistant/dashboard', { replace: true }); break;
      default: navigate('/student/dashboard', { replace: true });
    }
  };

  useEffect(() => {
    handleCallback();
  }, []);

  const handleCallback = async () => {
    try {
      // Get the authorization code from URL
      const urlParams = new URLSearchParams(window.location.search);
      const code = urlParams.get('code');
      const errorParam = urlParams.get('error');
      const errorDescription = urlParams.get('error_description');

      // Check for OAuth errors
      if (errorParam) {
        console.error('OAuth error:', errorParam, errorDescription);
        setError(errorDescription || `Authentication error: ${errorParam}`);
        return;
      }

      if (!code) {
        // Maybe the code is in the hash fragment (implicit flow)
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        const idTokenFromHash = hashParams.get('id_token');
        if (idTokenFromHash) {
          await processIdToken(idTokenFromHash);
          return;
        }
        setError('No authorization code received. Please try again.');
        return;
      }

      // Exchange code for tokens
      const cognitoDomain = import.meta.env.VITE_COGNITO_DOMAIN || 'your-cognito-domain';
      const clientId = import.meta.env.VITE_COGNITO_CLIENT_ID;
      const redirectUri = `${window.location.origin}/auth/callback`;

      const tokenResponse = await fetch(
        `https://${cognitoDomain}.auth.us-east-1.amazoncognito.com/oauth2/token`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            grant_type: 'authorization_code',
            client_id: clientId,
            code: code,
            redirect_uri: redirectUri,
          }),
        }
      );

      if (!tokenResponse.ok) {
        const errData = await tokenResponse.text();
        console.error('Token exchange failed:', errData);
        setError('Failed to complete sign-in. Please try again.');
        return;
      }

      const tokens = await tokenResponse.json();
      const idToken = tokens.id_token;

      if (!idToken) {
        setError('No ID token received');
        return;
      }

      await processIdToken(idToken);
    } catch (err) {
      console.error('Auth callback error:', err);
      setError('An error occurred during sign-in. Please try again.');
    }
  };

  if (error) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: '2rem' }}>
        <p style={{ color: '#dc3545', marginBottom: '1rem' }}>{error}</p>
        <button onClick={() => navigate('/login')} style={{ padding: '0.5rem 1rem', cursor: 'pointer' }}>
          Back to Login
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
      <div className="spinner" style={{ width: '40px', height: '40px', border: '4px solid #f3f3f3', borderTop: '4px solid #667eea', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
      <p style={{ marginTop: '1rem', color: '#6c757d' }}>Completing sign-in...</p>
    </div>
  );
};

export default AuthCallback;
