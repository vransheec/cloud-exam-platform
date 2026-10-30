/**
 * Cloud Loading Component
 * 
 * Displays animated clouds while content is loading
 */

import React from 'react';
import { useLanguage } from '../contexts/LanguageContext';

interface CloudLoadingProps {
  message?: string;
}

const CloudLoading: React.FC<CloudLoadingProps> = ({ message }) => {
  const { t } = useLanguage();

  return (
    <div className="loading-container">
      <div className="loading-clouds">
        <div className="cloud cloud-main"></div>
        <div className="cloud cloud-small"></div>
        <div className="cloud cloud-tiny"></div>
      </div>
      <p className="loading-text">{message || t('common.loading')}</p>
    </div>
  );
};

export default CloudLoading;
