/**
 * Assistant Management Component
 * 
 * Allows operators to create, edit, and delete assistant users.
 */

import React, { useState, useEffect } from 'react';
import {
  getAllAssistants,
  createAssistant,
  updateAssistant,
  deleteAssistant,
  resetAssistantPassword,
  Assistant,
} from '../services/operatorService';

const AssistantManagement: React.FC = () => {
  const [assistants, setAssistants] = useState<Assistant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingAssistant, setEditingAssistant] = useState<Assistant | null>(null);
  const [resettingPasswordAssistant, setResettingPasswordAssistant] = useState<Assistant | null>(null);
  const [selectedAssistant, setSelectedAssistant] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    name: '',
  });

  // Password reset form state
  const [passwordResetData, setPasswordResetData] = useState({
    newPassword: '',
    confirmNewPassword: '',
  });

  // Load assistants on mount
  useEffect(() => {
    loadAssistants();
  }, []);

  const loadAssistants = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getAllAssistants();
      setAssistants(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load assistants');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateAssistant = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate password confirmation
    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    try {
      setError(null);
      setSuccessMessage(null);
      await createAssistant({
        email: formData.email,
        password: formData.password,
        name: formData.name || undefined,
      });
      setFormData({ email: '', password: '', confirmPassword: '', name: '' });
      setShowCreateForm(false);
      setSuccessMessage('Assistant created successfully');
      await loadAssistants();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create assistant';
      if (errorMessage.includes('already exists') || errorMessage.includes('duplicate') || errorMessage.includes('email already exists')) {
        setError('An assistant with this email already exists. Please use a different email address.');
      } else {
        setError(errorMessage);
      }
    }
  };

  const handleUpdateAssistant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAssistant) return;

    try {
      setError(null);
      setSuccessMessage(null);
      await updateAssistant(editingAssistant.id, {
        email: formData.email,
        name: formData.name || undefined,
      });
      setFormData({ email: '', password: '', confirmPassword: '', name: '' });
      setEditingAssistant(null);
      setSuccessMessage('Assistant updated successfully');
      await loadAssistants();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update assistant');
    }
  };


  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resettingPasswordAssistant) return;

    // Validate password confirmation
    if (passwordResetData.newPassword !== passwordResetData.confirmNewPassword) {
      setError('Passwords do not match');
      return;
    }

    // Validate password length
    if (passwordResetData.newPassword.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    try {
      setError(null);
      setSuccessMessage(null);
      await resetAssistantPassword(resettingPasswordAssistant.id, passwordResetData.newPassword);
      setSuccessMessage('Password reset successfully');
      setResettingPasswordAssistant(null);
      setPasswordResetData({ newPassword: '', confirmNewPassword: '' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset password');
    }
  };

  const startPasswordReset = (assistant: Assistant) => {
    setResettingPasswordAssistant(assistant);
    setPasswordResetData({ newPassword: '', confirmNewPassword: '' });
    setError(null);
    setSuccessMessage(null);
  };

  const cancelPasswordReset = () => {
    setResettingPasswordAssistant(null);
    setPasswordResetData({ newPassword: '', confirmNewPassword: '' });
  };

  const startEdit = (assistant: Assistant) => {
    setEditingAssistant(assistant);
    setFormData({
      email: assistant.email,
      password: '',
      confirmPassword: '',
      name: assistant.name || '',
    });
    setShowCreateForm(false);
  };

  const cancelEdit = () => {
    setEditingAssistant(null);
    setFormData({ email: '', password: '', confirmPassword: '', name: '' });
  };

  const startCreate = () => {
    setShowCreateForm(true);
    setEditingAssistant(null);
    setFormData({ email: '', password: '', confirmPassword: '', name: '' });
  };

  const handleSelectAssistant = (assistantId: string, checked: boolean) => {
    if (checked) {
      setSelectedAssistant(assistantId);
    } else {
      setSelectedAssistant(null);
    }
  };

  const handleEdit = () => {
    if (!selectedAssistant) {
      setError('Please select an assistant to edit');
      return;
    }

    const assistant = assistants.find(a => a.id === selectedAssistant);
    if (!assistant) {
      setError('Selected assistant not found');
      return;
    }

    startEdit(assistant);
    setError(null);
    setSuccessMessage(null);
  };

  const handleResetPasswordAction = () => {
    if (!selectedAssistant) {
      setError('Please select an assistant to reset password');
      return;
    }

    const assistant = assistants.find(a => a.id === selectedAssistant);
    if (!assistant) {
      setError('Selected assistant not found');
      return;
    }

    startPasswordReset(assistant);
    setError(null);
    setSuccessMessage(null);
  };

  const handleDelete = async () => {
    if (!selectedAssistant) {
      setError('Please select an assistant to delete');
      return;
    }

    const assistant = assistants.find(a => a.id === selectedAssistant);
    if (!assistant) {
      setError('Selected assistant not found');
      return;
    }

    if (!confirm(`Are you sure you want to delete assistant ${assistant.email}?`)) {
      return;
    }

    try {
      setError(null);
      setSuccessMessage(null);
      await deleteAssistant(assistant.id);
      setSelectedAssistant(null);
      setSuccessMessage('Assistant deleted successfully');
      await loadAssistants();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete assistant');
    }
  };

  if (loading) {
    return <div className="loading">Loading assistants...</div>;
  }

  return (
    <div className="assistant-management">
      <div className="management-header">
        <h2>Assistant Management</h2>
        <button
          className="btn btn-primary"
          onClick={startCreate}
          disabled={loading}
        >
          Create New Assistant
        </button>
      </div>

      {error && <div className="error-message">{error}</div>}
      {successMessage && <div className="success-message">{successMessage}</div>}

      {/* Create/Edit Form */}
      {(showCreateForm || editingAssistant) && (
        <div className="student-form-container">
          <h3>{editingAssistant ? 'Edit Assistant' : 'Create New Assistant'}</h3>
          <form onSubmit={editingAssistant ? handleUpdateAssistant : handleCreateAssistant}>
            <div className="form-group">
              <label htmlFor="email">Email Address *</label>
              <input
                type="email"
                id="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                required
                disabled={loading}
                placeholder="Enter assistant email address"
              />
            </div>

            <div className="form-group">
              <label htmlFor="name">Name</label>
              <input
                type="text"
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                disabled={loading}
                placeholder="Enter assistant name (optional)"
              />
            </div>

            {!editingAssistant && (
              <>
                <div className="form-group">
                  <label htmlFor="password">Password *</label>
                  <input
                    type="password"
                    id="password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    required
                    disabled={loading}
                    minLength={8}
                    placeholder="Minimum 8 characters"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="confirmPassword">Confirm Password *</label>
                  <input
                    type="password"
                    id="confirmPassword"
                    value={formData.confirmPassword}
                    onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                    required
                    disabled={loading}
                    minLength={8}
                    placeholder="Re-enter password"
                  />
                </div>
              </>
            )}

            <div className="form-actions">
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? 'Saving...' : editingAssistant ? 'Update Assistant' : 'Create Assistant'}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  if (editingAssistant) {
                    cancelEdit();
                  } else {
                    setShowCreateForm(false);
                    setFormData({ email: '', password: '', confirmPassword: '', name: '' });
                  }
                }}
                disabled={loading}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Search and Filter */}
      <div className="search-filter-container">
        <div className="search-box">
          <input
            type="text"
            placeholder="Search by email or name..."
            value=""
            onChange={() => {}}
            className="search-input"
          />
        </div>

        <div className="filter-buttons">
          <button className="filter-btn active">
            All
          </button>
        </div>
      </div>

      {/* Assistant List */}
      <div className="student-list">
        <div className="list-header">
          <h3>All Assistants ({assistants.length})</h3>
          {assistants.length > 0 && (
            <div className="action-buttons">
              <button
                onClick={handleEdit}
                disabled={!selectedAssistant}
                className="btn btn-secondary btn-small"
              >
                Edit Selected
              </button>
              <button
                onClick={handleResetPasswordAction}
                disabled={!selectedAssistant}
                className="btn btn-primary btn-small"
              >
                Reset Password
              </button>
              <button
                onClick={handleDelete}
                disabled={!selectedAssistant}
                className="btn btn-danger btn-small"
              >
                Delete Selected
              </button>
            </div>
          )}
        </div>
        
        {assistants.length === 0 ? (
          <div className="empty-state">
            <p>No assistants found. Create your first assistant above.</p>
          </div>
        ) : (
          <div className="student-table">
            <table>
              <thead>
                <tr>
                  <th>Select</th>
                  <th>Email</th>
                  <th>Name</th>
                  <th>Created At</th>
                </tr>
              </thead>
              <tbody>
                {assistants.map((assistant) => (
                  <tr 
                    key={assistant.id}
                    className={selectedAssistant === assistant.id ? 'selected' : ''}
                  >
                    <td>
                      <input
                        type="radio"
                        name="selectedAssistant"
                        checked={selectedAssistant === assistant.id}
                        onChange={(e) => handleSelectAssistant(assistant.id, e.target.checked)}
                      />
                    </td>
                    <td className="user-id">{assistant.email}</td>
                    <td>{assistant.name || '-'}</td>
                    <td>{new Date(assistant.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Password Reset Modal */}
      {resettingPasswordAssistant && (
        <div className="modal-overlay">
          <div className="modal-dialog">
            <div className="modal-header">
              <h3>Reset Password for {resettingPasswordAssistant.email}</h3>
            </div>
            <form onSubmit={handleResetPassword}>
              <div className="modal-body">
                <div className="form-group">
                  <label htmlFor="newPassword">New Password *</label>
                  <input
                    type="password"
                    id="newPassword"
                    value={passwordResetData.newPassword}
                    onChange={(e) =>
                      setPasswordResetData({ ...passwordResetData, newPassword: e.target.value })
                    }
                    required
                    minLength={8}
                    placeholder="Minimum 8 characters"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="confirmNewPassword">Confirm New Password *</label>
                  <input
                    type="password"
                    id="confirmNewPassword"
                    value={passwordResetData.confirmNewPassword}
                    onChange={(e) =>
                      setPasswordResetData({
                        ...passwordResetData,
                        confirmNewPassword: e.target.value,
                      })
                    }
                    required
                    minLength={8}
                    placeholder="Re-enter new password"
                  />
                </div>
              </div>

              <div className="modal-actions">
                <button type="submit" className="btn btn-primary">
                  Reset Password
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={cancelPasswordReset}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AssistantManagement;
