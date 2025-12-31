import React, { useState } from 'react';

interface UpgradeButtonGroupProps {
  className?: string;
}

/**
 * Check if Clerk is initialized and ready
 * Uses the same detection method as SafeSubscriptionDetailsButton
 */
const isClerkReady = (): boolean => {
  if (typeof window === 'undefined') return false;
  
  // Check for Clerk's frontend API in window (set when ClerkProvider initializes)
  if ((window as any).__clerk_frontend_api) {
    return true;
  }
  
  return false;
};

/**
 * Wait for Clerk to be ready before proceeding
 * Returns a promise that resolves when Clerk is ready or times out
 */
const waitForClerk = (maxWaitMs: number = 3000): Promise<boolean> => {
  return new Promise((resolve) => {
    // Check immediately
    if (isClerkReady()) {
      resolve(true);
      return;
    }
    
    // Poll for Clerk to become available
    let attempts = 0;
    const maxAttempts = Math.floor(maxWaitMs / 100); // Check every 100ms
    
    const checkInterval = setInterval(() => {
      attempts++;
      if (isClerkReady()) {
        clearInterval(checkInterval);
        resolve(true);
      } else if (attempts >= maxAttempts) {
        // Timeout - resolve anyway to prevent infinite waiting
        clearInterval(checkInterval);
        resolve(false);
      }
    }, 100);
  });
};

export default function UpgradeButtonGroup({ className = '' }: UpgradeButtonGroupProps) {
  const [selectedInterval, setSelectedInterval] = useState<'month' | 'year'>('month');
  const [isProcessing, setIsProcessing] = useState(false);

  const handleSubscribe = async () => {
    // Prevent multiple clicks while processing
    if (isProcessing) {
      return;
    }
    
    setIsProcessing(true);
    
    try {
      // Wait for Clerk to be ready before proceeding
      const clerkReady = await waitForClerk(3000);
      
      if (!clerkReady) {
        console.warn('Clerk not ready after waiting, proceeding anyway - PricingTable may not be initialized');
      }
      
      // Give PricingTable a moment to initialize its buttons after Clerk is ready
      // Even though Clerk is ready, the PricingTable component needs time to render
      await new Promise(resolve => setTimeout(resolve, 200));
      
      const hiddenTable = document.getElementById('hidden-pricing-table');
      if (!hiddenTable) {
        console.error('Hidden pricing table not found');
        setIsProcessing(false);
        return;
      }

    const shouldBeAnnual = selectedInterval === 'year';

    // First, find and set the billing interval toggle
    const findAndSetInterval = (retryCount = 0) => {
      if (retryCount > 20) {
        // Proceed to subscribe anyway if toggle not found
        clickSubscribeButton();
        return;
      }

      // Try to find ALL possible toggle elements
      const allInputs = hiddenTable.querySelectorAll('input[type="checkbox"], input[type="radio"]');
      const allSwitches = hiddenTable.querySelectorAll('[role="switch"]');

      // Try multiple selectors to find the billing interval toggle
      // Clerk's PricingTable typically uses a toggle switch for annual billing
      let billingToggle: HTMLInputElement | HTMLElement | null = null;

      // Strategy 1: Look for checkbox inputs first
      for (const input of Array.from(allInputs)) {
        const inputEl = input as HTMLInputElement;
        // Check if it's related to billing/annual
        const parent = inputEl.closest('[class*="toggle"], [class*="switch"], [class*="billing"], [class*="annual"]');
        if (parent || inputEl.name?.includes('annual') || inputEl.name?.includes('billing') || 
            inputEl.id?.includes('annual') || inputEl.id?.includes('billing')) {
          billingToggle = inputEl;
          break;
        }
      }

      // Strategy 2: Look for switch role elements
      if (!billingToggle && allSwitches.length > 0) {
        billingToggle = allSwitches[0] as HTMLElement;
      }

      // Strategy 3: Look for any checkbox in the pricing table
      if (!billingToggle && allInputs.length > 0) {
        billingToggle = allInputs[0] as HTMLInputElement;
      }

      if (billingToggle) {
        let isChecked = false;
        let toggleElement: HTMLInputElement | HTMLElement | null = null;

        // If it's an input, use it directly
        if (billingToggle instanceof HTMLInputElement) {
          toggleElement = billingToggle;
          isChecked = billingToggle.checked;
        } else {
          // Try to find an input inside the element
          const inputInside = billingToggle.querySelector('input[type="checkbox"], input[type="radio"]') as HTMLInputElement;
          if (inputInside) {
            toggleElement = inputInside;
            isChecked = inputInside.checked;
          } else {
            // Check aria-checked for non-input elements
            const ariaChecked = billingToggle.getAttribute('aria-checked');
            isChecked = ariaChecked === 'true';
            toggleElement = billingToggle;
          }
        }

        // Only toggle if state doesn't match
        if (isChecked !== shouldBeAnnual && toggleElement) {
          // Always click to toggle, as this is more reliable with Clerk's components
          if (toggleElement instanceof HTMLInputElement) {
            // For inputs, try clicking the associated label first, then the input
            const label = hiddenTable.querySelector(`label[for="${toggleElement.id}"]`) as HTMLLabelElement;
            if (label) {
              label.click();
            } else {
              // If no label, click the input directly
              toggleElement.click();
            }
            // Also set the checked state and dispatch events
            toggleElement.checked = shouldBeAnnual;
            toggleElement.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
            toggleElement.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
            toggleElement.dispatchEvent(new Event('click', { bubbles: true, cancelable: true }));
          } else {
            // For non-input elements, click to toggle
            (toggleElement as HTMLElement).click();
          }

          // Wait for PricingTable to update, then verify and click subscribe
          setTimeout(() => {
            // Verify the toggle state after clicking
            let verifyChecked = false;
            if (toggleElement instanceof HTMLInputElement) {
              verifyChecked = toggleElement.checked;
            } else {
              const verifyAria = toggleElement.getAttribute('aria-checked');
              verifyChecked = verifyAria === 'true';
            }

            // If still not in correct state, try clicking again (max 3 retries)
            if (verifyChecked !== shouldBeAnnual && retryCount < 3) {
              setTimeout(() => findAndSetInterval(retryCount + 1), 200);
            } else {
              clickSubscribeButton();
            }
          }, 500);
        } else {
          // Already in correct state, proceed to subscribe
          clickSubscribeButton();
        }
      } else {
        // Toggle not found yet, retry
        setTimeout(() => findAndSetInterval(retryCount + 1), 100);
      }
    };

    const clickSubscribeButton = (retryCount = 0) => {
      // Reduce retry limit since we now wait for Clerk first
      // If Clerk is ready, the button should be available soon
      const maxRetries = 30;
      
      if (retryCount > maxRetries) {
        // Only log error in development, reduce noise in production
        if (import.meta.env.DEV) {
          console.error(`Could not find subscribe button after ${maxRetries} retries`);
          console.error('Hidden table element:', hiddenTable);
          console.error('Hidden table HTML:', hiddenTable?.innerHTML?.substring(0, 500));
          console.error('All buttons in hidden table:', hiddenTable?.querySelectorAll('button'));
        }
        setIsProcessing(false);
        return;
      }

      // Try multiple selectors - Clerk may use different class names in production
      const selectors = [
        '.cl-pricingTableCardFooterButton',
        'button[data-localization-key="billing.subscribe"]',
        'button[data-localization-key*="subscribe"]',
        'button.cl-button[data-variant="solid"]',
        'button[class*="pricingTable"][class*="Button"]',
        'button[class*="pricing"][class*="subscribe"]',
        'button[class*="cl-button"][data-variant="solid"]',
        // Fallback: any button in the pricing table footer/card
        '.cl-pricingTable button',
        '#hidden-pricing-table button',
        // Last resort: any solid button variant
        'button[data-variant="solid"]'
      ];

      let subscribeButton: HTMLButtonElement | null = null;
      
      for (const selector of selectors) {
        const button = hiddenTable.querySelector(selector) as HTMLButtonElement;
        if (button) {
          // Don't check visibility - the hidden table has visibility: hidden,
          // but the buttons inside are still functional and clickable
          // Only check that the button exists and is not display:none
          const style = window.getComputedStyle(button);
          if (style.display !== 'none') {
            subscribeButton = button;
            break;
          }
        }
      }

      if (subscribeButton) {
        subscribeButton.click();
        setIsProcessing(false);
      } else {
        // Retry if button not found yet
        setTimeout(() => clickSubscribeButton(retryCount + 1), 100);
      }
    };

    // Start the process
    findAndSetInterval();
    } catch (error) {
      console.error('Error in handleSubscribe:', error);
      setIsProcessing(false);
    }
  };

  return (
    <div className={className}>
      {/* Button group for billing interval - Monthly first, Annual second */}
      <div className="button-group">
        <div className="button-group__container">
          {/* Monthly button - First/Left */}
          <button
            type="button"
            onClick={() => setSelectedInterval('month')}
            className={`space-button button-group__button button-group__button--left h-[64px] ${
              selectedInterval === 'month' 
                ? '' 
                : 'bg-transparent'
            }`}
            style={selectedInterval === 'month' ? { 
              backgroundImage: 'var(--color-gradient-gray)',
              paddingLeft: '1.5rem',
              paddingRight: '1.5rem',
              paddingTop: 0,
              paddingBottom: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center'
            } : {
              paddingLeft: '1.5rem',
              paddingRight: '1.5rem',
              paddingTop: 0,
              paddingBottom: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center'
            }}
          >
            <span 
              className="font-sans text-[18px] font-semibold whitespace-nowrap"
              style={{
                color: selectedInterval === 'month' 
                  ? 'var(--color-deep-grey)' 
                  : 'var(--color-pebble-grey)',
                opacity: selectedInterval === 'month' ? 1 : 0.6,
                textAlign: 'center',
                width: '100%',
                display: 'block'
              }}
            >
              $6 per month
            </span>
          </button>
          
          {/* Annual button - Second/Right */}
          <button
            type="button"
            onClick={() => setSelectedInterval('year')}
            className={`space-button button-group__button button-group__button--right h-[64px] ${
              selectedInterval === 'year' 
                ? '' 
                : 'bg-transparent'
            }`}
            style={selectedInterval === 'year' ? { 
              backgroundImage: 'var(--color-gradient-gray)',
              paddingLeft: '1.5rem',
              paddingRight: '1.5rem',
              paddingTop: 0,
              paddingBottom: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center'
            } : {
              paddingLeft: '1.5rem',
              paddingRight: '1.5rem',
              paddingTop: 0,
              paddingBottom: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center'
            }}
          >
            <span 
              className="font-sans text-[18px] font-semibold whitespace-nowrap"
              style={{
                color: selectedInterval === 'year' 
                  ? 'var(--color-deep-grey)' 
                  : 'var(--color-pebble-grey)',
                opacity: selectedInterval === 'year' ? 1 : 0.6,
                textAlign: 'center',
                width: '100%',
                display: 'block'
              }}
            >
              $39 per year
            </span>
          </button>
        </div>
      </div>

      {/* Upgrade & Pay button - matches Create Thread button style */}
      <button
        type="button"
        onClick={handleSubscribe}
        disabled={isProcessing}
        data-outer-shadow
        className="btn-cta flex-1 group"
        style={{ 
          width: '100%', 
          marginTop: '1.5rem',
          opacity: isProcessing ? 0.7 : 1,
          cursor: isProcessing ? 'wait' : 'pointer'
        }}
        tabIndex={3}
      >
        <span className="btn-cta__content">
          {isProcessing ? 'Loading...' : 'Continue & Pay'}
        </span>
        <div className="btn-cta__shadow" />
      </button>
    </div>
  );
}

