"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Heading } from "@/components/ui/heading";
import { Text } from "@/components/ui/text";

const UNAUTHORIZED_HINTS = [
  "Unauthorized",
  "Forbidden",
  "not_in_allowlist",
  "domain_not_allowed",
  "ADMIN_EMAILS",
  "ADMIN_EMAIL_DOMAINS",
];

function looksLikeAdminAuthError(message: string): boolean {
  return UNAUTHORIZED_HINTS.some((hint) => message.includes(hint));
}

/**
 * Admin-scoped error boundary. Most failures here are auth-shaped — Convex
 * `requireAdmin` throws when the signed-in email isn't on the allowlist —
 * so the copy points the admin at the actual fix instead of dumping a
 * stack trace on them.
 */
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Admin error boundary caught:", error);
  }, [error]);

  const isAuth = looksLikeAdminAuthError(error.message);

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-start justify-center gap-4 px-4 py-16">
      <Heading level={1} className="text-2xl tracking-tight">
        {isAuth ? "Admin access denied" : "Something went wrong"}
      </Heading>
      {isAuth ? (
        <Text className="text-muted-fg">
          Your signed-in email isn&apos;t on the admin allowlist. Add it to{" "}
          <code className="font-mono text-xs">ADMIN_EMAILS</code> (or its
          domain to <code className="font-mono text-xs">ADMIN_EMAIL_DOMAINS</code>)
          on the Convex deployment, or have an existing admin add you via the
          editable allowlist.
        </Text>
      ) : (
        <Text className="text-muted-fg">
          Something went wrong rendering the admin console. Try again, or
          head back to the public site.
        </Text>
      )}
      {error.message && (
        <pre className="max-w-full overflow-x-auto rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-fg">
          {error.message}
        </pre>
      )}
      <div className="flex gap-2">
        <Button intent="primary" size="sm" onPress={() => reset()}>
          Try again
        </Button>
        <Button intent="outline" size="sm" onPress={() => (window.location.href = "/")}>
          Back to public site
        </Button>
      </div>
      {error.digest && (
        <Text className="text-xs text-muted-fg">
          Error reference: <code className="font-mono">{error.digest}</code>
        </Text>
      )}
    </div>
  );
}
