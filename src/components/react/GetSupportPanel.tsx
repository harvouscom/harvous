import React from 'react';
import SquareButton from './SquareButton';
import ArrowUpRightFromSquareIcon from "@fortawesome/fontawesome-free/svgs/solid/arrow-up-right-from-square.svg";

interface GetSupportPanelProps {
  onClose?: () => void;
  version?: string;
  helpCenterUrl?: string;
  supportUrl?: string;
  feedbackUrl?: string;
  inBottomSheet?: boolean;
}

export default function GetSupportPanel({ 
  onClose,
  version = '0.10.0',
  helpCenterUrl = 'https://help.harvous.com',
  supportUrl = 'https://support.harvous.com',
  feedbackUrl = 'https://feedback.harvous.com',
  inBottomSheet = false
}: GetSupportPanelProps) {
  // Handle close
  const handleClose = () => {
    if (onClose) {
      onClose();
    } else {
      window.dispatchEvent(new CustomEvent('closeProfilePanel'));
    }
  };

  // Handle external link clicks
  const handleExternalLink = (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  // Handle email link clicks
  const handleEmailLink = (subject: string) => {
    const email = 'derek@harvous.com';
    const mailtoLink = `mailto:${email}?subject=${encodeURIComponent(subject)}`;
    window.location.href = mailtoLink;
  };

  return (
    <>
    <div className="h-full flex flex-col min-h-0">
      {/* Content area - expands on mobile, fits content on desktop */}
      <div className={inBottomSheet ? "flex-1 flex flex-col min-h-0" : "flex flex-col"}>
        {/* Single unified panel using CardStack structure */}
        <div className={`bg-white box-border flex flex-col items-start ${inBottomSheet ? "min-h-0 flex-1 justify-between" : "justify-start"} overflow-clip pb-6 pt-0 px-0 relative rounded-[24px] shadow-[0px_3px_20px_0px_rgba(120,118,111,0.1)] w-full mb-3.5`}>
          {/* Header section with paper background */}
          <div 
            className="box-border content-stretch flex gap-3 items-center justify-center leading-[0] mb-[-24px] not-italic pb-12 pt-6 px-6 relative shrink-0 w-full rounded-t-3xl"
            style={{ backgroundColor: 'var(--color-paper)' }}
          >
            <div className="basis-0 font-sans font-bold grow min-h-px min-w-px relative shrink-0 text-[24px] text-center">
              <p className="leading-[normal] text-[var(--color-deep-grey)]">Get Support</p>
            </div>
          </div>
          
          {/* Content area */}
          <div className={inBottomSheet ? "flex-1 box-border content-stretch flex flex-col items-start justify-start mb-[-24px] min-h-0 overflow-clip relative w-full" : "box-border content-stretch flex flex-col items-start justify-start mb-[-24px] overflow-clip relative w-full"}>
            <div className={inBottomSheet ? "flex-1 bg-[var(--color-snow-white)] box-border content-stretch flex flex-col gap-3 items-start justify-start min-h-0 overflow-x-clip overflow-y-auto p-[12px] relative rounded-tl-[24px] rounded-tr-[24px] w-full" : "bg-[var(--color-snow-white)] box-border content-stretch flex flex-col gap-3 items-start justify-start overflow-x-clip p-[12px] relative rounded-tl-[24px] rounded-tr-[24px] w-full"}>
              
              {/* Visit our help center button */}
              <button
                type="button"
                onClick={() => handleExternalLink(helpCenterUrl)}
                disabled
                className="space-button relative rounded-xl h-[60px] cursor-not-allowed transition-[scale,shadow] duration-300 pl-4 pr-0 w-full opacity-50"
                style={{ backgroundImage: 'var(--color-gradient-gray)' }}
              >
                <div className="flex items-center justify-between relative w-full h-full pl-2 pr-0 transition-transform duration-125 min-w-0">
                  <div className="flex-1 min-w-0 overflow-hidden">
                    <span className="font-sans text-[18px] font-semibold whitespace-nowrap overflow-hidden text-ellipsis block" style={{ color: 'var(--color-deep-grey)' }}>
                      Visit our help center
                    </span>
                  </div>
                  <div className="flex items-center justify-center relative shrink-0">
                    <div className="box-border content-stretch flex gap-2.5 items-center justify-start p-[12px] relative">
                      <div className="flex items-center justify-center relative shrink-0">
                        <div className="relative size-5">
                          <img 
                            src={ArrowUpRightFromSquareIcon.src} 
                            alt="External link" 
                            className="block max-w-none size-full fill-[var(--color-deep-grey)]" 
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="absolute inset-0 pointer-events-none rounded-xl transition-shadow duration-125 shadow-[0px_-2.622px_0px_0px_inset_rgba(176,176,176,0.25)]" />
              </button>

              {/* Reach out to support button */}
              <button
                type="button"
                onClick={() => handleEmailLink('Reach out to support')}
                className="space-button relative rounded-xl h-[60px] cursor-pointer transition-[scale,shadow] duration-300 pl-4 pr-0 w-full"
                style={{ backgroundImage: 'var(--color-gradient-gray)' }}
              >
                <div className="flex items-center justify-between relative w-full h-full pl-2 pr-0 transition-transform duration-125 min-w-0">
                  <div className="flex-1 min-w-0 overflow-hidden">
                    <span className="font-sans text-[18px] font-semibold whitespace-nowrap overflow-hidden text-ellipsis block" style={{ color: 'var(--color-deep-grey)' }}>
                      Reach out to support
                    </span>
                  </div>
                  <div className="flex items-center justify-center relative shrink-0">
                    <div className="box-border content-stretch flex gap-2.5 items-center justify-start p-[12px] relative">
                      <div className="flex items-center justify-center relative shrink-0">
                        <div className="relative size-5">
                          <img 
                            src={ArrowUpRightFromSquareIcon.src} 
                            alt="External link" 
                            className="block max-w-none size-full fill-[var(--color-deep-grey)]" 
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="absolute inset-0 pointer-events-none rounded-xl transition-shadow duration-125 shadow-[0px_-2.622px_0px_0px_inset_rgba(176,176,176,0.25)]" />
              </button>

              {/* Submit feedback button */}
              <button
                type="button"
                onClick={() => handleEmailLink('Submit feedback')}
                className="space-button relative rounded-xl h-[60px] cursor-pointer transition-[scale,shadow] duration-300 pl-4 pr-0 w-full"
                style={{ backgroundImage: 'var(--color-gradient-gray)' }}
              >
                <div className="flex items-center justify-between relative w-full h-full pl-2 pr-0 transition-transform duration-125 min-w-0">
                  <div className="flex-1 min-w-0 overflow-hidden">
                    <span className="font-sans text-[18px] font-semibold whitespace-nowrap overflow-hidden text-ellipsis block" style={{ color: 'var(--color-deep-grey)' }}>
                      Submit feedback
                    </span>
                  </div>
                  <div className="flex items-center justify-center relative shrink-0">
                    <div className="box-border content-stretch flex gap-2.5 items-center justify-start p-[12px] relative">
                      <div className="flex items-center justify-center relative shrink-0">
                        <div className="relative size-5">
                          <img 
                            src={ArrowUpRightFromSquareIcon.src} 
                            alt="External link" 
                            className="block max-w-none size-full fill-[var(--color-deep-grey)]" 
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="absolute inset-0 pointer-events-none rounded-xl transition-shadow duration-125 shadow-[0px_-2.622px_0px_0px_inset_rgba(176,176,176,0.25)]" />
              </button>

              {/* Version text */}
              <div className="font-sans font-normal leading-[0] overflow-ellipsis overflow-hidden relative shrink-0 text-[12px] text-[var(--color-stone-grey)] text-center w-full">
                <p className="leading-[1.3]">Version {version}</p>
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
      </div>
    </div>

    <style>{`
      .space-button {
        will-change: transform;
        transition: box-shadow 0.125s ease-in-out;
      }

      .space-button:not([data-outer-shadow]):active {
        filter: brightness(0.97);
        box-shadow: 
          0px -1px 0px 0px rgba(120, 118, 111, 0.2) inset,
          0px 1px 0px 0px rgba(120, 118, 111, 0.2) inset;
      }

      .space-button:active > div {
        translate: 0 0;
        transform: scale(0.98);
      }

      .space-button:active img {
        transform: scale(0.95);
      }
    `}</style>
    </>
  );
}

