import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { AuthPanel } from './auth-panel';

it('missing real OAuth configuration renders blocked technical panel without a fake Google button or external call', async () => {
  const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher); render(<AuthPanel />);
  expect(screen.getByRole('status')).toHaveTextContent('OAuth client ID');
  expect(screen.queryByRole('button')).not.toBeInTheDocument(); expect(fetcher).not.toHaveBeenCalled();
  expect(document.querySelector('script[src="https://accounts.google.com/gsi/client"]')).toBeNull();
});
