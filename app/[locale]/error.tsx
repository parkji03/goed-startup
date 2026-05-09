"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Heading } from "@/components/ui/heading";
import { Text } from "@/components/ui/text";

/**
 * Locale-scoped error boundary. Catches anything thrown by the page tree
 * (server-rendered errors during render, hooks throwing during commit,
 * Convex query throws on mount, etc.) so the user gets a friendly
 * "something went wrong" panel instead of a blank screen.
 */
export default function LocaleError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface server digests in the browser console so the dev tools can
    // correlate to a server-side log line. Stays no-op in prod logging.
    console.error("Page error boundary caught:", error);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-start justify-center gap-4 px-4 py-16">
      <Heading level={1} className="text-3xl tracking-tight">
        Something went wrong
      </Heading>
      <Text className="text-muted-fg">
        We hit an unexpected error rendering this page. You can try again, or
        head back to browse resources.
      </Text>
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
          Back to home
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
