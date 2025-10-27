import React from 'react';

interface AvatarProps {
  initials?: string;
  color?: string;
  className?: string;
}

const Avatar: React.FC<AvatarProps> = ({ 
  initials = "DJ", 
  color = "paper",
  className = "" 
}) => {
  return (
    <div 
      className={`avatar-button box-border content-stretch flex flex-col items-center justify-center overflow-clip p-[12px] relative rounded-[64px] size-[64px] cursor-pointer transition-[scale,shadow] duration-300 ${className}`}
      style={{ background: `var(--color-${color})` }}
    >
      <div className="font-sans font-semibold leading-[0] not-italic relative shrink-0 text-[var(--color-deep-grey)] text-[18px] text-nowrap transition-transform duration-125">
        <p className="leading-[normal] whitespace-pre">{initials}</p>
      </div>
      
      <style jsx>{`
        .avatar-button {
          will-change: transform, box-shadow;
          transition: box-shadow 0.125s ease-in-out;
          box-shadow: 0px -3px 0px 0px rgba(176,176,176,0.25) inset;
        }

        .avatar-button:active {
          filter: brightness(0.97);
          box-shadow: 
            0px -1px 0px 0px rgba(176,176,176,0.25) inset,
            0px 1px 0px 0px rgba(176,176,176,0.25) inset;
        }

        .avatar-button:active > div {
          translate: 0 0;
          transform: scale(0.98);
        }
      `}</style>
    </div>
  );
};

export default Avatar;
