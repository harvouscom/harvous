import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import SquareButton from './SquareButton';
import ButtonSmall from './ButtonSmall';
import ChurchIcon from "@fortawesome/fontawesome-free/svgs/solid/church.svg";

interface MyChurchPanelProps {
  onClose?: () => void;
  inBottomSheet?: boolean;
}


export default function MyChurchPanel({ 
  onClose,
  inBottomSheet = false
}: MyChurchPanelProps) {
  const [formData, setFormData] = useState({
    churchName: '',
    churchCity: '',
    churchState: '' // State/Province/Region (full name, not abbreviation)
  });
  const [originalFormData, setOriginalFormData] = useState({
    churchName: '',
    churchCity: '',
    churchState: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [hasExistingData, setHasExistingData] = useState(false);
  const [viewMode, setViewMode] = useState<'view' | 'edit'>('edit');
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);

  // Load existing church data when component mounts
  useEffect(() => {
    console.log('🔄 MyChurchPanel: useEffect triggered, loading church data');
    loadChurchData();
  }, []);

  // Prevent body scroll when dialog is open
  useEffect(() => {
    if (showUnsavedDialog) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    
    // Cleanup on unmount
    return () => {
      document.body.style.overflow = '';
    };
  }, [showUnsavedDialog]);

  const loadChurchData = async () => {
    console.log('📥 MyChurchPanel: loadChurchData called');
    setIsLoading(true);
    try {
      console.log('📤 MyChurchPanel: Fetching from /api/user/get-profile');
      const response = await fetch('/api/user/get-profile');
      console.log('📥 MyChurchPanel: Response status:', response.status);
      if (response.ok) {
        const data = await response.json();
        console.log('📥 MyChurchPanel: Received data:', data);
        const churchName = data.churchName || '';
        const churchCity = data.churchCity || '';
        const churchState = data.churchState || '';
        
        const loadedData = {
          churchName,
          churchCity,
          churchState
        };
        
        setFormData(loadedData);
        // Store original data for unsaved changes detection
        setOriginalFormData(loadedData);
        
        // Check if any church data exists
        const hasData = !!(churchName || churchCity || churchState);
        setHasExistingData(hasData);
        // Set view mode based on whether data exists
        setViewMode(hasData ? 'view' : 'edit');
        console.log('✅ MyChurchPanel: Form data updated');
      } else {
        console.error('❌ MyChurchPanel: API call failed:', response.status);
      }
    } catch (error) {
      console.error('❌ MyChurchPanel: Error loading church data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Check if there are unsaved changes
  const hasUnsavedChanges = () => {
    const currentTrimmed = {
      churchName: formData.churchName.trim(),
      churchCity: formData.churchCity.trim(),
      churchState: formData.churchState.trim()
    };
    const originalTrimmed = {
      churchName: originalFormData.churchName.trim(),
      churchCity: originalFormData.churchCity.trim(),
      churchState: originalFormData.churchState.trim()
    };
    
    return (
      currentTrimmed.churchName !== originalTrimmed.churchName ||
      currentTrimmed.churchCity !== originalTrimmed.churchCity ||
      currentTrimmed.churchState !== originalTrimmed.churchState
    );
  };

  // Validate form data (all fields required)
  const validateForm = () => {
    const errors: Record<string, string> = {};
    
    if (!formData.churchName.trim()) {
      errors.churchName = 'Church name is required';
    }
    if (!formData.churchCity.trim()) {
      errors.churchCity = 'City is required';
    }
    if (!formData.churchState.trim()) {
      errors.churchState = 'State/Province/Region is required';
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
      console.log('📤 MyChurchPanel: Making API call to update church');
      console.log('📤 MyChurchPanel: Data being sent:', {
        churchName: formData.churchName.trim(),
        churchCity: formData.churchCity.trim(),
        churchState: formData.churchState.trim()
      });
      
      const response = await fetch('/api/user/update-church', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          churchName: formData.churchName.trim(),
          churchCity: formData.churchCity.trim(),
          churchState: formData.churchState.trim()
        })
      });

      console.log('📥 MyChurchPanel: API response status:', response.status);
      const data = await response.json();
      console.log('📥 MyChurchPanel: API response data:', data);

      if (response.ok) {
        console.log('✅ MyChurchPanel: Church data updated successfully');
        
        // Update hasExistingData flag
        const hasData = !!(formData.churchName.trim() || formData.churchCity.trim() || formData.churchState.trim());
        setHasExistingData(hasData);
        
        // Update originalFormData to match saved data
        setOriginalFormData({
          churchName: formData.churchName.trim(),
          churchCity: formData.churchCity.trim(),
          churchState: formData.churchState.trim()
        });
        
        // Switch to view mode after successful save (panel stays open)
        setViewMode('view');
        
        // Show success toast
        window.dispatchEvent(new CustomEvent('toast', {
          detail: {
            message: 'Church information saved successfully!',
            type: 'success'
          }
        }));

        // Don't close panel - stay in view mode so user can see their saved church info
      } else {
        console.error('❌ MyChurchPanel: Church update failed:', data);
        
        // Show error toast
        window.dispatchEvent(new CustomEvent('toast', {
          detail: {
            message: data.error || 'Failed to save church information. Please try again.',
            type: 'error'
          }
        }));
      }

    } catch (error) {
      console.error('❌ MyChurchPanel: Error updating church:', error);
      window.dispatchEvent(new CustomEvent('toast', {
        detail: {
          message: 'Error saving church information. Please try again.',
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
    // Don't close if dialog is open
    if (showUnsavedDialog) {
      return;
    }
    
    // If in edit mode, check for unsaved changes
    if (viewMode === 'edit') {
      if (hasUnsavedChanges()) {
        // Show confirmation dialog
        setShowUnsavedDialog(true);
        return;
      } else {
        // No unsaved changes - revert to view mode if hasExistingData, otherwise close
        if (hasExistingData) {
          setViewMode('view');
          // Reset formData to original values in case they were modified
          setFormData(originalFormData);
          return;
        }
      }
    }
    
    // Close panel normally (in view mode or no existing data)
    if (onClose) {
      onClose();
    } else {
      window.dispatchEvent(new CustomEvent('closeProfilePanel'));
    }
  };

  // Switch to edit mode
  const switchToEditMode = () => {
    setViewMode('edit');
  };

  // Handle unsaved changes dialog actions
  const handleDiscardChanges = () => {
    // Reset formData to original values
    setFormData(originalFormData);
    setShowUnsavedDialog(false);
    
    // Revert to view mode if hasExistingData, otherwise stay in edit mode
    if (hasExistingData) {
      setViewMode('view');
    }
  };

  const handleSaveAndClose = async () => {
    // Close dialog first
    setShowUnsavedDialog(false);
    
    // Try to save the church data first
    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);

    try {
      console.log('📤 MyChurchPanel: Making API call to update church (from Save & Close)');
      
      const response = await fetch('/api/user/update-church', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          churchName: formData.churchName.trim(),
          churchCity: formData.churchCity.trim(),
          churchState: formData.churchState.trim()
        })
      });

      const data = await response.json();

      if (response.ok) {
        console.log('✅ MyChurchPanel: Church data updated successfully (from Save & Close)');
        
        // Update hasExistingData flag
        const hasData = !!(formData.churchName.trim() || formData.churchCity.trim() || formData.churchState.trim());
        setHasExistingData(hasData);
        
        // Update originalFormData to match saved data
        setOriginalFormData({
          churchName: formData.churchName.trim(),
          churchCity: formData.churchCity.trim(),
          churchState: formData.churchState.trim()
        });
        
        // Switch to view mode
        setViewMode('view');
        
        // Show success toast
        window.dispatchEvent(new CustomEvent('toast', {
          detail: {
            message: 'Church information saved successfully!',
            type: 'success'
          }
        }));

        // Close panel after successful save
        if (onClose) {
          onClose();
        } else {
          window.dispatchEvent(new CustomEvent('closeProfilePanel'));
        }
      } else {
        console.error('❌ MyChurchPanel: Church update failed (from Save & Close):', data);
        
        // Show error toast
        window.dispatchEvent(new CustomEvent('toast', {
          detail: {
            message: data.error || 'Failed to save church information. Please try again.',
            type: 'error'
          }
        }));
      }

    } catch (error) {
      console.error('❌ MyChurchPanel: Error updating church (from Save & Close):', error);
      window.dispatchEvent(new CustomEvent('toast', {
        detail: {
          message: 'Error saving church information. Please try again.',
          type: 'error'
        }
      }));
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle remove church
  const handleRemoveChurch = async () => {
    setIsSubmitting(true);

    try {
      console.log('📤 MyChurchPanel: Removing church data');
      
      const response = await fetch('/api/user/update-church', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          churchName: null,
          churchCity: null,
          churchState: null
        })
      });

      console.log('📥 MyChurchPanel: API response status:', response.status);
      const data = await response.json();
      console.log('📥 MyChurchPanel: API response data:', data);

      if (response.ok) {
        console.log('✅ MyChurchPanel: Church data removed successfully');
        
        // Clear form data
        const emptyData = {
          churchName: '',
          churchCity: '',
          churchState: ''
        };
        setFormData(emptyData);
        // Update originalFormData as well
        setOriginalFormData(emptyData);
        
        // Update state
        setHasExistingData(false);
        setViewMode('edit');
        
        // Show success toast
        window.dispatchEvent(new CustomEvent('toast', {
          detail: {
            message: 'Church information removed successfully!',
            type: 'success'
          }
        }));
      } else {
        console.error('❌ MyChurchPanel: Church removal failed:', data);
        
        // Show error toast
        window.dispatchEvent(new CustomEvent('toast', {
          detail: {
            message: data.error || 'Failed to remove church information. Please try again.',
            type: 'error'
          }
        }));
      }

    } catch (error) {
      console.error('❌ MyChurchPanel: Error removing church:', error);
      window.dispatchEvent(new CustomEvent('toast', {
        detail: {
          message: 'Error removing church information. Please try again.',
          type: 'error'
        }
      }));
    } finally {
      setIsSubmitting(false);
    }
  };

  // Format location for tag pill
  const formatLocation = () => {
    const parts = [];
    if (formData.churchCity) parts.push(formData.churchCity);
    if (formData.churchState) parts.push(formData.churchState);
    return parts.join(', ');
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-[var(--color-deep-grey)]">Loading...</div>
      </div>
    );
  }

  // View mode - show church info with button to edit
  if (hasExistingData && viewMode === 'view') {
    const locationText = formatLocation();
    
    return (
      <div className="h-full flex flex-col min-h-0">
        {/* Content area that expands to fill available space */}
        <div className="flex-1 flex flex-col min-h-0">
          {/* Single unified panel using CardStack structure */}
          <div className="bg-white box-border flex flex-col min-h-0 flex-1 items-start justify-between overflow-clip pb-6 pt-0 px-0 relative rounded-[24px] shadow-[0px_3px_20px_0px_rgba(120,118,111,0.1)] w-full mb-3.5">
            {/* Header section with paper background */}
            <div 
              className="box-border content-stretch flex gap-3 items-center justify-center leading-[0] mb-[-24px] not-italic pb-12 pt-6 px-6 relative shrink-0 w-full rounded-t-3xl"
              style={{ backgroundColor: 'var(--color-paper)' }}
            >
              <div className="basis-0 font-sans font-bold grow min-h-px min-w-px relative shrink-0 text-[24px] text-center">
                <p className="leading-[normal] text-[var(--color-deep-grey)]">My Church</p>
              </div>
            </div>
            
            {/* Content area */}
            <div className="flex-1 box-border content-stretch flex flex-col items-start justify-start mb-[-24px] min-h-0 overflow-clip relative w-full">
              <div className="flex-1 bg-[var(--color-snow-white)] box-border content-stretch flex flex-col gap-3 items-start justify-start min-h-0 overflow-x-clip overflow-y-auto p-[12px] relative rounded-tl-[24px] rounded-tr-[24px] w-full">
                
                {/* Church Button - Clickable to edit */}
                <button
                  type="button"
                  onClick={switchToEditMode}
                  className="space-button relative rounded-xl h-[60px] cursor-pointer transition-[scale,shadow] duration-300 px-4 w-full"
                  style={{ backgroundImage: 'var(--color-gradient-gray)' }}
                >
                  <div className="flex items-center justify-between relative w-full h-full pl-2 pr-0 transition-transform duration-125 min-w-0">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      {/* Church Icon */}
                      <div className="relative shrink-0 w-5 h-5">
                        <img 
                          src={ChurchIcon.src} 
                          alt="Church" 
                          className="block max-w-none w-full h-full fill-[var(--color-deep-grey)]" 
                        />
                      </div>
                      
                      {/* Church Name */}
                      <span className="text-[var(--color-deep-grey)] font-sans text-[18px] font-semibold whitespace-nowrap overflow-hidden text-ellipsis flex-1 min-w-0 text-left">
                        {formData.churchName || 'Church Name'}
                      </span>
                      
                      {/* Location Tag Pill */}
                      {locationText && (
                        <div className="bg-[rgba(120,118,111,0.1)] flex items-center justify-center rounded-[24px] px-3 py-1 h-[24px] shrink-0">
                          <span className="text-[14px] font-sans font-semibold text-[var(--color-deep-grey)] leading-[normal] text-center text-nowrap whitespace-pre">
                            {locationText}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="absolute inset-0 pointer-events-none rounded-xl transition-shadow duration-125 shadow-[0px_-2.622px_0px_0px_inset_rgba(176,176,176,0.25)]" />
                </button>
                
                {/* Remove Church Button */}
                <button
                  type="button"
                  onClick={handleRemoveChurch}
                  disabled={isSubmitting}
                  className="group relative rounded-3xl cursor-pointer transition-[scale,shadow] duration-300 pb-7 pt-6 px-6 flex items-center justify-center font-sans font-semibold text-[18px] leading-[0] text-nowrap text-[var(--color-fog-white)] h-[60px] w-full shadow-[0px_4px_4px_0px_rgba(0,0,0,0.25)] disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ backgroundColor: 'var(--color-red)' }}
                >
                  <div className="relative shrink-0 transition-transform duration-125">
                    {isSubmitting ? 'Removing...' : 'Remove Church'}
                  </div>
                  <div className="absolute inset-0 pointer-events-none rounded-3xl transition-shadow duration-125 shadow-[0px_-4px_0px_0px_rgba(0,0,0,0.1)_inset] group-active:!shadow-[0px_-2px_0px_0px_rgba(0,0,0,0.1)_inset]" />
                </button>
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
        </div>
      </div>
    );
  }

  // Edit mode - show form
  return (
    <div className="h-full flex flex-col min-h-0">
      <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
        {/* Content area that expands to fill available space */}
        <div className="flex-1 flex flex-col min-h-0">
          {/* Single unified panel using CardStack structure */}
          <div className="bg-white box-border flex flex-col min-h-0 flex-1 items-start justify-between overflow-clip pb-6 pt-0 px-0 relative rounded-[24px] shadow-[0px_3px_20px_0px_rgba(120,118,111,0.1)] w-full mb-3.5">
            {/* Header section with paper background */}
            <div 
              className="box-border content-stretch flex gap-3 items-center justify-center leading-[0] mb-[-24px] not-italic pb-12 pt-6 px-6 relative shrink-0 w-full rounded-t-3xl"
              style={{ backgroundColor: 'var(--color-paper)' }}
            >
              <div className="basis-0 font-sans font-bold grow min-h-px min-w-px relative shrink-0 text-[24px] text-center">
                <p className="leading-[normal] text-[var(--color-deep-grey)]">My Church</p>
              </div>
            </div>
            
            {/* Content area */}
            <div className="flex-1 box-border content-stretch flex flex-col items-start justify-start mb-[-24px] min-h-0 overflow-clip relative w-full">
              <div className="flex-1 bg-[var(--color-snow-white)] box-border content-stretch flex flex-col gap-3 items-start justify-start min-h-0 overflow-x-clip overflow-y-auto p-[12px] relative rounded-tl-[24px] rounded-tr-[24px] w-full">
                
                {/* Church Name Input - Full Width */}
                <div className="w-full">
                  <div className="search-input rounded-3xl py-5 px-4 min-h-[64px] w-full">
                    <input 
                      type="text"
                      value={formData.churchName}
                      onChange={(e) => handleInputChange('churchName', e.target.value)}
                      placeholder="Name of church"
                      className="outline-none bg-transparent text-[18px] font-semibold text-[var(--color-deep-grey)] text-center placeholder:text-[var(--color-pebble-grey)] placeholder:opacity-50 w-full" 
                    />
                  </div>
                  {validationErrors.churchName && (
                    <div className="text-red-500 text-sm mt-1 text-center">
                      {validationErrors.churchName}
                    </div>
                  )}
                </div>
                
                {/* City and State/Province/Region Inputs - Side by Side with wrapping */}
                <div className="flex flex-wrap gap-3 items-start w-full">
                  {/* City Input - Flex grow with min-width */}
                  <div className="flex-1 min-w-[230px]">
                    <div className="search-input rounded-3xl py-5 px-4 min-h-[64px] w-full">
                      <input 
                        type="text"
                        value={formData.churchCity}
                        onChange={(e) => handleInputChange('churchCity', e.target.value)}
                        placeholder="City"
                        className="outline-none bg-transparent text-[18px] font-semibold text-[var(--color-deep-grey)] text-center placeholder:text-[var(--color-pebble-grey)] placeholder:opacity-50 w-full" 
                      />
                    </div>
                    {validationErrors.churchCity && (
                      <div className="text-red-500 text-sm mt-1 text-center">
                        {validationErrors.churchCity}
                      </div>
                    )}
                  </div>
                  
                  {/* State/Province/Region Input - Flex grow with min-width */}
                  <div className="flex-1 min-w-[230px]">
                    <div className="search-input rounded-3xl py-5 px-4 min-h-[64px] w-full">
                      <input 
                        type="text"
                        value={formData.churchState}
                        onChange={(e) => handleInputChange('churchState', e.target.value)}
                        placeholder="State/Province/Region"
                        className="outline-none bg-transparent text-[18px] font-semibold text-[var(--color-deep-grey)] text-center placeholder:text-[var(--color-pebble-grey)] placeholder:opacity-50 w-full" 
                      />
                    </div>
                    {validationErrors.churchState && (
                      <div className="text-red-500 text-sm mt-1 text-center">
                        {validationErrors.churchState}
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
            inBottomSheet={inBottomSheet}
          />
          
          {/* Add Church / Save Changes button - Button Default variant */}
          <button 
            type="submit"
            disabled={isSubmitting}
            data-outer-shadow
            className="group relative rounded-3xl cursor-pointer transition-[scale,shadow] duration-300 pb-7 pt-6 px-6 flex items-center justify-center font-sans font-semibold text-[18px] leading-[0] text-nowrap text-[var(--color-fog-white)] h-[64px] flex-1 shadow-[0px_4px_4px_0px_rgba(0,0,0,0.25)] disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ backgroundColor: 'var(--color-bold-blue)' }}
            tabIndex={3}
          >
            <div className="relative shrink-0 transition-transform duration-125">
              {isSubmitting ? 'Saving...' : (hasExistingData ? 'Save Changes' : 'Add Church')}
            </div>
            <div className="absolute inset-0 pointer-events-none rounded-3xl transition-shadow duration-125 shadow-[0px_-8px_0px_0px_rgba(0,0,0,0.1)_inset] group-active:!shadow-[0px_-2px_0px_0px_rgba(0,0,0,0.1)_inset]" />
          </button>
        </div>
      </form>

      {/* Unsaved Changes Dialog - Rendered via Portal to ensure full viewport coverage */}
      {showUnsavedDialog && typeof document !== 'undefined' && createPortal(
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100] p-4 modal-overlay-enter"
          style={{
            paddingTop: 'max(1rem, env(safe-area-inset-top))',
            paddingBottom: 'max(1rem, env(safe-area-inset-bottom))'
          }}
          onClick={(e) => {
            // Close dialog if clicking on the overlay (but not the dialog content)
            if (e.target === e.currentTarget) {
              setShowUnsavedDialog(false);
            }
          }}
        >
          <div 
            className="bg-white rounded-xl p-6 max-w-md w-full shadow-lg modal-content-enter"
            onClick={(e) => e.stopPropagation()}
            style={{ pointerEvents: 'auto' }}
          >
            <h3 className="text-lg font-semibold text-[var(--color-deep-grey)] mb-2">
              Unsaved Changes
            </h3>
            <p className="text-[var(--color-pebble-grey)] mb-6">
              You have unsaved changes. What would you like to do?
            </p>
            <div className="flex gap-3 justify-end">
              <ButtonSmall
                type="button"
                onClick={() => setShowUnsavedDialog(false)}
                state="Secondary"
              >
                Cancel
              </ButtonSmall>
              <ButtonSmall
                type="button"
                onClick={handleDiscardChanges}
                state="Delete"
              >
                Discard
              </ButtonSmall>
              <ButtonSmall
                type="button"
                onClick={handleSaveAndClose}
                state="Default"
              >
                Save & Close
              </ButtonSmall>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

