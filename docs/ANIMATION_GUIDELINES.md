# Animation Guidelines & Documentation

This document outlines our animation approach, compares it with Motion for React, and provides guidelines for implementing future animations in the Harvous project.

## Table of Contents
1. [Our Animation Approach](#our-animation-approach)
2. [Comparison with Motion for React](#comparison-with-motion-for-react)
3. [Emil Kowalski's Perspective](#emil-kowalskis-perspective)
4. [Implementation Guidelines](#implementation-guidelines)
5. [When to Use CSS vs Motion](#when-to-use-css-vs-motion)
6. [Animation Patterns](#animation-patterns)

---

## Our Animation Approach

### Current Implementation

We use **CSS keyframes and animation classes** with a hybrid approach that works seamlessly with Astro's SSR and React islands architecture.

#### Key Characteristics:
- **CSS-based animations** using `@keyframes` and utility classes
- **Server-side rendered** - animations work before JavaScript loads
- **GPU-accelerated** - using `transform` and `opacity` properties
- **Staggered delays** - applied via inline styles in Astro templates
- **Manual state management** - for enter/exit animations in React components

#### File Structure:
```
src/styles/animations.css    # All animation keyframes and classes
src/styles/global.css        # View transitions and hover effects
src/components/react/        # React components with animation state
src/pages/                   # Astro pages with staggered animations
```

---

## Comparison with Motion for React

### Our CSS Approach

**Advantages:**
- ✅ **SSR-friendly** - Works immediately, no hydration required
- ✅ **Smaller bundle** - No JavaScript library needed
- ✅ **Better performance** - Runs on compositor thread
- ✅ **Works before React loads** - Critical for perceived performance
- ✅ **Simple for basic animations** - Easy to understand and maintain

**Limitations:**
- ❌ **Manual stagger** - Requires inline `style` attributes
- ❌ **Complex exit animations** - Requires manual state management
- ❌ **No gesture support** - Limited hover/tap handling
- ❌ **No layout animations** - Can't animate layout changes
- ❌ **No scroll animations** - Limited scroll-triggered effects

### Motion for React Approach

**Advantages:**
- ✅ **Declarative API** - Cleaner, more React-like
- ✅ **Built-in stagger** - `transition.staggerChildren` or variants
- ✅ **Exit animations** - `<AnimatePresence>` handles unmounting
- ✅ **Gesture support** - `whileHover`, `whileTap` work on all devices
- ✅ **Layout animations** - Animate layout changes automatically
- ✅ **Scroll animations** - `whileInView` and `useScroll` hooks

**Limitations:**
- ❌ **Requires hydration** - Animations start after React loads
- ❌ **Bundle size** - ~50KB+ JavaScript
- ❌ **SSR complexity** - Need to handle hydration mismatches
- ❌ **Overkill for simple animations** - More complex than needed

### Side-by-Side Comparison

| Feature | Our CSS Approach | Motion for React |
|---------|-----------------|------------------|
| **SSR Support** | ✅ Works immediately | ⚠️ After hydration |
| **Bundle Size** | ✅ ~0KB (CSS only) | ❌ ~50KB+ JS |
| **Performance** | ✅ Compositor thread | ✅ Hardware-accelerated |
| **Stagger** | ⚠️ Manual inline styles | ✅ Built-in variants |
| **Exit Animations** | ⚠️ Manual state | ✅ AnimatePresence |
| **Gestures** | ⚠️ CSS :hover only | ✅ Cross-device |
| **Layout Animations** | ❌ Not supported | ✅ Built-in |
| **Scroll Animations** | ⚠️ Limited | ✅ Full support |
| **Learning Curve** | ✅ Simple CSS | ⚠️ React-specific API |

---

## Emil Kowalski's Perspective

Based on [animations.dev](https://animations.dev/) and Emil's focus on the "why" of animations:

### What He'd Appreciate About Our Approach

1. **Performance-First**
   - Using GPU-accelerated properties (`transform`, `opacity`)
   - Animations run on compositor thread
   - No JavaScript blocking

2. **Purposeful Animations**
   - Subtle, smooth easing curves
   - Animations serve a clear purpose (feedback, hierarchy)
   - Not over-animated

3. **SSR-Friendly**
   - Animations work before JavaScript loads
   - Better perceived performance
   - Critical for user experience

4. **Accessibility Consideration**
   - Can easily add `prefers-reduced-motion` support
   - Respects user preferences

### What He Might Suggest Improving

1. **Stagger Implementation**
   ```jsx
   // Motion way (cleaner)
   <motion.div variants={container}>
     {items.map(item => (
       <motion.div variants={item} />
     ))}
   </motion.div>
   
   // Our way (manual)
   {items.map((item, index) => (
     <div style={`animation-delay: ${index * 50}ms;`}>
   ))}
   ```

2. **Exit Animations**
   - Motion's `<AnimatePresence>` is more declarative
   - Our manual state management works but is more verbose

3. **Easing Consistency**
   - Motion provides preset easings
   - We use custom `cubic-bezier` values (which is fine, but less standardized)

4. **Gesture Handling**
   - Motion's `whileHover`/`whileTap` are more reliable on touch devices
   - CSS `:hover` can be unreliable on mobile

---

## Implementation Guidelines

### For Simple Animations (Current Approach)

**Use CSS animations when:**
- Animating on page load
- Simple enter/exit animations
- Hover effects
- Basic transitions
- SSR is critical

**Pattern:**
```css
/* animations.css */
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}

.fade-in {
  animation: fadeIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) both;
}
```

```astro
<!-- In Astro templates -->
<div class="fade-in" style={`animation-delay: ${index * 50}ms;`}>
```

### For Complex Animations (Consider Motion)

**Use Motion for React when:**
- Need gesture-driven interactions
- Layout animations (shared element transitions)
- Scroll-linked animations
- Complex stagger patterns
- Client-side only components

**Pattern:**
```tsx
import { motion } from "motion/react"

<motion.div
  initial={{ opacity: 0, y: 20 }}
  animate={{ opacity: 1, y: 0 }}
  whileHover={{ scale: 1.05 }}
  transition={{ delay: index * 0.05 }}
/>
```

---

## When to Use CSS vs Motion

### Use CSS Animations ✅

1. **Server-rendered content** (Astro pages)
2. **Simple enter animations** (fade, slide, scale)
3. **Hover effects** (scale, translate)
4. **View transitions** (page-to-page)
5. **Performance-critical** (above-the-fold content)
6. **Bundle size matters** (mobile-first)

### Use Motion for React ✅

1. **Complex gestures** (drag, swipe, pinch)
2. **Layout animations** (shared element transitions)
3. **Scroll animations** (parallax, progress indicators)
4. **Client-only components** (modals, dropdowns)
5. **Interactive elements** (draggable lists, reorderable items)
6. **Complex stagger patterns** (variants with children)

### Hybrid Approach (Recommended)

Use **both** strategically:

```tsx
// Simple: CSS (SSR-friendly)
<div className="card-enter" style={{ animationDelay: `${index * 50}ms` }}>

// Complex: Motion (client-side only)
<motion.div
  whileHover={{ scale: 1.05 }}
  whileTap={{ scale: 0.95 }}
  drag
  layout
>
```

---

## Animation Patterns

### 1. Enter Animations

**CSS Pattern:**
```css
@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.slide-in {
  animation: slideIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) both;
}
```

**Usage:**
```astro
<div class="slide-in">Content</div>
```

### 2. Staggered Animations

**CSS Pattern:**
```astro
{items.map((item, index) => (
  <div 
    class="card-enter" 
    style={`animation-delay: ${index * 50}ms;`}
  >
    {item.content}
  </div>
))}
```

**Delay Guidelines:**
- **Fast cascade**: 30-40ms between items
- **Standard**: 50ms between items (current)
- **Slow cascade**: 70-100ms between items

### 3. Exit Animations (React Components)

**Pattern:**
```tsx
const [isExiting, setIsExiting] = useState(false);
const [isMounted, setIsMounted] = useState(false);

useEffect(() => {
  const timer = setTimeout(() => setIsMounted(true), 10);
  return () => clearTimeout(timer);
}, []);

const handleClose = () => {
  setIsExiting(true);
  setIsMounted(false);
  setTimeout(() => {
    // Cleanup after animation
  }, 250);
};

return (
  <div 
    className={`${isMounted && !isExiting ? 'enter' : ''} ${isExiting ? 'exit' : ''}`}
    style={!isMounted ? { opacity: 0 } : undefined}
  >
```

### 4. Modal Animations

**Pattern:**
```tsx
<div className="modal-overlay-enter">
  <div className="modal-content-enter">
    {/* Dialog content */}
  </div>
</div>
```

**CSS:**
```css
.modal-overlay-enter {
  animation: modalOverlayFadeIn 0.25s cubic-bezier(0.16, 1, 0.3, 1) both;
}

.modal-content-enter {
  animation: modalContentScaleIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) both;
}
```

### 5. Hover Effects

**CSS Pattern:**
```css
.content-item a {
  transition: transform 0.2s ease-out;
}

.content-item a:hover {
  transform: translateY(-2px);
}
```

**Motion Alternative:**
```tsx
<motion.a
  whileHover={{ y: -2 }}
  transition={{ duration: 0.2 }}
>
```

---

## Easing Functions

### Our Current Easing

```css
/* Smooth ease-out (most enter animations) */
cubic-bezier(0.16, 1, 0.3, 1)

/* Quick ease-in (exit animations) */
cubic-bezier(0.4, 0, 1, 1)

/* Standard ease (menus, transitions) */
cubic-bezier(0.4, 0, 0.2, 1)
```

### Motion Equivalents

```tsx
// Motion provides presets:
transition={{ ease: "easeOut" }}      // Similar to our ease-out
transition={{ ease: "easeIn" }}       // Similar to our ease-in
transition={{ ease: [0.4, 0, 0.2, 1] }} // Custom cubic-bezier
```

### When to Use Each

- **Ease-out** (`0.16, 1, 0.3, 1`): Entering animations, appearing elements
- **Ease-in** (`0.4, 0, 1, 1`): Exiting animations, disappearing elements
- **Standard** (`0.4, 0, 0.2, 1`): General transitions, hover effects

---

## Performance Best Practices

### ✅ DO

1. **Use GPU-accelerated properties:**
   ```css
   transform: translateY(4px);  /* ✅ Good */
   opacity: 0;                  /* ✅ Good */
   ```

2. **Avoid animating layout properties:**
   ```css
   width: 200px;  /* ❌ Bad - triggers layout */
   top: 100px;    /* ❌ Bad - triggers layout */
   ```

3. **Use `will-change` sparingly:**
   ```css
   /* Only for performance-critical animations */
   .critical-animation {
     will-change: transform, opacity;
   }
   ```

4. **Respect reduced motion:**
   ```css
   @media (prefers-reduced-motion: reduce) {
     * {
       animation-duration: 0.01ms !important;
       transition-duration: 0.01ms !important;
     }
   }
   ```

### ❌ DON'T

1. **Don't animate `width`/`height`** - Use `scale` instead
2. **Don't animate `top`/`left`** - Use `translate` instead
3. **Don't overuse `will-change`** - Only when needed
4. **Don't block critical actions** - Keep animations fast (< 300ms)

---

## Animation Timing Guidelines

### Duration Guidelines

| Animation Type | Duration | Use Case |
|---------------|----------|----------|
| **Micro-interactions** | 0.15s - 0.2s | Hover effects, button presses |
| **Standard** | 0.25s - 0.35s | Menu opens, modal appears |
| **Deliberate** | 0.4s - 0.5s | Page transitions, large content |
| **Stagger delay** | 30ms - 50ms | Between list items |

### Our Current Timings

- **Menu enter**: 0.35s
- **Menu exit**: 0.25s
- **Modal overlay**: 0.25s
- **Modal content**: 0.3s
- **Bottom sheet**: 0.3s (up), 0.25s (down)
- **Card enter**: 0.4s
- **Inbox item**: 0.35s
- **Stagger delay**: 50ms

---

## Accessibility

### Reduced Motion Support

Always respect user preferences:

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

### Focus States

Ensure animations don't interfere with focus indicators:

```css
/* Keep focus visible during animations */
*:focus-visible {
  outline: 2px solid var(--color-bold-blue);
  outline-offset: 2px;
}
```

---

## Future Considerations

### When to Migrate to Motion

Consider migrating to Motion for React if:

1. **Complex gesture interactions** are needed
2. **Layout animations** become a requirement
3. **Scroll-linked animations** are needed
4. **Shared element transitions** between pages
5. **Bundle size** is less of a concern
6. **Client-side rendering** becomes the primary approach

### Migration Path

If migrating, do it incrementally:

1. **Start with complex components** (modals, drag-and-drop)
2. **Keep CSS for simple animations** (hover, basic transitions)
3. **Use hybrid approach** - CSS for SSR, Motion for client-only
4. **Measure performance** - Ensure no regressions

---

## References

- [Motion for React Documentation](https://motion.dev/docs/react)
- [Animations.dev by Emil Kowalski](https://animations.dev/)
- [CSS Animation Performance](https://web.dev/animations-guide/)
- [Reduced Motion Support](https://web.dev/prefers-reduced-motion/)

---

## Quick Reference

### CSS Animation Checklist

- [ ] Animation uses `transform` or `opacity`
- [ ] Duration is appropriate (0.2s - 0.4s)
- [ ] Easing curve is smooth
- [ ] Stagger delay is consistent (50ms)
- [ ] Reduced motion is respected
- [ ] Animation doesn't block interactions
- [ ] Exit animation completes before unmount

### Motion Animation Checklist

- [ ] Component is client-side only
- [ ] Animation requires gestures or layout
- [ ] Bundle size impact is acceptable
- [ ] Hydration timing is considered
- [ ] Reduced motion is handled
- [ ] Performance is tested

---

**Last Updated:** January 2025  
**Status:** Active Guidelines  
**Next Review:** When considering Motion for React migration

