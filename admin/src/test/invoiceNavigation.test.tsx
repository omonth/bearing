// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import Layout from '@/shared/Layout';

function NavigationFixture() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/admin/dashboard" element={<div>dashboard-page</div>} />
        <Route path="/admin/invoices" element={<div data-testid="invoice-route-outlet">invoice-page</div>} />
      </Route>
      <Route path="*" element={<Outlet />} />
    </Routes>
  );
}

describe('invoice navigation', () => {
  it('exposes the invoice sidebar entry and navigates to /admin/invoices', async () => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation(() => ({
        matches: false,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };

    render(
      <MemoryRouter initialEntries={['/admin/dashboard']}>
        <NavigationFixture />
      </MemoryRouter>,
    );

    const navigationItem = screen.getByTestId('admin-nav-invoices');
    expect(navigationItem).toHaveTextContent('发票管理');
    fireEvent.click(navigationItem);

    expect(await screen.findByTestId('invoice-route-outlet')).toHaveTextContent('invoice-page');
  });
});
