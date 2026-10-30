/**
 * Frontend Entry Point
 * 
 * This is the main entry point for the React application.
 * It renders the root component into the DOM.
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// Render the application
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
