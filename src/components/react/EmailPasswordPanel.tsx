import React, { useState, useEffect } from 'react';
import SquareButton from './SquareButton';

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
    console.log('🔄 EmailPasswordPanel: useEffect triggered, loading user data');
    loadUserData();
  }, []);

  const loadUserData = async () => {
    console.log('📥 EmailPasswordPanel: loadUserData called');
    setIsLoading(true);
    try {
      console.log('📤 EmailPasswordPanel: Fetching from /api/user/get-profile');
      const response = await fetch('/api/user/get-profile');
      console.log('📥 EmailPasswordPanel: Response status:', response.status);
      if (response.ok) {
        const data = await response.json();
        console.log('📥 EmailPasswordPanel: Received data:', data);
        setCurrentEmail(data.email || '');
        setEmailVerified(data.emailVerified || false);
        console.log('✅ EmailPasswordPanel: User data loaded');
      } else {
        console.error('❌ EmailPasswordPanel: API call failed:', response.status);
      }
    } catch (error) {
      console.error('❌ EmailPasswordPanel: Error loading user data:', error);
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
      console.log('📤 EmailPasswordPanel: Starting credential updates');
      
      // Dispatch custom event to trigger API call from Astro page
      const event = new CustomEvent('updateCredentialsRequest', {
        detail: {
          newEmail: formData.newEmail.trim(),
          currentPassword: formData.currentPassword.trim(),
          newPassword: formData.newPassword.trim()
        }
      });
      
      console.log('📤 EmailPasswordPanel: Event dispatched:', event);
      window.dispatchEvent(event);

      // Show success toast immediately (the actual API call will happen in the background)
      window.dispatchEvent(new CustomEvent('toast', {
        detail: {
          message: 'Credentials updated successfully!',
          type: 'success'
        }
      }));

      // Close panel after a short delay
      setTimeout(() => {
        if (onClose) {
          onClose();
        } else {
          window.dispatchEvent(new CustomEvent('closeProfilePanel'));
        }
      }, 1000);

    } catch (error: any) {
      console.error('❌ EmailPasswordPanel: Error updating credentials:', error);
      
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

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-[var(--color-deep-grey)]">Loading...</div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col min-h-0">
      <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
        {/* Content area that expands to fill available space */}
        <div className="flex-1 flex flex-col min-h-0">
          {/* Single unified panel using CardStack structure */}
          <div className="bg-white box-border flex flex-col min-h-0 flex-1 items-start justify-between overflow-clip pb-6 pt-0 px-0 relative rounded-[24px] shadow-[0px_3px_20px_0px_rgba(120,118,111,0.1)] w-full mb-3.5">
            {/* Header section with dynamic background */}
            <div 
              className="box-border content-stretch flex gap-3 items-center justify-center leading-[0] mb-[-24px] not-italic pb-12 pt-6 px-6 relative shrink-0 text-[var(--color-deep-grey)] w-full rounded-t-3xl"
              style={{ backgroundColor: 'var(--color-paper)' }}
            >
              <div className="basis-0 font-sans font-bold grow min-h-px min-w-px relative shrink-0 text-[24px] text-center">
                <p className="leading-[normal]">Email & Password</p>
              </div>
            </div>
            
            {/* Content area */}
            <div className="flex-1 box-border content-stretch flex flex-col items-start justify-start mb-[-24px] min-h-0 overflow-clip relative w-full">
              <div className="flex-1 bg-[var(--color-snow-white)] box-border content-stretch flex flex-col gap-3 items-start justify-start min-h-0 overflow-x-clip overflow-y-auto p-[12px] relative rounded-tl-[24px] rounded-tr-[24px] w-full">
                
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
                <div className="search-input rounded-3xl py-5 px-4 min-h-[64px] w-full">
                  <input 
                    type="password"
                    value={formData.currentPassword}
                    onChange={(e) => handleInputChange('currentPassword', e.target.value)}
                    placeholder="Current Password (required for changes)"
                    className="outline-none bg-transparent text-[18px] font-semibold text-[var(--color-deep-grey)] text-center placeholder:text-[var(--color-pebble-grey)] w-full" 
                  />
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
        <div className="flex items-center justify-between gap-3 shrink-0">
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
            className="group relative rounded-3xl cursor-pointer transition-[scale,shadow] duration-300 pb-7 pt-6 px-6 flex items-center justify-center font-sans font-semibold text-[18px] leading-[0] text-nowrap text-[var(--color-fog-white)] h-[64px] flex-1 shadow-[0px_4px_4px_0px_rgba(0,0,0,0.25)] disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ backgroundColor: 'var(--color-bold-blue)' }}
            tabIndex={3}
          >
            <div className="relative shrink-0 transition-transform duration-125">
              {isSubmitting ? 'Saving...' : 'Save Changes'}
            </div>
            <div className="absolute inset-0 pointer-events-none rounded-3xl transition-shadow duration-125 shadow-[0px_-8px_0px_0px_rgba(0,0,0,0.1)_inset] group-active:!shadow-[0px_-2px_0px_0px_rgba(0,0,0,0.1)_inset]" />
          </button>
        </div>
      </form>
    </div>
  );
}
