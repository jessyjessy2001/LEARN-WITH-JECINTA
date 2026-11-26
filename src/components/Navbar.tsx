import React, { useState } from 'react';
import { Menu, X } from 'lucide-react';
import type { AuthUser } from '../lib/types';

export type RouteName =
  | 'home'
  | 'about'
  | 'courses'
  | 'curriculum'
  | 'pricing'
  | 'book'
  | 'login'
  | 'admin'
  | 'parent'
  | 'student';

interface NavbarProps {
  currentRoute: RouteName;
  onNavigate: (route: RouteName) => void;
  user: AuthUser | null;
  onLogout: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentRoute,
  onNavigate,
  user,
  onLogout,
}) => {
  const [mobileOpen, setMobileOpen] = useState(false);

  const navItems: Array<{ route: RouteName; label: string }> = [
    { route: 'book', label: 'Book a Session' },
    { route: 'courses', label: 'Courses & Pricing' },
    { route: 'about', label: 'About' },
  ];

  const portalRoute: RouteName =
    user?.role === 'admin' || user?.role === 'teacher'
      ? 'admin'
      : user?.role === 'parent'
      ? 'parent'
      : user?.role === 'student'
      ? 'student'
      : 'login';

  const handleNav = (r: RouteName) => {
    onNavigate(r);
    setMobileOpen(false);
  };

  return (
    <header className="sticky top-0 z-40 border-b border-[#E5DFD3] bg-[#FAF8F4]/95 backdrop-blur-sm">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-8 px-4 py-3.5 sm:px-6 lg:px-8">
        {/* Zone 1: Single text element wordmark */}
        <button
          type="button"
          onClick={() => handleNav('home')}
          className="font-display text-xl font-semibold tracking-tight text-[#0F213E] whitespace-nowrap shrink-0 text-left focus-visible:outline-2 focus-visible:outline-[#C6922C]"
        >
          Jey Learning Hub
        </button>

        {/* Zone 2: 5 concise single-line nav links */}
        <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-[#334155]">
          {navItems.map((item) => (
            <button
              key={item.route}
              type="button"
              onClick={() => handleNav(item.route)}
              className={`whitespace-nowrap shrink-0 transition-colors hover:text-[#0F213E] ${
                currentRoute === item.route
                  ? 'text-[#0F213E] underline decoration-[#C6922C] decoration-2 underline-offset-4'
                  : ''
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>

        {/* Zone 3: 1 primary action */}
        <div className="flex items-center gap-3 shrink-0">
          {user ? (
            <div className="hidden md:flex items-center gap-3">
              <button
                type="button"
                onClick={() => handleNav(portalRoute)}
                className="rounded-lg bg-[#0F213E] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#1B355E] whitespace-nowrap shrink-0"
              >
                {user.role === 'admin' || user.role === 'teacher'
                  ? 'Teacher Dashboard'
                  : user.role === 'parent'
                  ? 'Parent Portal'
                  : 'Student Dashboard'}
              </button>
              <button
                type="button"
                onClick={onLogout}
                className="text-sm font-medium text-[#475569] hover:text-[#0F213E] whitespace-nowrap shrink-0"
              >
                Sign out
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => handleNav('login')}
              className="hidden md:inline-flex rounded-lg bg-[#0F213E] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#1B355E] whitespace-nowrap shrink-0"
            >
              Portal Login
            </button>
          )}

          <button
            type="button"
            onClick={() => setMobileOpen((v) => !v)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-[#E5DFD3] bg-white text-[#0F213E] md:hidden"
            aria-label="Toggle navigation menu"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="border-t border-[#E5DFD3] bg-white px-4 py-4 md:hidden">
          <div className="flex flex-col gap-2">
            {navItems.map((item) => (
              <button
                key={item.route}
                type="button"
                onClick={() => handleNav(item.route)}
                className="rounded-lg px-3 py-2.5 text-left text-sm font-medium text-[#0F213E] hover:bg-[#FAF8F4]"
              >
                {item.label}
              </button>
            ))}
            <div className="mt-2 border-t border-[#EFEAE0] pt-3 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => handleNav(portalRoute)}
                className="w-full rounded-lg bg-[#0F213E] px-4 py-2.5 text-sm font-medium text-white"
              >
                {user ? 'Open Dashboard' : 'Portal Login'}
              </button>
              {user && (
                <button
                  type="button"
                  onClick={() => {
                    onLogout();
                    setMobileOpen(false);
                  }}
                  className="w-full rounded-lg border border-[#D8D1C4] px-4 py-2 text-sm font-medium text-[#334155]"
                >
                  Sign out
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
};
