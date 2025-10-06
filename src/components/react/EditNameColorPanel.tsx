import React, { useState, useEffect } from 'react';
import { THREAD_COLORS, getThreadColorCSS, type ThreadColor } from '@/utils/colors';
import SquareButton from './SquareButton';

interface EditNameColorPanelProps {
  firstName?: string;
  lastName?: string;
  selectedColor?: ThreadColor;
  onClose?: () => void;
}

export default function EditNameColorPanel({ 
  firstName = '', 
  lastName = '', 
  selectedColor = 'paper',
  onClose 
}: EditNameColorPanelProps) {
  const [formData, setFormData] = useState({
    firstName: firstName,
    lastName: lastName,
    selectedColor: selectedColor
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);

  // Load initial data from API if not provided
  useEffect(() => {
    if (!firstName && !lastName) {
      loadUserData();
    }
  }, [firstName, lastName]);

  const loadUserData = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/user/get-profile');
      if (response.ok) {
        const data = await response.json();
        setFormData({
          firstName: data.firstName || '',
          lastName: data.lastName || '',
          selectedColor: data.userColor || 'paper'
        });
      }
    } catch (error) {
      console.error('Error loading user data:', error);
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
      console.log('EditNameColorPanel: Dispatching updateProfileRequest event');
      console.log('EditNameColorPanel: Data being sent:', {
        firstName: formData.firstName.trim(),
        lastName: formData.lastName.trim(),
        color: formData.selectedColor
      });
      
      // Dispatch custom event to trigger API call from Astro page
      window.dispatchEvent(new CustomEvent('updateProfileRequest', {
        detail: {
          firstName: formData.firstName.trim(),
          lastName: formData.lastName.trim(),
          color: formData.selectedColor
        }
      }));

      // Show success toast immediately (the actual API call will happen in the background)
      window.dispatchEvent(new CustomEvent('toast', {
        detail: {
          message: 'Profile updated successfully!',
          type: 'success'
        }
      }));

      // Update all avatars on the page
      const newInitials = `${formData.firstName.charAt(0) || ''}${formData.lastName.charAt(0) || ''}`.toUpperCase();
      if ((window as any).updateAllAvatars) {
        (window as any).updateAllAvatars(formData.selectedColor, newInitials);
      }

      // Dispatch profile update event
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

    } catch (error) {
      console.error('Error updating profile:', error);
      window.dispatchEvent(new CustomEvent('toast', {
        detail: {
          message: 'Failed to update profile. Please try again.',
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
              style={{ backgroundColor: getThreadColorCSS(formData.selectedColor) }}
            >
              <div className="basis-0 font-sans font-bold grow min-h-px min-w-px relative shrink-0 text-[24px] text-center">
                <p className="leading-[normal]">Edit Name & Color</p>
              </div>
            </div>
            
            {/* Content area */}
            <div className="flex-1 box-border content-stretch flex flex-col items-start justify-start mb-[-24px] min-h-0 overflow-clip relative w-full">
              <div className="flex-1 bg-[var(--color-snow-white)] box-border content-stretch flex flex-col gap-3 items-start justify-start min-h-0 overflow-x-clip overflow-y-auto p-[12px] relative rounded-tl-[24px] rounded-tr-[24px] w-full">
                
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
                
                {/* Color selection */}
                <div className="color-selection flex gap-2 items-center justify-start w-full">
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
                          <svg className="size-5 text-[var(--color-deep-grey)]" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                          </svg>
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
        <div className="flex items-center justify-between gap-3 shrink-0">
          {/* Back button - SquareButton Back variant */}
          <SquareButton 
            variant="Back"
            onClick={handleClose}
          />
          
          {/* Save Changes button - Button Default variant */}
          <button 
            type="submit"
            disabled={isSubmitting || !formData.firstName.trim() || !formData.lastName.trim()}
            data-outer-shadow
            className="group relative rounded-3xl cursor-pointer transition-[scale,shadow] duration-300 pb-7 pt-6 px-6 flex items-center justify-center font-sans font-semibold text-[18px] leading-[0] text-nowrap text-[var(--color-fog-white)] h-[64px] flex-1 shadow-[0px_4px_4px_0px_rgba(0,0,0,0.25)] disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ backgroundColor: 'var(--color-blue)' }}
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

// Add the CSS for data-outer-shadow - scoped to EditNameColorPanel only
const buttonStyles = `
  .edit-name-color-panel button[data-outer-shadow] {
    will-change: transform, box-shadow;
    transition:
      background-color 0.125s ease-in-out,
      box-shadow 0.125s ease-in-out;
    box-shadow:
      0px -8px 0px 0px hsla(0, 0%, 0%, 0.1) inset,
      0px 4px 4px 0px hsla(0, 0%, 0%, 0.25);
  }
  
  .edit-name-color-panel button:not([data-outer-shadow]) {
    transition:
      box-shadow 0.125s ease-in-out;
    box-shadow: 0px -3px 0px 0px #78766F33 inset;
  }

  .edit-name-color-panel button:not([data-outer-shadow]):active {
    filter: brightness(0.97);
    box-shadow: 
      0px -1px 0px 0px #78766F33 inset,
      0px 1px 0px 0px #78766F33 inset;
  }

  .edit-name-color-panel button {
    will-change: transform, box-shadow;
  }

  .edit-name-color-panel button:active > img {
    transform: scale(0.95);
  }
  
  /* Ensure EditNameColorPanel appears instantly without fade */
  .edit-name-color-panel {
    opacity: 1 !important;
    transition: none !important;
    animation: none !important;
  }
  
  .edit-name-color-panel * {
    opacity: 1 !important;
    transition: none !important;
    animation: none !important;
  }
  
  /* Override any React component unmount transitions */
  .edit-name-color-panel[data-astro-cid] {
    transition: none !important;
    animation: none !important;
  }

  .search-input {
    background: var(--color-gradient-gray);
    box-shadow: var(--shadow-small);
  }

  .color-selection button[style*="background-color"] {
    box-shadow: 0px -4px 0px 0px rgba(0, 0, 0, 0.1) inset;
  }

  .color-selection button[style*="background-color"]:hover {
    transform: scale(1.05);
  }

  .color-selection button[style*="background-color"]:active {
    transform: scale(0.95);
  }
`;

// Inject the styles
if (typeof document !== 'undefined') {
  const styleId = 'edit-name-color-panel-button-styles';
  if (!document.getElementById(styleId)) {
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = buttonStyles;
    document.head.appendChild(style);
  }
}
