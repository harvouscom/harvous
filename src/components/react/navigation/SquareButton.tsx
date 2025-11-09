import React from 'react';

interface SquareButtonProps {
  variant: 'Find' | 'Back';
  onClick?: () => void;
}

const SquareButton: React.FC<SquareButtonProps> = ({ variant, onClick }) => {
  // Import SVG icons based on variant
  const getIcon = () => {
    if (variant === 'Find') {
      // Magnifying glass icon path (from FontAwesome)
      return (
        <svg className="-translate-y-0.5 fill-[var(--color-pebble-grey)] block max-w-none transition-transform duration-125" style={{ width: '20px', height: '20px' }} viewBox="0 0 512 512">
          <path d="M416 208c0 45.9-14.9 88.3-40 122.7L502.6 457.4c12.5 12.5 12.5 32.8 0 45.3s-32.8 12.5-45.3 0L330.7 376c-34.4 25.2-76.8 40-122.7 40C93.1 416 0 322.9 0 208S93.1 0 208 0S416 93.1 416 208zM208 352a144 144 0 1 0 0-288 144 144 0 1 0 0 288z"/>
        </svg>
      );
    } else if (variant === 'Back') {
      // Angle left icon path
      return (
        <svg className="-translate-y-0.5 fill-[var(--color-pebble-grey)] block max-w-none w-full h-full transition-transform duration-125" viewBox="0 0 320 512">
          <path d="M41.4 233.4c-12.5 12.5-12.5 32.8 0 45.3l160 160c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L109.3 256 246.6 118.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0l-160 160z"/>
        </svg>
      );
    }
  };

  return (
    <button
      onClick={onClick}
      className="[&:active_svg]:-translate-y-0 [&:active_svg]:scale-[0.95] relative rounded-3xl w-[64px] h-[64px] cursor-pointer transition-[scale,shadow] duration-300"
      style={{ backgroundImage: 'var(--color-gradient-gray)' }}
    >
      <div className="flex flex-row items-center justify-center relative w-full h-full">
        <div className="box-border flex flex-row gap-3 items-center justify-center pb-5 pt-[18px] px-4 relative w-full h-full">
          <div className="relative shrink-0 w-6 h-6 flex items-center justify-center">
            {getIcon()}
          </div>
        </div>
      </div>
      
      <style jsx>{`
        button {
          will-change: transform, box-shadow;
          transition: box-shadow 0.125s ease-in-out;
          box-shadow: 0px -3px 0px 0px #78766F33 inset;
        }

        button:active {
          filter: brightness(0.97);
          box-shadow: 
            0px -1px 0px 0px #78766F33 inset,
            0px 1px 0px 0px #78766F33 inset;
        }

        button:active > img {
          transform: scale(0.95);
        }
      `}</style>
    </button>
  );
};

export default SquareButton;
