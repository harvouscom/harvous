import React, { useEffect, useState } from 'react';
import { getThreadTextColorCSS, type ThreadColor } from '@/utils/colors';

interface AvatarProps {
  initials?: string;
  color?: string;
  className?: string;
  /** Clerk profile photo URL; when set, replaces initials squircle. */
  imageUrl?: string | null;
}

const Avatar: React.FC<AvatarProps> = ({
  initials = 'DJ',
  color = 'blue',
  className = '',
  imageUrl = null,
}) => {
  const [photoLoadFailed, setPhotoLoadFailed] = useState(false);

  useEffect(() => {
    setPhotoLoadFailed(false);
  }, [imageUrl]);

  const hasPhoto = typeof imageUrl === 'string' && imageUrl.length > 0 && !photoLoadFailed;

  return (
    <div
      className={`avatar ${className}${hasPhoto ? ' avatar--photo' : ''}`}
      style={hasPhoto ? undefined : { background: `var(--color-${color})` }}
      data-avatar-color={color}
      data-avatar-initials={initials}
      data-avatar-has-photo={hasPhoto ? 'true' : 'false'}
    >
      {hasPhoto ? (
        <img src={imageUrl} alt="" className="avatar__photo" onError={() => setPhotoLoadFailed(true)} />
      ) : (
        <div className="avatar__initials" style={{ color: getThreadTextColorCSS(color as ThreadColor) }}>
          <p>{initials}</p>
        </div>
      )}
    </div>
  );
};

export default Avatar;
