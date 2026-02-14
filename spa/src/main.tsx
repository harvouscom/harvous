import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Global styles (shared with Astro build)
import '../../src/styles/global.css';
import '../../src/styles/colors.css';
import '../../src/styles/typography.css';
import '../../src/styles/spacing.css';
import '../../src/styles/animations.css';
import '../../src/styles/buttons.css';
import '../../src/styles/cards.css';
import '../../src/styles/layout.css';
import '../../src/styles/navigation.css';
import '../../src/styles/panels.css';
import '../../src/styles/forms.css';
import '../../src/styles/utilities.css';
import '../../src/styles/tiptap-editor.css';
import '../../src/styles/card-full-editable.css';
import '../../src/styles/auth-gradient.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
