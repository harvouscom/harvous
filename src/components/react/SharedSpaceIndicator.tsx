interface SharedSpaceIndicatorProps {
  memberCount: number;
}

export default function SharedSpaceIndicator({ memberCount }: SharedSpaceIndicatorProps) {
  if (memberCount <= 1) {
    return null;
  }

  return (
    <span className="shared-space-badge">
      👥 {memberCount} {memberCount === 1 ? 'person' : 'people'}
      <style>{`
        .shared-space-badge {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 4px 8px;
          background: rgba(102, 126, 234, 0.1);
          color: #667eea;
          border-radius: 12px;
          font-size: 12px;
          font-weight: 500;
          line-height: 1;
        }
      `}</style>
    </span>
  );
}
