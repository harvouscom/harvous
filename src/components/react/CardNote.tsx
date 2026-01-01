import React, { useState } from 'react';
import Icon from './Icon';
import { generateThreadMeshGradient } from '@/utils/colors';

interface CardNoteProps {
  variant?: "default" | "withImage";
  title?: string;
  content?: string;
  imageUrl?: string;
  noteType?: 'default' | 'scripture' | 'resource';
  className?: string;
  onClick?: () => void;
  // Resource metadata (for resource note type)
  resourceTitle?: string | null;
  resourceDescription?: string | null;
  resourceImage?: string | null;
  resourceUrl?: string | null;
  showSource?: boolean; // Control whether to show source bar for resource notes
  // Thread colors for mesh gradient background
  threadColors?: Array<{ color: string; frequency: number }>;
  // Note ID for deterministic gradient variation
  noteId?: string;
  // New prop: only show collapsible scripture refs in dashboard list view
  showScriptureRefsCollapsible?: boolean;
  // Scripture references from junction table (with note IDs and thread colors for linking and mesh gradient)
  scriptureReferences?: Array<{ reference: string; noteId: string; threadColors?: Array<{ color: string; frequency: number }> }>;
}

// Helper function to convert HTML to readable text
import { stripHtmlForCard } from '@/utils/html-stripper';

// Legacy function name kept for compatibility - now uses centralized utility
function stripHtml(html: string): string {
  return stripHtmlForCard(html, true); // Use DOM-based approach for client-side
}

const CardNote: React.FC<CardNoteProps> = ({
  variant = "default",
  title,
  content,
  imageUrl,
  noteType = 'default',
  className = "",
  onClick,
  resourceTitle,
  resourceDescription,
  resourceImage,
  resourceUrl,
  showSource = true,
  threadColors,
  noteId,
  showScriptureRefsCollapsible = false,
  scriptureReferences: propScriptureReferences = []
}) => {
  const [isScriptureRefsExpanded, setIsScriptureRefsExpanded] = useState(false);
  // For resource notes, prioritize metadata over regular props
  const effectiveTitle = noteType === 'resource' 
    ? (resourceTitle || title || "Untitled Resource")
    : (title || "Untitled Note");
  const effectiveContent = noteType === 'resource' 
    ? (resourceDescription || content || "")
    : (content || "");
  const effectiveImageUrl = noteType === 'resource' 
    ? (resourceImage || imageUrl)
    : imageUrl;
  
  // Use scripture references from props (from junction table) - only for default notes when collapsible is enabled
  const scriptureReferences = (noteType === 'default' && showScriptureRefsCollapsible && propScriptureReferences.length > 0)
    ? propScriptureReferences
    : [];
  
  // For resource notes with images, automatically use withImage variant
  const effectiveVariant = (noteType === 'resource' && effectiveImageUrl) ? "withImage" : variant;
  
  // Generate mesh gradient from thread colors (only if no image present)
  const meshGradient = !effectiveImageUrl && threadColors && threadColors.length > 0
    ? generateThreadMeshGradient(threadColors, noteId)
    : null;
  
  // Sidebar style: use gradient if available, otherwise default
  const sidebarStyle = meshGradient
    ? { 
        backgroundColor: 'var(--color-light-paper)',
        backgroundImage: meshGradient
      }
    : undefined;
  
  // Determine if scripture refs will be shown
  const hasScriptureRefs = showScriptureRefsCollapsible && noteType === 'default' && scriptureReferences.length > 0;
  
  return (
    <div className={`card card-note ${className}`} onClick={onClick}>
      {effectiveVariant === "default" && (
        hasScriptureRefs ? (
          <div className="card-note__inner">
            <div className="card-note__content" style={{ display: 'flex', flexDirection: 'column', gap: isScriptureRefsExpanded ? '8px' : '0px', paddingTop: '8px', paddingBottom: isScriptureRefsExpanded ? '0px' : '8px', paddingLeft: '8px', paddingRight: '8px' }}>
              {/* When scripture refs exist, wrap sidebar and body in a container */}
              <div style={{ display: 'flex', gap: '12px', alignItems: 'stretch' }}>
                {/* Left sidebar with note type icon */}
                <div 
                  className={`card-note__sidebar ${noteType === 'resource' ? 'card-note__sidebar--resource' : ''}`}
                  style={sidebarStyle}
                >
                  <div className="card-note__sidebar-icon">
                    {noteType === 'scripture' ? (
                      <Icon name="scroll" size={20} style={{ color: 'var(--color-deep-grey)', opacity: 0.3 }} />
                    ) : noteType === 'resource' ? (
                      <Icon name="newspaper" size={20} style={{ color: 'var(--color-deep-grey)', opacity: 0.3 }} />
                    ) : (
                      <svg fill="currentColor" viewBox="0 0 24 24" style={{ color: 'var(--color-deep-grey)', opacity: 0.3 }}>
                        <path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z"/>
                      </svg>
                    )}
                  </div>
                </div>
                
                {/* Right content area */}
                <div className="card-note__body">
                  <div className="card-note__text">
                    <div className="card-note__title">
                      <p>{effectiveTitle || "Quick Tour of Harvous"}</p>
                    </div>
                    {/* Show excerpt for non-resource notes, resource notes without URL, or resource notes with showSource=false */}
                    {(noteType !== 'resource' || !resourceUrl || !showSource) && (
                      <div 
                        className={`card-note__excerpt ${hasScriptureRefs ? 'card-note__excerpt--with-scripture-refs' : ''}`}
                        style={hasScriptureRefs ? {
                          display: 'flex',
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: '8px',
                          width: '100%'
                        } : {}}
                      >
                        <p style={hasScriptureRefs ? { flex: 1, minWidth: 0 } : {}}>
                          {effectiveContent ? stripHtml(effectiveContent) : ""}
                        </p>
                        {/* Scripture refs trigger inline with excerpt */}
                        {hasScriptureRefs && (
                          <div
                            onClick={(e) => {
                              e.preventDefault(); // Prevent link navigation
                              e.stopPropagation(); // Prevent card click
                              setIsScriptureRefsExpanded(!isScriptureRefsExpanded);
                            }}
                            style={{
                              cursor: 'pointer',
                              userSelect: 'none',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              backgroundColor: 'var(--color-fog-white)',
                              borderRadius: '8px',
                              padding: '4px 8px',
                              flexShrink: 0
                            }}
                          >
                            <span 
                              style={{
                                fontSize: '10px',
                                color: 'var(--color-stone-grey)',
                                fontWeight: 600,
                                whiteSpace: 'nowrap'
                              }}
                            >
                              {scriptureReferences.length} {scriptureReferences.length === 1 ? 'scripture note included' : 'scripture notes included'}
                            </span>
                            <Icon 
                              name="chevron-down" 
                              size={10} 
                              style={{ 
                                transform: isScriptureRefsExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                                color: 'var(--color-stone-grey)',
                                flexShrink: 0
                              }} 
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
              
              {/* Scripture references dropdown list (only in dashboard list view) */}
              {showScriptureRefsCollapsible && noteType === 'default' && scriptureReferences.length > 0 && isScriptureRefsExpanded && (
                <div 
                  className="card-note__scripture-refs"
                  style={{
                    display: 'flex',
                    flexDirection: 'column'
                  }}
                >
                  <div 
                    onClick={(e) => {
                      // Only prevent navigation if clicking on the div itself, not on links
                      if (e.target === e.currentTarget) {
                        e.preventDefault();
                        e.stopPropagation();
                      }
                    }}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                      maxHeight: '280px',
                      overflowY: 'auto',
                      paddingBottom: '8px',
                      animation: 'cardFadeIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) both'
                    }}
                    className="card-note__scripture-refs-list"
                  >
                    {scriptureReferences.map((ref, index) => {
                      // Generate mesh gradient from thread colors for this scripture note
                      const meshGradient = ref.threadColors && ref.threadColors.length > 0
                        ? generateThreadMeshGradient(ref.threadColors, ref.noteId)
                        : null;
                      
                      const accentBarStyle: React.CSSProperties = {
                        position: 'absolute',
                        top: 0,
                        bottom: 0,
                        left: 0,
                        width: '2.75rem',
                        borderTopLeftRadius: '0.75rem',
                        borderBottomLeftRadius: '0.75rem',
                        overflow: 'hidden',
                        ...(meshGradient 
                          ? { 
                              backgroundColor: 'var(--color-light-paper)',
                              backgroundImage: meshGradient
                            }
                          : { backgroundColor: 'var(--color-light-paper)' }
                        )
                      };

                      return (
                        <a
                          key={index}
                          href={`/${ref.noteId}`}
                          onClick={(e) => {
                            e.stopPropagation(); // Prevent card click, but allow link navigation
                          }}
                          className="block transition-transform duration-200 hover:scale-[1.002] active:scale-[0.99]"
                          style={{
                            textDecoration: 'none',
                            display: 'block',
                            animation: 'cardFadeIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) both',
                            animationDelay: `${index * 50}ms`
                          }}
                        >
                          <div
                            className="relative cursor-pointer"
                            style={{
                              position: 'relative',
                              borderRadius: '0.75rem',
                              height: '48px',
                              width: '100%',
                              textAlign: 'left',
                              backgroundColor: 'white',
                              boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
                              transition: 'transform 0.2s',
                              cursor: 'pointer'
                            }}
                          >
                            {/* Accent bar on left */}
                            <div style={accentBarStyle} />
                            
                            {/* Content */}
                            <div 
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '1.5rem',
                                paddingLeft: '0.75rem',
                                paddingRight: '3rem',
                                height: '100%',
                                overflow: 'hidden'
                              }}
                            >
                              {/* Scripture icon */}
                              <div style={{ position: 'relative', flexShrink: 0, width: '1.25rem', height: '1.25rem' }}>
                                <Icon name="scroll" size={20} style={{ color: 'var(--color-deep-grey)', opacity: 0.3 }} />
                              </div>
                              
                              {/* Text content */}
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', flex: 1, minWidth: 0 }}>
                                <div style={{ 
                                  fontFamily: 'var(--font-sans)', 
                                  fontWeight: 700, 
                                  color: 'var(--color-deep-grey)', 
                                  fontSize: '16px',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap'
                                }}>
                                  {ref.reference || 'Untitled Scripture'}
                                </div>
                              </div>
                            </div>
                          </div>
                        </a>
                      );
                    })}
                  </div>
                </div>
              )}
          </div>
          {/* Source bar for resource notes - outside content area to match normal preview */}
          {noteType === 'resource' && resourceUrl && showSource && (
            <div 
              className="card-image-link__source"
              style={{
                flexShrink: 0,
                marginTop: '12px'
              }}
            >
              <div className="card-image-link__source-content" style={{ justifyContent: 'space-between' }}>
                <div className="card-image-link__source-text">
                  <p>{(() => {
                    try {
                      const url = new URL(resourceUrl);
                      return url.hostname.replace('www.', '');
                    } catch {
                      return resourceUrl;
                    }
                  })()}</p>
                </div>
                <div className="card-image-link__source-icon">
                  <Icon name="arrow-up-right-from-square" size={20} />
                </div>
              </div>
            </div>
          )}
          <div aria-hidden="true" className="card__border" style={{ borderColor: '#f7f7f6' }} />
        </div>
        ) : (
          /* When no scripture refs, skip card-note__inner wrapper - card-note__content is direct child */
          <div className="card-note__content" style={{ padding: '8px' }}>
            {/* Left sidebar with note type icon */}
            <div 
              className={`card-note__sidebar ${noteType === 'resource' ? 'card-note__sidebar--resource' : ''}`}
              style={sidebarStyle}
            >
              <div className="card-note__sidebar-icon">
                {noteType === 'scripture' ? (
                  <Icon name="scroll" size={20} style={{ color: 'var(--color-deep-grey)', opacity: 0.3 }} />
                ) : noteType === 'resource' ? (
                  <Icon name="newspaper" size={20} style={{ color: 'var(--color-deep-grey)', opacity: 0.3 }} />
                ) : (
                  <svg fill="currentColor" viewBox="0 0 24 24" style={{ color: 'var(--color-deep-grey)', opacity: 0.3 }}>
                    <path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z"/>
                  </svg>
                )}
              </div>
            </div>
            
            {/* Right content area */}
            <div className="card-note__body">
              <div className="card-note__text">
                <div className="card-note__title">
                  <p>{effectiveTitle || "Quick Tour of Harvous"}</p>
                </div>
                {/* Show excerpt for non-resource notes, resource notes without URL, or resource notes with showSource=false */}
                {(noteType !== 'resource' || !resourceUrl || !showSource) && (
                  <div className="card-note__excerpt">
                    <p>{effectiveContent ? stripHtml(effectiveContent) : ""}</p>
                  </div>
                )}
              </div>
            </div>
            <div aria-hidden="true" className="card__border" style={{ borderColor: '#f7f7f6' }} />
          </div>
        )
      )}

      {effectiveVariant === "withImage" && (
        hasScriptureRefs ? (
          <div className="card-note__inner">
            <div className="card-note__content" style={{ display: 'flex', flexDirection: 'column', gap: isScriptureRefsExpanded ? '8px' : '0px', paddingTop: '8px', paddingBottom: isScriptureRefsExpanded ? '0px' : '8px', paddingLeft: '8px', paddingRight: '8px' }}>
              {/* When scripture refs exist, wrap sidebar and body in a container */}
              <div style={{ display: 'flex', gap: '12px', alignItems: 'stretch' }}>
                {/* Left sidebar with image background and note type icon */}
                <div 
                  className={`card-note__sidebar card-note__sidebar--with-image ${noteType === 'resource' ? 'card-note__sidebar--resource' : ''}`}
                  style={effectiveImageUrl 
                    ? { backgroundImage: `url('${effectiveImageUrl}')` } 
                    : sidebarStyle
                  }
                >
                  {/* Hide icon for resource notes with image - the image is enough */}
                  {!(noteType === 'resource' && effectiveImageUrl) && (
                    <div className="card-note__sidebar-icon">
                      {noteType === 'scripture' ? (
                        <Icon name="scroll" size={20} style={{ color: 'var(--color-deep-grey)', opacity: 0.3 }} />
                      ) : noteType === 'resource' ? (
                        <Icon name="newspaper" size={20} style={{ color: 'var(--color-deep-grey)', opacity: 0.3 }} />
                      ) : (
                        <svg fill="currentColor" viewBox="0 0 24 24" style={{ color: 'var(--color-deep-grey)', opacity: 0.3 }}>
                          <path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z"/>
                        </svg>
                      )}
                    </div>
                  )}
                </div>
                
                {/* Right content area */}
                <div className="card-note__body">
                  <div className="card-note__text">
                    <div className="card-note__title">
                      <p>{effectiveTitle || "Note with Image"}</p>
                    </div>
                    {/* Show excerpt for non-resource notes, resource notes without URL, or resource notes with showSource=false */}
                    {(noteType !== 'resource' || !resourceUrl || !showSource) && (
                      <div 
                        className={`card-note__excerpt ${hasScriptureRefs ? 'card-note__excerpt--with-scripture-refs' : ''}`}
                        style={hasScriptureRefs ? {
                          display: 'flex',
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: '8px',
                          width: '100%'
                        } : {}}
                      >
                        <p style={hasScriptureRefs ? { flex: 1, minWidth: 0 } : {}}>
                          {effectiveContent ? stripHtml(effectiveContent) : ""}
                        </p>
                        {/* Scripture refs trigger inline with excerpt */}
                        {hasScriptureRefs && (
                          <div
                            onClick={(e) => {
                              e.preventDefault(); // Prevent link navigation
                              e.stopPropagation(); // Prevent card click
                              setIsScriptureRefsExpanded(!isScriptureRefsExpanded);
                            }}
                            style={{
                              cursor: 'pointer',
                              userSelect: 'none',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              backgroundColor: 'var(--color-fog-white)',
                              borderRadius: '8px',
                              padding: '4px 8px',
                              flexShrink: 0
                            }}
                          >
                            <span 
                              style={{
                                fontSize: '10px',
                                color: 'var(--color-stone-grey)',
                                fontWeight: 600,
                                whiteSpace: 'nowrap'
                              }}
                            >
                              {scriptureReferences.length} {scriptureReferences.length === 1 ? 'scripture note included' : 'scripture notes included'}
                            </span>
                            <Icon 
                              name="chevron-down" 
                              size={10} 
                              style={{ 
                                transform: isScriptureRefsExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                                color: 'var(--color-stone-grey)',
                                flexShrink: 0
                              }} 
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
              
              {/* Scripture references dropdown list (only in dashboard list view) */}
              {showScriptureRefsCollapsible && noteType === 'default' && scriptureReferences.length > 0 && isScriptureRefsExpanded && (
                <div 
                  className="card-note__scripture-refs"
                  style={{
                    display: 'flex',
                    flexDirection: 'column'
                  }}
                >
                  <div 
                    onClick={(e) => {
                      // Only prevent navigation if clicking on the div itself, not on links
                      if (e.target === e.currentTarget) {
                        e.preventDefault();
                        e.stopPropagation();
                      }
                    }}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                      maxHeight: '280px',
                      overflowY: 'auto',
                      paddingBottom: '8px',
                      animation: 'cardFadeIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) both'
                    }}
                    className="card-note__scripture-refs-list"
                  >
                    {scriptureReferences.map((ref, index) => {
                      // Generate mesh gradient from thread colors for this scripture note
                      const meshGradient = ref.threadColors && ref.threadColors.length > 0
                        ? generateThreadMeshGradient(ref.threadColors, ref.noteId)
                        : null;
                      
                      const accentBarStyle: React.CSSProperties = {
                        position: 'absolute',
                        top: 0,
                        bottom: 0,
                        left: 0,
                        width: '2.75rem',
                        borderTopLeftRadius: '0.75rem',
                        borderBottomLeftRadius: '0.75rem',
                        overflow: 'hidden',
                        ...(meshGradient 
                          ? { 
                              backgroundColor: 'var(--color-light-paper)',
                              backgroundImage: meshGradient
                            }
                          : { backgroundColor: 'var(--color-light-paper)' }
                        )
                      };

                      return (
                        <a
                          key={index}
                          href={`/${ref.noteId}`}
                          onClick={(e) => {
                            e.stopPropagation(); // Prevent card click, but allow link navigation
                          }}
                          className="block transition-transform duration-200 hover:scale-[1.002] active:scale-[0.99]"
                          style={{
                            textDecoration: 'none',
                            display: 'block',
                            animation: 'cardFadeIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) both',
                            animationDelay: `${index * 50}ms`
                          }}
                        >
                          <div
                            className="relative cursor-pointer"
                            style={{
                              position: 'relative',
                              borderRadius: '0.75rem',
                              height: '48px',
                              width: '100%',
                              textAlign: 'left',
                              backgroundColor: 'white',
                              boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
                              transition: 'transform 0.2s',
                              cursor: 'pointer'
                            }}
                          >
                            {/* Accent bar on left */}
                            <div style={accentBarStyle} />
                            
                            {/* Content */}
                            <div 
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '1.5rem',
                                paddingLeft: '0.75rem',
                                paddingRight: '3rem',
                                height: '100%',
                                overflow: 'hidden'
                              }}
                            >
                              {/* Scripture icon */}
                              <div style={{ position: 'relative', flexShrink: 0, width: '1.25rem', height: '1.25rem' }}>
                                <Icon name="scroll" size={20} style={{ color: 'var(--color-deep-grey)', opacity: 0.3 }} />
                              </div>
                              
                              {/* Text content */}
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', flex: 1, minWidth: 0 }}>
                                <div style={{ 
                                  fontFamily: 'var(--font-sans)', 
                                  fontWeight: 700, 
                                  color: 'var(--color-deep-grey)', 
                                  fontSize: '16px',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap'
                                }}>
                                  {ref.reference || 'Untitled Scripture'}
                                </div>
                              </div>
                            </div>
                          </div>
                        </a>
                      );
                    })}
                  </div>
                </div>
              )}
          </div>
          {/* Source bar for resource notes - outside content area to match normal preview */}
          {noteType === 'resource' && resourceUrl && showSource && (
            <div 
              className="card-image-link__source"
              style={{
                flexShrink: 0,
                marginTop: '12px'
              }}
            >
              <div className="card-image-link__source-content" style={{ justifyContent: 'space-between' }}>
                <div className="card-image-link__source-text">
                  <p>{(() => {
                    try {
                      const url = new URL(resourceUrl);
                      return url.hostname.replace('www.', '');
                    } catch {
                      return resourceUrl;
                    }
                  })()}</p>
                </div>
                <div className="card-image-link__source-icon">
                  <Icon name="arrow-up-right-from-square" size={20} />
                </div>
              </div>
            </div>
          )}
          <div aria-hidden="true" className="card__border" />
        </div>
        ) : (
          /* When no scripture refs, skip card-note__inner wrapper - card-note__content is direct child */
          <div className="card-note__content" style={{ padding: '8px' }}>
            {/* Left sidebar with image background and note type icon */}
            <div 
              className={`card-note__sidebar card-note__sidebar--with-image ${noteType === 'resource' ? 'card-note__sidebar--resource' : ''}`}
              style={effectiveImageUrl 
                ? { backgroundImage: `url('${effectiveImageUrl}')` } 
                : sidebarStyle
              }
            >
              {/* Hide icon for resource notes with image - the image is enough */}
              {!(noteType === 'resource' && effectiveImageUrl) && (
                <div className="card-note__sidebar-icon">
                  {noteType === 'scripture' ? (
                    <Icon name="scroll" size={20} style={{ color: 'var(--color-deep-grey)', opacity: 0.3 }} />
                  ) : noteType === 'resource' ? (
                    <Icon name="newspaper" size={20} style={{ color: 'var(--color-deep-grey)', opacity: 0.3 }} />
                  ) : (
                    <svg fill="currentColor" viewBox="0 0 24 24" style={{ color: 'var(--color-deep-grey)', opacity: 0.3 }}>
                      <path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z"/>
                    </svg>
                  )}
                </div>
              )}
            </div>
            
            {/* Right content area */}
            <div className="card-note__body">
              <div className="card-note__text">
                <div className="card-note__title">
                  <p>{effectiveTitle || "Note with Image"}</p>
                </div>
                {/* Show excerpt for non-resource notes, resource notes without URL, or resource notes with showSource=false */}
                {(noteType !== 'resource' || !resourceUrl || !showSource) && (
                  <div className="card-note__excerpt">
                    <p>{effectiveContent ? stripHtml(effectiveContent) : ""}</p>
                  </div>
                )}
              </div>
            </div>
            <div aria-hidden="true" className="card__border" />
          </div>
        )
      )}
    </div>
  );
};

export default CardNote;
