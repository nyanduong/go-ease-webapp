import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { AuthPanel } from './auth-panel';
import { WebAuthProvider } from '@/lib/auth-provider';

it('missing real OAuth configuration renders blocked technical panel without a fake Google button or external call', async () => {
  const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher); render(<WebAuthProvider><AuthPanel /></WebAuthProvider>);
  expect(screen.getByRole('status')).toHaveTextContent('chưa được cấu hình');
  expect(screen.queryByRole('button')).not.toBeInTheDocument(); expect(fetcher).not.toHaveBeenCalled();
  expect(document.querySelector('script[src="https://accounts.google.com/gsi/client"]')).toBeNull();
});
