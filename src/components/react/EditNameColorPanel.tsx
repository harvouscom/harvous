import React, { useState, useEffect } from 'react';
import { THREAD_COLORS, getThreadColorCSS, getThreadTextColorCSS, type ThreadColor } from '@/utils/colors';
import { toast } from '@/utils/toast';
import SquareButton from './SquareButton';
import Icon from './Icon';
import { getCachedProfileData, updateCachedProfileData } from '@/utils/profile-cache';

interface EditNameColorPanelProps {
  firstName?: string;
  lastName?: string;
  selectedColor?: ThreadColor;
  onClose?: () => void;
  inBottomSheet?: boolean;
}

export default function EditNameColorPanel({ 
  firstName = '', 
  lastName = '', 
  selectedColor = 'paper',
  onClose,
  inBottomSheet = false
}: EditNameColorPanelProps) {
  const [formData, setFormData] = useState({
    firstName: firstName,
    lastName: lastName,
    selectedColor: selectedColor
  });
  const [initialData, setInitialData] = useState({
    firstName: firstName,
    lastName: lastName,
    selectedColor: selectedColor
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);

  // Check cache first, then load from API if needed (background refetch when cache hit)
  useEffect(() => {
    // Check unified cache first
    const cached = getCachedProfileData();
    if (cached && (cached.firstName || cached.lastName)) {
      const newData = {
        firstName: cached.firstName || '',
        lastName: cached.lastName || '',
        selectedColor: (cached.userColor as ThreadColor) || 'paper'
      };
      setFormData(newData);
      setInitialData(newData);
      loadUserData(true); // Refetch in background to stay fresh
      return;
    }
    
    // Fallback: Check old sessionStorage for backward compatibility
    const storedProfileData = sessionStorage.getItem('userProfileData');
    if (storedProfileData) {
      try {
        const profileData = JSON.parse(storedProfileData);
        
        // Update form with legacy data
        const newData = {
          firstName: profileData.firstName || '',
          lastName: profileData.lastName || '',
          selectedColor: profileData.color || 'paper'
        };
        setFormData(newData);
        setInitialData(newData);
        
        // Migrate to unified cache
        updateCachedProfileData({
          firstName: profileData.firstName || '',
          lastName: profileData.lastName || '',
          userColor: profileData.color || 'paper'
        });
        loadUserData(true); // Refetch in background
        return;
      } catch (error) {
        console.error('EditNameColorPanel: Error parsing legacy sessionStorage data:', error);
      }
    }
    
    // If no cache, load from API (show loading)
    loadUserData(false);
  }, []);

  // Note: Header resize handling is now done by ProfileCardStackHeader React component
  // which manages its own state and persists across resizes automatically

  const loadUserData = async (backgroundRefetch = false) => {
    if (!backgroundRefetch) setIsLoading(true);
    try {
      const response = await fetch('/api/user/get-profile');
      if (response.ok) {
        const data = await response.json();
        const newData = {
          firstName: data.firstName || '',
          lastName: data.lastName || '',
          selectedColor: data.userColor || 'paper'
        };
        setFormData(newData);
        setInitialData(newData);
        
        // Update cache with fetched data
        updateCachedProfileData({
          firstName: data.firstName || '',
          lastName: data.lastName || '',
          userColor: data.userColor || 'paper'
        });
      } else {
        console.error('EditNameColorPanel: API call failed:', response.status);
      }
    } catch (error) {
      console.error('EditNameColorPanel: Error loading user data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Validate form data
  const validateForm = () => {
    const errors: Record<string, string> = {};
    
    if (!formData.firstName.trim()) {
      errors.firstName = 'First name is required';
    }
    
    if (!formData.lastName.trim()) {
      errors.lastName = 'Last name is required';
    }
    
    if (formData.firstName.trim().length < 1) {
      errors.firstName = 'First name must be at least 1 character';
    }
    
    if (formData.lastName.trim().length < 1) {
      errors.lastName = 'Last name must be at least 1 character';
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
      // Make direct API call instead of dispatching event
      const response = await fetch('/api/user/update-profile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          firstName: formData.firstName.trim(),
          lastName: formData.lastName.trim(),
          color: formData.selectedColor
        })
      });

      const data = await response.json();

      if (response.ok) {
        // Determine what changed for specific toast message
        const firstNameChanged = formData.firstName.trim() !== initialData.firstName.trim();
        const lastNameChanged = formData.lastName.trim() !== initialData.lastName.trim();
        // Update initial data to reflect the new state
        setInitialData({
          firstName: formData.firstName.trim(),
          lastName: formData.lastName.trim(),
          selectedColor: formData.selectedColor
        });

        // Update all avatars on the page
        const newInitials = `${formData.firstName.charAt(0) || ''}${formData.lastName.charAt(0) || ''}`.toUpperCase();
        const newDisplayName = `${formData.firstName.trim()} ${formData.lastName.trim().charAt(0)}`.trim();
        
        if ((window as any).updateAllAvatars) {
          await (window as any).updateAllAvatars(formData.selectedColor, newInitials);
        }

        // Note: Header update is now handled by ProfileCardStackHeader React component
        // which listens for the updateProfile event and updates reactively

        // Update unified cache with saved data
        updateCachedProfileData({
          firstName: formData.firstName.trim(),
          lastName: formData.lastName.trim(),
          userColor: formData.selectedColor
        });
        
        // Also update legacy sessionStorage for backward compatibility with ProfilePage
        // This can be removed once ProfilePage is fully migrated
        sessionStorage.setItem('userProfileData', JSON.stringify({
          firstName: formData.firstName.trim(),
          lastName: formData.lastName.trim(),
          color: formData.selectedColor,
          initials: newInitials,
          displayName: newDisplayName,
          timestamp: Date.now()
        }));

        // Dispatch profile update event for other components
        window.dispatchEvent(new CustomEvent('updateProfile', {
          detail: {
            firstName: formData.firstName.trim(),
            lastName: formData.lastName.trim(),
            selectedColor: formData.selectedColor
          }
        }));

        // Close panel after a short delay
        setTimeout(() => {
          if (onClose) {
            onClose();
          } else {
            window.dispatchEvent(new CustomEvent('closeProfilePanel'));
          }
        }, 500);
      } else {
        console.error('❌ EditNameColorPanel: Profile update failed:', data);
        
        // Show error toast
        toast.error(data.error || 'Failed to update profile. Please try again.');
      }

    } catch (error) {
      console.error('❌ EditNameColorPanel: Error updating profile:', error);
      toast.error('Error updating profile. Please try again.');
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

  // Handle color selection
  const handleColorSelect = (color: ThreadColor) => {
    setFormData(prev => ({ ...prev, selectedColor: color }));
  };

  // Handle close
  const handleClose = () => {
    if (onClose) {
      onClose();
    } else {
      window.dispatchEvent(new CustomEvent('closeProfilePanel'));
    }
  };

  // Check if any changes have been made
  const hasChanges = 
    formData.firstName.trim() !== initialData.firstName.trim() ||
    formData.lastName.trim() !== initialData.lastName.trim() ||
    formData.selectedColor !== initialData.selectedColor;

  return (
    <div className={`panel-wrapper ${inBottomSheet ? 'panel-wrapper--bottom-sheet' : ''} relative`}>
      {/* Loading indicator - progress bar at top */}
      <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
        {/* Content area - expands on mobile, fits content on desktop */}
        <div className={inBottomSheet ? "flex-1 flex flex-col min-h-0" : "flex flex-col"}>
          {/* Panel container */}
          <div className={`panel ${inBottomSheet ? 'panel--bottom-sheet' : ''}`} style={{ opacity: isLoading ? 0 : undefined, transition: 'opacity 0.15s ease-out' }}>
            {/* Header section with dynamic background */}
            <div 
              className="panel__header"
              style={{ 
                backgroundColor: getThreadColorCSS(formData.selectedColor),
                color: getThreadTextColorCSS(formData.selectedColor)
              }}
            >
              <div className="panel__title">
                <p>Edit Name & Color</p>
              </div>
            </div>
            
            {/* Content area */}
            <div className={`panel__body ${inBottomSheet ? 'panel__body--bottom-sheet' : ''}`}>
              <div className={`panel__content ${inBottomSheet ? 'panel__content--bottom-sheet' : ''}`}>
                
                {/* First Name Input */}
                <div className="search-input rounded-3xl py-5 px-4 min-h-[64px] w-full">
                  <input 
                    type="text"
                    value={formData.firstName}
                    onChange={(e) => handleInputChange('firstName', e.target.value)}
                    placeholder={formData.firstName ? '' : 'First Name'}
                    className="outline-none bg-transparent text-[18px] font-semibold text-[var(--color-deep-grey)] text-center placeholder:text-[var(--color-pebble-grey)] w-full" 
                  />
                  {validationErrors.firstName && (
                    <div className="text-red-500 text-sm mt-1 text-center">
                      {validationErrors.firstName}
                    </div>
                  )}
                </div>
                
                {/* Last Name Input */}
                <div className="search-input rounded-3xl py-5 px-4 min-h-[64px] w-full">
                  <input 
                    type="text"
                    value={formData.lastName}
                    onChange={(e) => handleInputChange('lastName', e.target.value)}
                    placeholder={formData.lastName ? '' : 'Last Name'}
                    className="outline-none bg-transparent text-[18px] font-semibold text-[var(--color-deep-grey)] text-center placeholder:text-[var(--color-pebble-grey)] w-full" 
                  />
                  {validationErrors.lastName && (
                    <div className="text-red-500 text-sm mt-1 text-center">
                      {validationErrors.lastName}
                    </div>
                  )}
                </div>
                
                {/* Color selection - padding for hover state, overflow-x for more colors on small screens */}
                <div
                  className="color-selection flex gap-2 items-center justify-start w-full"
                  style={{
                    paddingTop: 4,
                    paddingBottom: 4,
                    overflowX: 'auto',
                    overflowY: 'hidden',
                    WebkitOverflowScrolling: 'touch'
                  }}
                >
                  {THREAD_COLORS.map((color) => (
                    <button 
                      key={color}
                      type="button"
                      onClick={() => handleColorSelect(color)}
                      className={`relative rounded-xl size-10 cursor-pointer transition-all duration-200 ${
                        formData.selectedColor === color ? 'ring-2 ring-[var(--color-deep-grey)] ring-offset-2' : ''
                      }`}
                      style={{ backgroundColor: getThreadColorCSS(color) }}
                    >
                      {/* Check icon for selected color */}
                      {formData.selectedColor === color && (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <Icon 
                            name="check" 
                            size={20} 
                            style={{ color: getThreadTextColorCSS(color) }} 
                          />
                        </div>
                      )}
                    </button>
                  ))}
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
            disabled={isSubmitting || !formData.firstName.trim() || !formData.lastName.trim() || !hasChanges}
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

// Styles moved to global.css for immediate availability
