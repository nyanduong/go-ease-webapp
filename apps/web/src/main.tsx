import { createRoot } from 'react-dom/client';
import { App } from './app/app';
import { ConfirmationDialogHost } from './components/confirmation-dialog';
import './tailwind.css';
createRoot(document.getElementById('root')!).render(
  <>
    <App />
    <ConfirmationDialogHost />
  </>,
);
