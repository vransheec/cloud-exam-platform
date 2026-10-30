/**
 * Layout Component
 * 
 * Provides the main application layout structure with header and content area.
 * Wraps page content with consistent navigation and styling.
 */

import React from 'react';
import Header from './Header';
import { UserRole } from '../types/auth';

interface LayoutProps {
  userRole: UserRole;
  userName?: string;
  userEmail?: string;
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ 
  userRole, 
  userName, 
  userEmail, 
  children 
}) => {
  return (
    <div className="app-layout">
      <Header 
        userRole={userRole} 
        userName={userName} 
        userEmail={userEmail} 
      />
      <main className="main-content">
        {children}
      </main>
    </div>
  );
};

export default Layout;
