'use client';

import { useClerk } from '@clerk/nextjs';
import { Button, buttonStyles } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';
import { twMerge } from 'tailwind-merge';

/**
 * Action row for the access-revoked landing page. Sign-out is hosted by
 * Clerk's `signOut()` helper rather than `<UserButton>` so we can route
 * the user explicitly to the public home — landing back on the same
 * page after sign-out would be confusing.
 *
 * Kept in its own client component so the parent page can stay a pure
 * server component (lighter SSR + simpler i18n).
 */
export function AccessRevokedActions() {
  const { signOut } = useClerk();

  return (
    <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
      <Button
        intent="outline"
        size="sm"
        onPress={() => signOut({ redirectUrl: '/' })}
      >
        Sign out
      </Button>
      <Link
        href="/"
        className={twMerge(
          buttonStyles({ intent: 'primary', size: 'sm' }),
          'whitespace-nowrap',
        )}
      >
        Back to public site
      </Link>
    </div>
  );
}
