import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Fonts — import directly from installed npm packages so they bundle correctly
import '@fontsource/reddit-sans/400.css';
import '@fontsource/reddit-sans/500.css';
import '@fontsource/reddit-sans/600.css';
import '@fontsource/reddit-sans/700.css';
import '@fontsource/reddit-mono/500.css';
import '@fontsource/reddit-mono/600.css';

// Global styles — global.css already @imports: colors, spacing, typography, buttons,
// navigation, cards, forms, panels, animations, layout, utilities.
// Only import separately what global.css does NOT include.
import '../../src/styles/global.css';
import '../../src/styles/tiptap-editor.css';
import '../../src/styles/card-full-editable.css';
import '../../src/styles/auth-gradient.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <App />
);
