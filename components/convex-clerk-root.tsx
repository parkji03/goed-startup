"use client";

import { ClerkProvider, useAuth } from "@clerk/nextjs";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import type { ReactNode } from "react";

import {
  ConvexClientProvider,
  getConvexBrowserClient,
} from "@/components/ConvexClientProvider";

const clerkKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

export function ConvexClerkRoot({ children }: { children: ReactNode }) {
  if (!process.env.NEXT_PUBLIC_CONVEX_URL) {
    console.warn("NEXT_PUBLIC_CONVEX_URL is missing — Convex hooks will fail.");
    return children;
  }

  if (!clerkKey) {
    return <ConvexClientProvider>{children}</ConvexClientProvider>;
  }

  return (
    <ClerkProvider publishableKey={clerkKey}>
      <ConvexProviderWithClerk client={getConvexBrowserClient()} useAuth={useAuth}>
        {children}
      </ConvexProviderWithClerk>
    </ClerkProvider>
  );
}
