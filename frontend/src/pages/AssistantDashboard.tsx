/**
 * Assistant Dashboard Page
 * 
 * Main dashboard for assistants to manage exam questions, create students, and manage courses.
 */

import React, { useState } from 'react';
import QuestionManagement from '../components/QuestionManagement';
import AssistantStudentManagement from '../components/AssistantStudentManagement';
import AssistantCourseManagement from '../components/AssistantCourseManagement';

const AssistantDashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'questions' | 'students' | 'courses'>('questions');

  return (
    <div className="dashboard">
      <h1>Assistant Dashboard</h1>
      <p>Welcome to the assistant console. Manage exam questions, students, and courses.</p>
      
      <div className="tabs" style={{ marginBottom: '2rem' }}>
        <button
          className={activeTab === 'questions' ? 'active' : ''}
          onClick={() => setActiveTab('questions')}
          style={{
            padding: '0.5rem 1rem',
            marginRight: '0.5rem',
            backgroundColor: activeTab === 'questions' ? '#007bff' : '#f0f0f0',
            color: activeTab === 'questions' ? 'white' : 'black',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          Question Management
        </button>
        <button
          className={activeTab === 'students' ? 'active' : ''}
          onClick={() => setActiveTab('students')}
          style={{
            padding: '0.5rem 1rem',
            marginRight: '0.5rem',
            backgroundColor: activeTab === 'students' ? '#007bff' : '#f0f0f0',
            color: activeTab === 'students' ? 'white' : 'black',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          Student Management
        </button>
        <button
          className={activeTab === 'courses' ? 'active' : ''}
          onClick={() => setActiveTab('courses')}
          style={{
            padding: '0.5rem 1rem',
            backgroundColor: activeTab === 'courses' ? '#007bff' : '#f0f0f0',
            color: activeTab === 'courses' ? 'white' : 'black',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          Course Management
        </button>
      </div>
      
      {activeTab === 'questions' && <QuestionManagement />}
      {activeTab === 'students' && <AssistantStudentManagement />}
      {activeTab === 'courses' && <AssistantCourseManagement />}
    </div>
  );
};

export default AssistantDashboard;
