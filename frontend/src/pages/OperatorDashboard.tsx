/**
 * Operator Dashboard Page
 * 
 * Main dashboard for operators to manage students, enrollments, and system settings.
 * Provides tabbed interface for different management functions.
 */

import React, { useState } from 'react';
import StudentManagement from '../components/StudentManagement';
import EnrollmentManagement from '../components/EnrollmentManagement';
import SiteAvailability from '../components/SiteAvailability';
import CourseManagement from '../components/CourseManagement';
import AssistantManagement from '../components/AssistantManagement';

type TabType = 'students' | 'enrollments' | 'courses' | 'assistants' | 'availability';

const OperatorDashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('students');
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);

  const handleStudentSelect = (studentId: string) => {
    setSelectedStudentId(studentId);
    setActiveTab('enrollments');
  };

  const handleBackToStudents = () => {
    setSelectedStudentId(null);
    setActiveTab('students');
  };

  return (
    <div className="dashboard operator-dashboard">
      <h1>Operator Dashboard</h1>
      <p>Welcome to the operator console. Manage students, enrollments, and system settings.</p>

      {/* Tab Navigation */}
      <div className="tab-navigation">
        <button
          className={`tab-button ${activeTab === 'students' ? 'active' : ''}`}
          onClick={() => {
            setActiveTab('students');
            setSelectedStudentId(null);
          }}
        >
          Student Management
        </button>
        <button
          className={`tab-button ${activeTab === 'enrollments' ? 'active' : ''}`}
          onClick={() => setActiveTab('enrollments')}
          disabled={!selectedStudentId}
        >
          Enrollment Management
          {selectedStudentId && ' *'}
        </button>
        <button
          className={`tab-button ${activeTab === 'courses' ? 'active' : ''}`}
          onClick={() => {
            setActiveTab('courses');
            setSelectedStudentId(null);
          }}
        >
          Course Management
        </button>
        <button
          className={`tab-button ${activeTab === 'assistants' ? 'active' : ''}`}
          onClick={() => {
            setActiveTab('assistants');
            setSelectedStudentId(null);
          }}
        >
          Assistant Management
        </button>
        <button
          className={`tab-button ${activeTab === 'availability' ? 'active' : ''}`}
          onClick={() => {
            setActiveTab('availability');
            setSelectedStudentId(null);
          }}
        >
          Site Availability
        </button>
      </div>

      {/* Tab Content */}
      <div className="tab-content">
        {activeTab === 'students' && (
          <StudentManagement onStudentSelect={handleStudentSelect} />
        )}

        {activeTab === 'enrollments' && selectedStudentId && (
          <EnrollmentManagement
            studentId={selectedStudentId}
            onBack={handleBackToStudents}
          />
        )}

        {activeTab === 'enrollments' && !selectedStudentId && (
          <div className="empty-state">
            <p>Please select a student from the Student Management tab to manage enrollments.</p>
          </div>
        )}

        {activeTab === 'courses' && <CourseManagement />}

        {activeTab === 'assistants' && <AssistantManagement />}

        {activeTab === 'availability' && <SiteAvailability />}
      </div>
    </div>
  );
};

export default OperatorDashboard;
