# Font Awesome Icons in React Components - Reference Guide

## Overview
This guide documents the two main patterns used for Font Awesome icons in React components within the Harvous project.

## Pattern 1: SVG Imports (Recommended for Static Icons)

### Usage
Import Font Awesome SVG files directly and use them as image sources:

```tsx
import CircleCheck from "@fortawesome/fontawesome-free/svgs/solid/circle-check.svg";
import TriangleExclamationIcon from "@fortawesome/fontawesome-free/svgs/solid/triangle-exclamation.svg";

// Usage in JSX
<img src={CircleCheck.src} alt="Success" className="w-5 h-5" />
<img src={TriangleExclamationIcon.src} alt="Error" className="w-5 h-5" />
```

### When to Use
- Static icons that don't need dynamic styling
- Icons used in toast notifications, buttons, or other UI elements
- When you need precise control over the icon appearance

### Example Implementation
See `src/components/react/ToastProvider.tsx` for a complete example.

## Pattern 2: CSS Classes (For Dynamic Icons)

### Usage
Load Font Awesome CSS and use class names:

```tsx
// Load Font Awesome CSS
useEffect(() => {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.7.2/css/all.min.css';
  if (!document.querySelector(`link[href="${link.href}"]`)) {
    document.head.appendChild(link);
  }
}, []);

// Usage in JSX
<i className="fas fa-chevron-down"></i>
<i className="fas fa-plus"></i>
```

### When to Use
- Icons that need dynamic styling (colors, sizes)
- Icons in rich text editors or complex UI components
- When you need Font Awesome's built-in animations or effects

### Example Implementation
See `src/components/react/TiptapEditor.tsx` and `src/components/react/NewNotePanel.tsx` for complete examples.

## Available Font Awesome Icons

### Common Icons Used in Project
- `chevron-down` - Dropdown arrows
- `circle-check` - Success states
- `triangle-exclamation` - Error states
- `plus` - Add buttons
- `search` - Search functionality
- `times` or `xmark` - Close buttons

### Icon Categories
- **Solid**: `@fortawesome/fontawesome-free/svgs/solid/[icon-name].svg`
- **Regular**: `@fortawesome/fontawesome-free/svgs/regular/[icon-name].svg`
- **Brands**: `@fortawesome/fontawesome-free/svgs/brands/[icon-name].svg`

## Best Practices

1. **Consistency**: Use the same pattern throughout a component
2. **Performance**: SVG imports are better for static icons, CSS classes for dynamic ones
3. **Styling**: SVG imports give you more control, CSS classes are easier for dynamic styling
4. **Bundle Size**: SVG imports only include the icons you use, CSS classes include the entire Font Awesome library

## Troubleshooting

### Common Issues
1. **SVG Import Errors**: Make sure the icon name matches exactly
2. **CSS Not Loading**: Check that the link element is properly added to document.head
3. **Icon Not Showing**: Verify the icon name exists in Font Awesome
4. **Styling Issues**: Use `className` for CSS classes, `style` prop for SVG imports

### Debug Steps
1. Check browser console for import errors
2. Verify icon exists: https://fontawesome.com/icons
3. Test with a known working icon first
4. Check network tab for CSS loading issues
