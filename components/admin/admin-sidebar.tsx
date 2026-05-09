'use client';

import { twMerge } from 'tailwind-merge';
import { Link, usePathname } from '@/i18n/navigation';

/**
 * Vertical nav rail for `/[locale]/admin/**`. Matched on the i18n-stripped
 * pathname (so `/en/admin/submissions` resolves to `/admin/submissions`),
 * which is the same shape `usePathname` from `@/i18n/navigation` returns.
 *
 * On large screens it's a left-side rail; on smaller screens it collapses
 * into a horizontally-scrolling pill row across the top of the body so
 * sections stay reachable on mobile without a hamburger sheet.
 */

type Item = {
  href:
    | '/admin'
    | '/admin/submissions'
    | '/admin/companies'
    | '/admin/access-management';
  label: string;
  /** When true, only an exact path match is considered active (used for
   *  the dashboard root so it doesn't light up under every sub-route). */
  exact?: boolean;
};

const items: Item[] = [
  { href: '/admin', label: 'Dashboard', exact: true },
  // Submissions is the unified moderation queue — pending business
  // registrations and claim requests both surface here. Lives next to
  // Dashboard since admins will hit it most often.
  { href: '/admin/submissions', label: 'Submissions' },
  // Companies is the flat browse + edit surface for every directory
  // row, claimed or not. Each row deep-links into the owner dashboard
  // (which lets admins through).
  { href: '/admin/companies', label: 'Companies' },
  // Access Management surfaces claimers + the revoke list. Sits last in
  // the rail because it's a less-frequent action.
  { href: '/admin/access-management', label: 'Access Management' },
];

function isActive(pathname: string, href: string, exact?: boolean) {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminSidebar() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Admin sections"
      // On lg+ the rail sticks under the layout header and fills the
      // viewport vertically so the right-side divider runs top-to-bottom
      // even when the nav has only a few items. Fixed height (not max-h) +
      // `self-start` is what lets sticky work and gives the border a full
      // span. Top offset matches the layout header's measured height
      // (~64px).
      className="flex shrink-0 gap-1 overflow-x-auto border-b border-border pb-3 lg:sticky lg:top-16 lg:h-[calc(100dvh-4rem)] lg:w-56 lg:flex-col lg:gap-0.5 lg:self-start lg:overflow-x-visible lg:overflow-y-auto lg:border-b-0 lg:border-r lg:pb-0 lg:pr-4"
    >
      {items.map((item) => {
        const active = isActive(pathname, item.href, item.exact);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={twMerge(
              'shrink-0 rounded-md px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
              active
                ? 'bg-primary/10 text-fg'
                : 'text-muted-fg hover:bg-muted hover:text-fg',
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
