import React, { useState } from 'react';

interface UpgradeButtonGroupProps {
  className?: string;
}

export default function UpgradeButtonGroup({ className = '' }: UpgradeButtonGroupProps) {
  const [selectedInterval, setSelectedInterval] = useState<'month' | 'year'>('month');

  const handleSubscribe = () => {
    const hiddenTable = document.getElementById('hidden-pricing-table');
    if (!hiddenTable) {
      console.error('Hidden pricing table not found');
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
      if (retryCount > 20) {
        console.error('Could not find subscribe button after 20 retries');
        return;
      }

      const subscribeButton = hiddenTable.querySelector(
        '.cl-pricingTableCardFooterButton, ' +
        'button[data-localization-key="billing.subscribe"], ' +
        'button[data-localization-key*="subscribe"], ' +
        'button.cl-button[data-variant="solid"]'
      ) as HTMLButtonElement;

      if (subscribeButton) {
        subscribeButton.click();
      } else {
        // Retry if button not found yet
        setTimeout(() => clickSubscribeButton(retryCount + 1), 100);
      }
    };

    // Start the process
    findAndSetInterval();
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
        data-outer-shadow
        className="btn-cta flex-1 group"
        style={{ width: '100%', marginTop: '1rem' }}
        tabIndex={3}
      >
        <span className="btn-cta__content">
          Continue & Pay
        </span>
        <div className="btn-cta__shadow" />
      </button>
    </div>
  );
}

