import React, { useState } from 'react';
import Icon from './Icon';
import { generateThreadMeshGradient } from '@/utils/colors';
import { idToUrl } from '@/utils/url-helpers';
import {
  CondensedNoteRowLayout,
  condensedNoteRowIcon,
  getCondensedNoteAccentBarStyle,
  getCondensedNoteMeshGradient,
} from './CondensedNoteRowLayout';
import { CONDENSED_SOLID_ACCENT_ICON_OPACITY } from '@/utils/condensed-note-row';

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
  scriptureReferences?: Array<{ reference: string; noteId: string; translation?: string; threadColors?: Array<{ color: string; frequency: number }> }>;
  /** When set, scripture ref links include ?thread= so multi-thread context matches the list/card thread */
  threadContextForScriptureLinks?: string;
  // Offline sync status indicator
  isPendingSync?: boolean;
  // Encryption status - when true, note is locked and content is encrypted
  contentEncrypted?: boolean;
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
  scriptureReferences: propScriptureReferences = [],
  threadContextForScriptureLinks,
  isPendingSync = false,
  contentEncrypted = false
}) => {
  const nt = noteType;
  const [isScriptureRefsExpanded, setIsScriptureRefsExpanded] = useState(false);
  // Generate mesh gradient on client only to avoid hydration mismatch
  // Start with null to match server render, then generate after mount
  const [meshGradient, setMeshGradient] = useState<string | null>(null);

  // For resource notes, prioritize metadata over regular props
  const effectiveTitle = nt ==='resource'
    ? (resourceTitle || title || "Untitled Resource")
    : (title || "Untitled Note");
  const effectiveContent = nt ==='resource'
    ? (resourceDescription || content || "")
    : (content || "");
  const effectiveImageUrl = nt ==='resource'
    ? (resourceImage || imageUrl)
    : imageUrl;

  // Use scripture references from props (from junction table) - only for default notes when collapsible is enabled
  const scriptureReferences = (nt ==='default' && showScriptureRefsCollapsible && propScriptureReferences.length > 0)
    ? propScriptureReferences
    : [];

  // For resource notes with images, automatically use withImage variant
  const effectiveVariant = (nt ==='resource' && effectiveImageUrl) ? "withImage" : variant;

  // Generate mesh gradient on client only (after hydration) to avoid mismatch
  React.useEffect(() => {
    if (typeof window === 'undefined') return; // Only run on client

    // Generate mesh gradient from thread colors (only if no image present)
    if (!effectiveImageUrl && threadColors && threadColors.length > 0 && noteId) {
      const gradient = generateThreadMeshGradient(threadColors, noteId);
      setMeshGradient(gradient);
    }
  }, [effectiveImageUrl, threadColors, noteId]);
  
  // Sidebar style: use gradient if available, otherwise default
  const sidebarStyle = meshGradient
    ? { 
        backgroundColor: 'var(--color-light-paper)',
        backgroundImage: meshGradient
      }
    : undefined;
  
  // Determine if scripture refs will be shown
  // Explicit boolean annotation prevents TS 5.9 control-flow narrowing from
  // narrowing `nt` to literal 'default' inside JSX conditional branches.
  const hasScriptureRefs: boolean = showScriptureRefsCollapsible && nt ==='default' && scriptureReferences.length > 0;

  // When locked, show placeholder instead of content excerpt
  const excerptText = contentEncrypted ? 'This note is locked' : (effectiveContent ? stripHtml(effectiveContent) : '');

  // Deduplicate scripture references based on noteId (defense-in-depth)
  const uniqueScriptureRefs = React.useMemo(() => {
    if (!scriptureReferences) return [];

    const seen = new Set<string>();
    return scriptureReferences.filter(ref => {
      if (seen.has(ref.noteId)) {
        return false;
      }
      seen.add(ref.noteId);
      return true;
    });
  }, [scriptureReferences]);

  // If note is encrypted, render locked card UI - same DOM structure as default note (sidebar + body, same thread colors)
  if (contentEncrypted) {
    return (
      <div className={`card card-note ${className}`} onClick={onClick} style={{ position: 'relative' }}>
        <div className="card-note__content" style={{ padding: '8px' }}>
          <div className="card-note__sidebar" style={sidebarStyle}>
            <div className="card-note__sidebar-icon">
              <svg fill="currentColor" viewBox="0 0 24 24" style={{ color: 'var(--color-deep-grey)', opacity: CONDENSED_SOLID_ACCENT_ICON_OPACITY }}>
                <path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z"/>
              </svg>
            </div>
          </div>
          <div className="card-note__body">
            <div className="card-note__text">
              <div className="card-note__title">
                <p>{title || "Locked Note"}</p>
              </div>
              <div className="card-note__excerpt">
                <p style={{ color: 'var(--color-stone-grey)' }}>
                  This note is locked
                </p>
              </div>
            </div>
          </div>
          <div aria-hidden="true" className="card__border" style={{ borderColor: '#f7f7f6' }} />
        </div>
      </div>
    );
  }

  return (
    <div className={`card card-note ${className}`} onClick={onClick} style={{ position: 'relative' }}>
      {/* Pending sync indicator */}
      {isPendingSync && (
        <div
          style={{
            position: 'absolute',
            top: '8px',
            right: '8px',
            zIndex: 10,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '20px',
            height: '20px',
            backgroundColor: 'rgba(255, 255, 255, 0.9)',
            borderRadius: '50%',
            boxShadow: '0 1px 2px rgba(0, 0, 0, 0.1)'
          }}
          title="Pending sync - will sync when online"
        >
          <Icon name="cloud-arrow-up" size={12} style={{ color: 'var(--color-deep-grey)', opacity: CONDENSED_SOLID_ACCENT_ICON_OPACITY }} />
        </div>
      )}
      {effectiveVariant === "default" && (
        hasScriptureRefs ? (
          <div className="card-note__inner">
            <div className="card-note__content" style={{ display: 'flex', flexDirection: 'column', gap: isScriptureRefsExpanded ? '8px' : '0px', paddingTop: '8px', paddingBottom: isScriptureRefsExpanded ? '0px' : '8px', paddingLeft: '8px', paddingRight: '8px' }}>
              {/* When scripture refs exist, wrap sidebar and body in a container */}
              <div style={{ display: 'flex', gap: '12px', alignItems: 'stretch' }}>
                {/* Left sidebar with note type icon */}
                <div 
                  className={`card-note__sidebar ${nt ==='resource' ? 'card-note__sidebar--resource' : ''}`}
                  style={sidebarStyle}
                >
                  <div className="card-note__sidebar-icon">
                    {nt ==='scripture' ? (
                      <Icon name="scroll" size={20} style={{ color: 'var(--color-deep-grey)', opacity: CONDENSED_SOLID_ACCENT_ICON_OPACITY }} />
                    ) : nt ==='resource' ? (
                      <Icon name="newspaper" size={20} style={{ color: 'var(--color-deep-grey)', opacity: CONDENSED_SOLID_ACCENT_ICON_OPACITY }} />
                    ) : (
                      <svg fill="currentColor" viewBox="0 0 24 24" style={{ color: 'var(--color-deep-grey)', opacity: CONDENSED_SOLID_ACCENT_ICON_OPACITY }}>
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
                    {(nt !=='resource' || !resourceUrl || !showSource) && (
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
                          {excerptText}
                        </p>
                        {/* Scripture refs trigger inline with excerpt */}
                        {hasScriptureRefs && (
                          <div
                            role="button"
                            tabIndex={0}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setIsScriptureRefsExpanded(!isScriptureRefsExpanded);
                            }}
                            onPointerDown={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                            }}
                            onPointerDownCapture={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                e.stopPropagation();
                                setIsScriptureRefsExpanded(prev => !prev);
                              }
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
                              {uniqueScriptureRefs.length} {uniqueScriptureRefs.length === 1 ? 'scripture note' : 'scripture notes'}
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
              {showScriptureRefsCollapsible && nt ==='default' && scriptureReferences.length > 0 && isScriptureRefsExpanded && (
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
                      gap: '8px',
                      maxHeight: '280px',
                      overflowY: 'auto',
                      paddingBottom: '8px',
                      animation: 'cardFadeIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) both'
                    }}
                    className="card-note__scripture-refs-list"
                  >
                    {uniqueScriptureRefs.map((ref, index) => {
                      const meshGradient = getCondensedNoteMeshGradient(ref.threadColors, ref.noteId);

                      return (
                        <a
                          key={index}
                          href={idToUrl(ref.noteId, threadContextForScriptureLinks)}
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
                          <CondensedNoteRowLayout
                            accentBarStyle={getCondensedNoteAccentBarStyle(meshGradient)}
                            icon={condensedNoteRowIcon({ noteType: 'scripture' })}
                            style={{ cursor: 'pointer' }}
                            boxShadow="0 1px 2px 0 rgba(0, 0, 0, 0.05)"
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, minWidth: 0 }}>
                              <div style={{
                                fontFamily: 'var(--font-sans)',
                                fontWeight: 700,
                                color: 'var(--color-deep-grey)',
                                fontSize: '16px',
                                lineHeight: 1.2,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap'
                              }}>
                                {ref.reference || 'Untitled Scripture'}
                              </div>
                              {ref.translation && (
                                <span style={{
                                  fontFamily: 'var(--font-sans)',
                                  fontSize: '12px',
                                  fontWeight: 'normal',
                                  color: 'var(--color-stone-grey)',
                                  flexShrink: 0,
                                }}>
                                  {ref.translation}
                                </span>
                              )}
                            </div>
                          </CondensedNoteRowLayout>
                        </a>
                      );
                    })}
                  </div>
                </div>
              )}
          </div>
          {/* Source bar for resource notes - outside content area to match normal preview */}
          {nt ==='resource' && resourceUrl && showSource && (
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
                  <Icon name="arrow-up-right-from-square" size={20} style={{ color: 'var(--color-deep-grey)' }} />
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
              className={`card-note__sidebar ${nt ==='resource' ? 'card-note__sidebar--resource' : ''}`}
              style={sidebarStyle}
            >
              <div className="card-note__sidebar-icon">
                {nt ==='scripture' ? (
                  <Icon name="scroll" size={20} style={{ color: 'var(--color-deep-grey)', opacity: CONDENSED_SOLID_ACCENT_ICON_OPACITY }} />
                ) : nt ==='resource' ? (
                  <Icon name="newspaper" size={20} style={{ color: 'var(--color-deep-grey)', opacity: CONDENSED_SOLID_ACCENT_ICON_OPACITY }} />
                ) : (
                  <svg fill="currentColor" viewBox="0 0 24 24" style={{ color: 'var(--color-deep-grey)', opacity: CONDENSED_SOLID_ACCENT_ICON_OPACITY }}>
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
                {(nt !=='resource' || !resourceUrl || !showSource) && (
                  <div className="card-note__excerpt">
                    <p>{excerptText}</p>
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
                  className={`card-note__sidebar card-note__sidebar--with-image ${nt ==='resource' ? 'card-note__sidebar--resource' : ''}`}
                  style={effectiveImageUrl 
                    ? { backgroundImage: `url('${effectiveImageUrl}')` } 
                    : sidebarStyle
                  }
                >
                  {/* Hide icon for resource notes with image - the image is enough */}
                  {!(nt ==='resource' && effectiveImageUrl) && (
                    <div className="card-note__sidebar-icon">
                      {nt ==='scripture' ? (
                        <Icon name="scroll" size={20} style={{ color: 'var(--color-deep-grey)', opacity: CONDENSED_SOLID_ACCENT_ICON_OPACITY }} />
                      ) : nt ==='resource' ? (
                        <Icon name="newspaper" size={20} style={{ color: 'var(--color-deep-grey)', opacity: CONDENSED_SOLID_ACCENT_ICON_OPACITY }} />
                      ) : (
                        <svg fill="currentColor" viewBox="0 0 24 24" style={{ color: 'var(--color-deep-grey)', opacity: CONDENSED_SOLID_ACCENT_ICON_OPACITY }}>
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
                    {(nt !=='resource' || !resourceUrl || !showSource) && (
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
                          {excerptText}
                        </p>
                        {/* Scripture refs trigger inline with excerpt */}
                        {hasScriptureRefs && (
                          <div
                            role="button"
                            tabIndex={0}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setIsScriptureRefsExpanded(!isScriptureRefsExpanded);
                            }}
                            onPointerDown={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                            }}
                            onPointerDownCapture={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                e.stopPropagation();
                                setIsScriptureRefsExpanded(prev => !prev);
                              }
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
                              {uniqueScriptureRefs.length} {uniqueScriptureRefs.length === 1 ? 'scripture note' : 'scripture notes'}
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
              {showScriptureRefsCollapsible && nt ==='default' && scriptureReferences.length > 0 && isScriptureRefsExpanded && (
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
                      gap: '8px',
                      maxHeight: '280px',
                      overflowY: 'auto',
                      paddingBottom: '8px',
                      animation: 'cardFadeIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) both'
                    }}
                    className="card-note__scripture-refs-list"
                  >
                    {uniqueScriptureRefs.map((ref, index) => {
                      const meshGradient = getCondensedNoteMeshGradient(ref.threadColors, ref.noteId);

                      return (
                        <a
                          key={index}
                          href={idToUrl(ref.noteId, threadContextForScriptureLinks)}
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
                          <CondensedNoteRowLayout
                            accentBarStyle={getCondensedNoteAccentBarStyle(meshGradient)}
                            icon={condensedNoteRowIcon({ noteType: 'scripture' })}
                            style={{ cursor: 'pointer' }}
                            boxShadow="0 1px 2px 0 rgba(0, 0, 0, 0.05)"
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, minWidth: 0 }}>
                              <div style={{
                                fontFamily: 'var(--font-sans)',
                                fontWeight: 700,
                                color: 'var(--color-deep-grey)',
                                fontSize: '16px',
                                lineHeight: 1.2,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap'
                              }}>
                                {ref.reference || 'Untitled Scripture'}
                              </div>
                              {ref.translation && (
                                <span style={{
                                  fontFamily: 'var(--font-sans)',
                                  fontSize: '12px',
                                  fontWeight: 'normal',
                                  color: 'var(--color-stone-grey)',
                                  flexShrink: 0,
                                }}>
                                  {ref.translation}
                                </span>
                              )}
                            </div>
                          </CondensedNoteRowLayout>
                        </a>
                      );
                    })}
                  </div>
                </div>
              )}
          </div>
          {/* Source bar for resource notes - outside content area to match normal preview */}
          {nt ==='resource' && resourceUrl && showSource && (
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
                  <Icon name="arrow-up-right-from-square" size={20} style={{ color: 'var(--color-deep-grey)' }} />
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
              className={`card-note__sidebar card-note__sidebar--with-image ${nt ==='resource' ? 'card-note__sidebar--resource' : ''}`}
              style={effectiveImageUrl 
                ? { backgroundImage: `url('${effectiveImageUrl}')` } 
                : sidebarStyle
              }
            >
              {/* Hide icon for resource notes with image - the image is enough */}
              {!(nt ==='resource' && effectiveImageUrl) && (
                <div className="card-note__sidebar-icon">
                  {nt ==='scripture' ? (
                    <Icon name="scroll" size={20} style={{ color: 'var(--color-deep-grey)', opacity: CONDENSED_SOLID_ACCENT_ICON_OPACITY }} />
                  ) : nt ==='resource' ? (
                    <Icon name="newspaper" size={20} style={{ color: 'var(--color-deep-grey)', opacity: CONDENSED_SOLID_ACCENT_ICON_OPACITY }} />
                  ) : (
                    <svg fill="currentColor" viewBox="0 0 24 24" style={{ color: 'var(--color-deep-grey)', opacity: CONDENSED_SOLID_ACCENT_ICON_OPACITY }}>
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
                {(nt !=='resource' || !resourceUrl || !showSource) && (
                  <div className="card-note__excerpt">
                    <p>{excerptText}</p>
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
