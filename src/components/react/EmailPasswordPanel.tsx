import React, { useState, useEffect } from 'react';
import SquareButton from './SquareButton';
import { getCachedProfileData, updateCachedProfileData } from '@/utils/profile-cache';
import { authenticatedFetch } from '@/utils/fetch-helpers';

interface EmailPasswordPanelProps {
  onClose?: () => void;
  inBottomSheet?: boolean;
}

export default function EmailPasswordPanel({ 
  onClose,
  inBottomSheet = false
}: EmailPasswordPanelProps) {
  const [formData, setFormData] = useState({
    newEmail: '',
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [currentEmail, setCurrentEmail] = useState('');
  const [emailVerified, setEmailVerified] = useState(false);

  // Load current user data when component mounts
  useEffect(() => {
    // Check cache first
    const cached = getCachedProfileData();
    if (cached && cached.email) {
      setCurrentEmail(cached.email);
      setEmailVerified(cached.emailVerified || false);
    } else {
      loadUserData();
    }
  }, []);

  const loadUserData = async () => {
    setIsLoading(true);
    try {
      const response = await authenticatedFetch('/api/user/get-profile');
      if (response.ok) {
        const data = await response.json();
        const email = data.email || '';
        const emailVerified = data.emailVerified || false;
        
        setCurrentEmail(email);
        setEmailVerified(emailVerified);
        
        // Update cache with fetched data
        updateCachedProfileData({
          email,
          emailVerified
        });
      } else {
        console.error('EmailPasswordPanel: API call failed:', response.status);
      }
    } catch (error) {
      console.error('EmailPasswordPanel: Error loading user data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Validate form data
  const validateForm = () => {
    const errors: Record<string, string> = {};
    
    // Email validation
    if (formData.newEmail.trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(formData.newEmail.trim())) {
        errors.newEmail = 'Please enter a valid email address';
      }
    }
    
    // Password validation
    if (formData.newPassword.trim()) {
      if (formData.newPassword.length < 8) {
        errors.newPassword = 'Password must be at least 8 characters';
      }
      
      if (formData.newPassword !== formData.confirmPassword) {
        errors.confirmPassword = 'Passwords do not match';
      }
      
      if (!formData.currentPassword.trim()) {
        errors.currentPassword = 'Current password is required to change password';
      }
    }
    
    // If changing email, require current password
    if (formData.newEmail.trim() && !formData.currentPassword.trim()) {
      errors.currentPassword = 'Current password is required to change email';
    }
    
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);

    try {
      // Dispatch custom event to trigger API call from Astro page
      const event = new CustomEvent('updateCredentialsRequest', {
        detail: {
          newEmail: formData.newEmail.trim(),
          currentPassword: formData.currentPassword.trim(),
          newPassword: formData.newPassword.trim()
        }
      });
      
      window.dispatchEvent(event);

      // Don't show toast here - let the ProfilePage component handle it after API response
      // The toast will be shown by handleCredentialsUpdateRequest in ProfilePage.tsx

    } catch (error: any) {
      console.error('EmailPasswordPanel: Error updating credentials:', error);
      
      window.dispatchEvent(new CustomEvent('toast', {
        detail: {
          message: 'Failed to update credentials. Please try again.',
          type: 'error'
        }
      }));
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle input changes
  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    
    // Clear validation error for this field
    if (validationErrors[field]) {
      setValidationErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  // Handle close
  const handleClose = () => {
    if (onClose) {
      onClose();
    } else {
      window.dispatchEvent(new CustomEvent('closeProfilePanel'));
    }
  };

  return (
    <div className={`panel-wrapper ${inBottomSheet ? 'panel-wrapper--bottom-sheet' : ''} relative`}>
      {/* Loading indicator - progress bar at top */}
      {isLoading && (
        <div className="panel__progress-bar" style={{ position: 'absolute', top: 0, zIndex: 50 }}>
          <div className="panel__progress-fill"></div>
        </div>
      )}
      <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
        {/* Content area - expands on mobile, fits content on desktop */}
        <div className={inBottomSheet ? "flex-1 flex flex-col min-h-0" : "flex flex-col"}>
          {/* Panel container */}
          <div className={`panel ${inBottomSheet ? 'panel--bottom-sheet' : ''} ${isLoading ? 'opacity-60 pointer-events-none' : ''}`}>
            {/* Header section */}
            <div className="panel__header">
              <div className="panel__title">
                <p>Email & Password</p>
              </div>
            </div>
            
            {/* Content area */}
            <div className={`panel__body ${inBottomSheet ? 'panel__body--bottom-sheet' : ''}`}>
              <div className={`panel__content ${inBottomSheet ? 'panel__content--bottom-sheet' : ''}`}>
                
                {/* Current Email Display */}
                <div className="w-full py-5">
                  <div className="flex items-center justify-center gap-2">
                    <div className="text-[18px] font-semibold text-[var(--color-deep-grey)]">
                      {currentEmail}
                    </div>
                    {emailVerified ? (
                      <div className="bg-green-100 text-green-800 text-xs px-2 py-1 rounded-full">
                        ✓ Verified
                      </div>
                    ) : (
                      <div className="bg-yellow-100 text-yellow-800 text-xs px-2 py-1 rounded-full">
                        ⚠ Unverified
                      </div>
                    )}
                  </div>
                </div>
                
                {/* New Email Input */}
                <div className="search-input rounded-3xl py-5 px-4 min-h-[64px] w-full">
                  <input 
                    type="email"
                    value={formData.newEmail}
                    onChange={(e) => handleInputChange('newEmail', e.target.value)}
                    placeholder="New Email Address"
                    className="outline-none bg-transparent text-[18px] font-semibold text-[var(--color-deep-grey)] text-center placeholder:text-[var(--color-pebble-grey)] w-full" 
                  />
                  {validationErrors.newEmail && (
                    <div className="text-red-500 text-sm mt-1 text-center">
                      {validationErrors.newEmail}
                    </div>
                  )}
                </div>
                
                {/* Current Password Input */}
                <div className="w-full">
                  <div className="search-input rounded-3xl py-5 px-4 min-h-[64px] w-full">
                    <input 
                      type="password"
                      value={formData.currentPassword}
                      onChange={(e) => handleInputChange('currentPassword', e.target.value)}
                      placeholder="Current Password"
                      className="outline-none bg-transparent text-[18px] font-semibold text-[var(--color-deep-grey)] text-center placeholder:text-[var(--color-pebble-grey)] w-full" 
                    />
                  </div>
                  <div className="text-[var(--color-stone-grey)] text-sm mt-1 text-center">
                    Required for changes
                  </div>
                  {validationErrors.currentPassword && (
                    <div className="text-red-500 text-sm mt-1 text-center">
                      {validationErrors.currentPassword}
                    </div>
                  )}
                </div>
                
                {/* New Password Input */}
                <div className="search-input rounded-3xl py-5 px-4 min-h-[64px] w-full">
                  <input 
                    type="password"
                    value={formData.newPassword}
                    onChange={(e) => handleInputChange('newPassword', e.target.value)}
                    placeholder="New Password"
                    className="outline-none bg-transparent text-[18px] font-semibold text-[var(--color-deep-grey)] text-center placeholder:text-[var(--color-pebble-grey)] w-full" 
                  />
                  {validationErrors.newPassword && (
                    <div className="text-red-500 text-sm mt-1 text-center">
                      {validationErrors.newPassword}
                    </div>
                  )}
                </div>
                
                {/* Confirm Password Input */}
                <div className="search-input rounded-3xl py-5 px-4 min-h-[64px] w-full">
                  <input 
                    type="password"
                    value={formData.confirmPassword}
                    onChange={(e) => handleInputChange('confirmPassword', e.target.value)}
                    placeholder="Confirm New Password"
                    className="outline-none bg-transparent text-[18px] font-semibold text-[var(--color-deep-grey)] text-center placeholder:text-[var(--color-pebble-grey)] w-full" 
                  />
                  {validationErrors.confirmPassword && (
                    <div className="text-red-500 text-sm mt-1 text-center">
                      {validationErrors.confirmPassword}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom buttons */}
        <div className="panel__footer--buttons">
          {/* Back button - SquareButton Back variant */}
          <SquareButton 
            variant="Back"
            onClick={handleClose}
            inBottomSheet={inBottomSheet}
          />
          
          {/* Save Changes button - Button Default variant */}
          <button 
            type="submit"
            disabled={isSubmitting || (!formData.newEmail.trim() && !formData.newPassword.trim())}
            data-outer-shadow
            className="btn-cta flex-1 group"
            tabIndex={3}
          >
            <span className="btn-cta__content">
              {isSubmitting ? 'Saving...' : 'Save Changes'}
            </span>
            <div className="btn-cta__shadow" />
          </button>
        </div>
      </form>
    </div>
  );
}
