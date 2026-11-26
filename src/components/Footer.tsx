import React from 'react';
import type { RouteName } from './Navbar';

interface FooterProps {
  onNavigate: (route: RouteName) => void;
  business?: {
    business_name?: string;
    personal_identity?: string;
    tagline?: string;
    contact_email?: string;
    contact_phone?: string;
    location?: string;
  };
}

export const Footer: React.FC<FooterProps> = ({ onNavigate, business }) => {
  return (
    <footer className="border-t border-[#E5DFD3] bg-[#0F213E] text-[#E2E8F0] no-print">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid gap-10 md:grid-cols-4">
          <div className="md:col-span-2">
            <p className="font-display text-xl font-semibold text-white">
              {business?.business_name || 'Jey Learning Hub'}
            </p>
            <p className="mt-1 text-sm text-[#D6B15C]">
              {business?.personal_identity || 'Learn with Jecinta'} ·{' '}
              {business?.tagline || 'Learn. Create. Grow.'}
            </p>
            <p className="mt-3 max-w-md text-sm leading-relaxed text-[#CBD5E1]">
              Personalised online tutoring in Mathematics and Coding &amp; Computer Science for
              Kenyan and international learners across all timezones.
            </p>
          </div>

          <div>
            <p className="text-sm font-semibold text-white">Explore</p>
            <ul className="mt-3 space-y-2 text-sm text-[#CBD5E1]">
              <li>
                <button
                  type="button"
                  onClick={() => onNavigate('courses')}
                  className="hover:text-white transition-colors"
                >
                  Courses
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => onNavigate('curriculum')}
                  className="hover:text-white transition-colors"
                >
                  Curriculum
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => onNavigate('pricing')}
                  className="hover:text-white transition-colors"
                >
                  Pricing
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => onNavigate('about')}
                  className="hover:text-white transition-colors"
                >
                  About Jecinta
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => onNavigate('book')}
                  className="hover:text-white transition-colors"
                >
                  Book a Lesson
                </button>
              </li>
            </ul>
          </div>

          <div>
            <p className="text-sm font-semibold text-white">Contact</p>
            <ul className="mt-3 space-y-2 text-sm text-[#CBD5E1]">
              <li>{business?.contact_email || 'mainajecinta81@gmail.com'}</li>
              <li>{business?.contact_phone || '+254 700 000 000'}</li>
              <li>{business?.location || 'Nairobi, Kenya (Serving Worldwide)'}</li>
              <li className="pt-2">
                <button
                  type="button"
                  onClick={() => onNavigate('login')}
                  className="text-[#D6B15C] hover:underline"
                >
                  Parent, Student &amp; Teacher Login
                </button>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-10 flex flex-col items-start justify-between gap-4 border-t border-white/10 pt-6 text-xs text-[#94A3B8] sm:flex-row sm:items-center">
          <p>&copy; {new Date().getFullYear()} Jey Learning Hub. All rights reserved.</p>
          <p>Child Safety &amp; Data Protection Compliant (Kenya DPA &amp; International Standards)</p>
        </div>
      </div>
    </footer>
  );
};
