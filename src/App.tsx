/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useState } from 'react';
import { Navbar, type RouteName } from './components/Navbar';
import { Footer } from './components/Footer';
import { PublicPages, type PublicBundle } from './pages/PublicPages';
import { AuthPage } from './pages/AuthPage';
import { AdminDashboard } from './pages/AdminDashboard';
import { ParentPortal } from './pages/ParentPortal';
import { StudentPortal } from './pages/StudentPortal';
import { apiFetch, getSessionToken, setSessionToken } from './lib/api';
import { googleWorkspaceLogout, initGoogleAuth } from './lib/googleAuth';
import type { AuthUser } from './lib/types';

export default function App() {
  const [route, setRoute] = useState<RouteName>('home');
  const [user, setUser] = useState<AuthUser | null>(null);
  const [publicBundle, setPublicBundle] = useState<PublicBundle | null>(null);
  const [preselectedCourseId, setPreselectedCourseId] = useState<string | null>(null);

  const loadPublicBundle = useCallback(() => {
    apiFetch<PublicBundle>('/api/public/home')
      .then(setPublicBundle)
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadPublicBundle();
    const unsub = initGoogleAuth(() => {
      // Google Workspace token state is tracked cleanly in memory
    });
    return () => unsub();
  }, [loadPublicBundle]);

  const navigate = (nextRoute: RouteName) => {
    setRoute(nextRoute);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleAuthenticated = (authedUser: AuthUser) => {
    setUser(authedUser);
    if (authedUser.role === 'admin' || authedUser.role === 'teacher') {
      navigate('admin');
    } else if (authedUser.role === 'parent') {
      navigate('parent');
    } else {
      navigate('student');
    }
  };

  const handleLogout = async () => {
    if (getSessionToken()) {
      try {
        await apiFetch('/api/auth/logout', { method: 'POST' });
      } catch {
        // Proceed with local session clearance even if token already expired
      }
    }
    setSessionToken(null);
    try {
      await googleWorkspaceLogout();
    } catch {
      // Ignore if Google session was not signed in
    }
    setUser(null);
    navigate('home');
  };

  const handleSelectCourseForBooking = (courseId: string) => {
    setPreselectedCourseId(courseId);
    navigate('book');
  };

  const renderMain = () => {
    if (route === 'login') {
      return <AuthPage onAuthenticated={handleAuthenticated} />;
    }

    if (route === 'admin') {
      if (!user || (user.role !== 'admin' && user.role !== 'teacher')) {
        return <AuthPage onAuthenticated={handleAuthenticated} />;
      }
      return <AdminDashboard user={user} />;
    }

    if (route === 'parent') {
      if (!user || user.role !== 'parent') {
        return <AuthPage onAuthenticated={handleAuthenticated} />;
      }
      return <ParentPortal user={user} onNavigate={navigate} />;
    }

    if (route === 'student') {
      if (!user || user.role !== 'student') {
        return <AuthPage onAuthenticated={handleAuthenticated} />;
      }
      return <StudentPortal user={user} />;
    }

    return (
      <PublicPages
        route={route}
        bundle={publicBundle}
        user={user}
        preselectedCourseId={preselectedCourseId}
        onSelectCourseForBooking={handleSelectCourseForBooking}
        onNavigate={navigate}
      />
    );
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#FAF8F4] text-[#0F213E]">
      <Navbar currentRoute={route} onNavigate={navigate} user={user} onLogout={handleLogout} />
      <div className="flex flex-1 flex-col">{renderMain()}</div>
      {route !== 'admin' && (
        <Footer onNavigate={navigate} business={publicBundle?.content?.business_settings} />
      )}
    </div>
  );
}
