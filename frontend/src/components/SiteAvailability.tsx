/**
 * Site Availability Component
 * 
 * Interface for operators to enable/disable the entire platform.
 * Includes confirmation dialog before changing availability status.
 */

import React, { useState, useEffect } from 'react';
import { getSiteAvailability, setSiteAvailability } from '../services/operatorService';

const SiteAvailability: React.FC = () => {
  const [isAvailable, setIsAvailable] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<boolean | null>(null);

  // Load current availability status
  useEffect(() => {
    loadAvailability();
  }, []);

  const loadAvailability = async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await getSiteAvailability();
      setIsAvailable(data.isAvailable);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load site availability');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleClick = (newStatus: boolean) => {
    setPendingStatus(newStatus);
    setShowConfirmDialog(true);
  };

  const confirmToggle = async () => {
    if (pendingStatus === null) return;

    setLoading(true);
    setError(null);
    setSuccessMessage(null);
    setShowConfirmDialog(false);

    try {
      await setSiteAvailability(pendingStatus);
      setIsAvailable(pendingStatus);
      setSuccessMessage(
        `Site ${pendingStatus ? 'enabled' : 'disabled'} successfully. ${
          pendingStatus
            ? 'Students and assistants can now access the platform.'
            : 'Only operators can access the platform now.'
        }`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update site availability');
    } finally {
      setLoading(false);
      setPendingStatus(null);
    }
  };

  const cancelToggle = () => {
    setShowConfirmDialog(false);
    setPendingStatus(null);
  };

  return (
    <div className="site-availability">
      <div className="availability-header">
        <h2>Site Availability Control</h2>
        <p>Control whether the platform is accessible to students and assistants</p>
      </div>

      {error && <div className="error-message">{error}</div>}
      {successMessage && <div className="success-message">{successMessage}</div>}

      <div className="availability-status-card">
        <div className="status-info">
          <div className="status-indicator">
            <div className={`status-dot ${isAvailable ? 'available' : 'unavailable'}`}></div>
            <div className="status-text">
              <h3>Current Status</h3>
              <p className={`status-label ${isAvailable ? 'available' : 'unavailable'}`}>
                {isAvailable ? 'Site Available' : 'Site Unavailable'}
              </p>
            </div>
          </div>

          <div className="status-description">
            {isAvailable ? (
              <>
                <p>
                  <strong>The platform is currently accessible.</strong>
                </p>
                <p>Students and assistants can log in and use all features.</p>
              </>
            ) : (
              <>
                <p>
                  <strong>The platform is currently disabled.</strong>
                </p>
                <p>
                  Only operators can access the platform. Students and assistants will see a
                  maintenance message.
                </p>
              </>
            )}
          </div>
        </div>

        <div className="toggle-controls">
          <button
            className={`btn btn-large ${isAvailable ? 'btn-danger' : 'btn-success'}`}
            onClick={() => handleToggleClick(!isAvailable)}
            disabled={loading}
          >
            {loading
              ? 'Updating...'
              : isAvailable
                ? 'Disable Site'
                : 'Enable Site'}
          </button>
        </div>
      </div>

      {/* Confirmation Dialog */}
      {showConfirmDialog && (
        <div className="modal-overlay">
          <div className="modal-dialog">
            <div className="modal-header">
              <h3>Confirm Action</h3>
            </div>
            <div className="modal-body">
              <p>
                Are you sure you want to{' '}
                <strong>{pendingStatus ? 'enable' : 'disable'}</strong> the site?
              </p>
              {pendingStatus ? (
                <div className="confirmation-details">
                  <p>This will:</p>
                  <ul>
                    <li>Allow students and assistants to access the platform</li>
                    <li>Enable all exam and content management features</li>
                    <li>Resume normal operations</li>
                  </ul>
                </div>
              ) : (
                <div className="confirmation-details warning">
                  <p>This will:</p>
                  <ul>
                    <li>Prevent students and assistants from accessing the platform</li>
                    <li>Display a maintenance message to non-operator users</li>
                    <li>Only operators will be able to log in</li>
                  </ul>
                  <p className="warning-text">
                    <strong>Warning:</strong> Active exam sessions may be interrupted.
                  </p>
                </div>
              )}
            </div>
            <div className="modal-actions">
              <button className="btn btn-primary" onClick={confirmToggle} disabled={loading}>
                Confirm
              </button>
              <button className="btn btn-secondary" onClick={cancelToggle} disabled={loading}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="availability-info">
        <h4>About Site Availability</h4>
        <div className="info-grid">
          <div className="info-item">
            <h5>When to Disable</h5>
            <ul>
              <li>During system maintenance</li>
              <li>When deploying critical updates</li>
              <li>In case of technical issues</li>
              <li>For emergency situations</li>
            </ul>
          </div>
          <div className="info-item">
            <h5>Operator Access</h5>
            <ul>
              <li>Operators can always log in</li>
              <li>Full access to all features</li>
              <li>Can re-enable the site at any time</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SiteAvailability;
