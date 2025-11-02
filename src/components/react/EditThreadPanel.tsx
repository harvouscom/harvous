import React, { useState, useEffect } from 'react';
import { THREAD_COLORS, getThreadColorCSS, getThreadTextColorCSS, type ThreadColor } from '@/utils/colors';
import SquareButton from './SquareButton';
import ChevronDownIcon from '@fortawesome/fontawesome-free/svgs/solid/chevron-down.svg';

interface EditThreadPanelProps {
  threadId: string;
  initialTitle?: string;
  initialColor?: ThreadColor;
  onClose?: () => void;
}

export default function EditThreadPanel({ 
  threadId,
  initialTitle = '', 
  initialColor = 'paper',
  onClose 
}: EditThreadPanelProps) {
  const [formData, setFormData] = useState({
    title: initialTitle,
    selectedColor: initialColor,
    selectedType: 'Private'
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (isDropdownOpen) {
        const target = event.target as HTMLElement;
        if (!target.closest('.dropdown-container')) {
          setIsDropdownOpen(false);
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isDropdownOpen]);

  // Validate form data
  const validateForm = () => {
    const errors: Record<string, string> = {};
    
    if (!formData.title.trim()) {
      errors.title = 'Thread title is required';
    }
    
    if (formData.title.trim().length < 1) {
      errors.title = 'Thread title must be at least 1 character';
    }
    
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    console.log('EditThreadPanel: handleSubmit called');
    console.log('EditThreadPanel: Form data:', formData);
    
    if (!validateForm()) {
      console.log('EditThreadPanel: Form validation failed');
      return;
    }

    console.log('EditThreadPanel: Form validation passed, starting submission');
    setIsSubmitting(true);

    try {
      console.log('EditThreadPanel: Making API call to update thread');
      console.log('EditThreadPanel: Data being sent:', {
        threadId: threadId,
        title: formData.title.trim(),
        color: formData.selectedColor,
        isPublic: false
      });
      
      const formDataToSend = new FormData();
      formDataToSend.append('id', threadId);
      formDataToSend.append('title', formData.title.trim());
      formDataToSend.append('color', formData.selectedColor);
      formDataToSend.append('isPublic', 'false');

      const response = await fetch('/api/threads/update', {
        method: 'POST',
        body: formDataToSend,
      });

      console.log('EditThreadPanel: API response status:', response.status);
      const data = await response.json();
      console.log('EditThreadPanel: API response data:', data);

      if (response.ok) {
        console.log('✅ EditThreadPanel: Thread updated successfully');
        
        // Show success toast
        window.dispatchEvent(new CustomEvent('toast', {
          detail: {
            message: 'Thread updated successfully!',
            type: 'success'
          }
        }));

        // Close panel after a short delay
        setTimeout(() => {
          if (onClose) {
            onClose();
          } else {
            window.dispatchEvent(new CustomEvent('closeEditThreadPanel'));
          }
        }, 500);

        // Refresh the page to show updated thread
        window.location.reload();
      } else {
        console.error('❌ EditThreadPanel: Thread update failed:', data);
        
        // Show error toast
        window.dispatchEvent(new CustomEvent('toast', {
          detail: {
            message: data.error || 'Failed to update thread. Please try again.',
            type: 'error'
          }
        }));
      }

    } catch (error) {
      console.error('❌ EditThreadPanel: Error updating thread:', error);
      window.dispatchEvent(new CustomEvent('toast', {
        detail: {
          message: 'Error updating thread. Please try again.',
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
      window.dispatchEvent(new CustomEvent('closeEditThreadPanel'));
    }
  };

  return (
    <div className="h-full flex flex-col min-h-0">
      <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
        {/* Content area that expands to fill available space */}
        <div className="flex-1 flex flex-col min-h-0">
          {/* Single unified panel using CardStack structure */}
          <div className="bg-white box-border flex flex-col min-h-0 flex-1 items-start justify-between overflow-clip pb-6 pt-0 px-0 relative rounded-[24px] shadow-[0px_3px_20px_0px_rgba(120,118,111,0.1)] w-full mb-3.5">
            {/* Header section with dynamic background */}
            <div 
              className="box-border content-stretch flex gap-3 items-center justify-center leading-[0] mb-[-24px] not-italic pb-12 pt-6 px-6 relative shrink-0 w-full rounded-t-3xl"
              style={{ 
                backgroundColor: getThreadColorCSS(formData.selectedColor),
                color: getThreadTextColorCSS(formData.selectedColor)
              }}
            >
              <div className="basis-0 font-sans font-bold grow min-h-px min-w-px relative shrink-0 text-[24px] text-center">
                <p className="leading-[normal]">Edit Thread</p>
              </div>
            </div>
            
            {/* Content area */}
            <div className="flex-1 box-border content-stretch flex flex-col items-start justify-start mb-[-24px] min-h-0 overflow-clip relative w-full">
              <div className="flex-1 bg-[var(--color-snow-white)] box-border content-stretch flex flex-col gap-3 items-start justify-start min-h-0 overflow-x-clip overflow-y-auto p-[12px] relative rounded-tl-[24px] rounded-tr-[24px] w-full">
                
                {/* Thread Title Input */}
                <div className="search-input rounded-3xl py-5 px-4 min-h-[64px] w-full">
                  <input 
                    type="text"
                    value={formData.title}
                    onChange={(e) => handleInputChange('title', e.target.value)}
                    placeholder={formData.title ? '' : 'Thread Title'}
                    className="outline-none bg-transparent text-[18px] font-semibold text-[var(--color-deep-grey)] text-center placeholder:text-[var(--color-pebble-grey)] w-full" 
                  />
                  {validationErrors.title && (
                    <div className="text-red-500 text-sm mt-1 text-center">
                      {validationErrors.title}
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
                          <svg className="size-5" style={{ color: getThreadTextColorCSS(color) }} fill="currentColor" viewBox="0 0 24 24">
                            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                          </svg>
                        </div>
                      )}
                    </button>
                  ))}
                </div>

                {/* Thread type selection with dropdown */}
                <div className="w-full">
                  <div className="relative dropdown-container">
                    <div 
                      onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                      className="w-full cursor-pointer"
                    >
                      <div className="relative w-full">
                        <div className="space-button relative rounded-xl h-[64px] cursor-pointer transition-[scale,shadow] duration-300 pl-4 pr-0 w-full"
                             style={{ backgroundImage: 'var(--color-gradient-gray)' }}>
                          <div className="flex items-center justify-between relative w-full h-full pl-2 pr-0 transition-transform duration-125">
                            <span className="text-[var(--color-deep-grey)] font-sans text-[18px] font-semibold whitespace-nowrap">
                              {formData.selectedType}
                            </span>
                            <div className="absolute right-4 top-1/2 transform -translate-y-1/2">
                              <img src={ChevronDownIcon.src} alt="Dropdown" className="w-5 h-5" />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    {/* Dropdown content */}
                    {isDropdownOpen && (
                      <div className="absolute top-full left-0 right-0 mt-2 z-10"
                           style={{ minWidth: '223px' }}
                           onClick={(e) => e.stopPropagation()}>
                        <div>
                          {/* Private option */}
                          <button 
                            type="button"
                            onClick={() => {
                              setFormData(prev => ({ ...prev, selectedType: 'Private' }));
                              setIsDropdownOpen(false);
                            }}
                            className="space-button relative rounded-xl h-[64px] cursor-pointer transition-[scale,shadow] duration-300 pl-4 pr-0 w-full"
                            style={{ backgroundImage: 'var(--color-gradient-gray)' }}
                          >
                            <div className="flex items-center justify-start relative w-full h-full pl-2 pr-0 transition-transform duration-125">
                              <span className="text-[var(--color-deep-grey)] font-sans text-[18px] font-semibold whitespace-nowrap">Private</span>
                            </div>
                          </button>
                          
                          {/* Shared option - disabled */}
                          <button 
                            type="button"
                            disabled
                            className="space-button relative rounded-xl h-[64px] cursor-not-allowed transition-[scale,shadow] duration-300 pl-4 pr-0 w-full opacity-50"
                            style={{ backgroundImage: 'var(--color-gradient-gray)' }}
                          >
                            <div className="flex items-center justify-start relative w-full h-full pl-2 pr-0 transition-transform duration-125">
                              <div className="flex flex-col items-start">
                                <span className="text-[var(--color-deep-grey)] font-sans text-[18px] font-semibold whitespace-nowrap">Shared</span>
                                <span className="text-[12px] text-[var(--color-pebble-grey)] font-medium">Coming Soon</span>
                              </div>
                            </div>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
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
            disabled={isSubmitting || !formData.title.trim()}
            data-outer-shadow
            className="group relative rounded-3xl cursor-pointer transition-[scale,shadow] duration-300 pb-7 pt-6 px-6 flex items-center justify-center font-sans font-semibold text-[18px] leading-[0] text-nowrap text-[var(--color-fog-white)] h-[64px] flex-1 shadow-[0px_4px_4px_0px_rgba(0,0,0,0.25)] disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ backgroundColor: 'var(--color-bold-blue)' }}
            tabIndex={3}
            onClick={() => console.log('EditThreadPanel: Save button clicked, isSubmitting:', isSubmitting, 'title:', formData.title.trim())}
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
