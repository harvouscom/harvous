import React from 'react';
import { getThreadTextColorCSS, type ThreadColor } from '@/utils/colors';

interface AvatarProps {
  initials?: string;
  color?: string;
  className?: string;
}

const Avatar: React.FC<AvatarProps> = ({ 
  initials = "DJ", 
  color = "blue",
  className = "" 
}) => {
  return (
    <div 
      className={`avatar ${className}`}
      style={{ background: `var(--color-${color})` }}
      data-avatar-color={color}
      data-avatar-initials={initials}
    >
      <div className="avatar__initials" style={{ color: getThreadTextColorCSS(color as ThreadColor) }}>
        <p>{initials}</p>
      </div>
    </div>
  );
};

export default Avatar;
