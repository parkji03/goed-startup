'use client';

import { ConvexProvider, ConvexReactClient } from 'convex/react';
import { ReactNode, useMemo } from 'react';

let browserClient: ConvexReactClient | undefined;

export function getConvexBrowserClient(): ConvexReactClient {
  if (!browserClient) {
    const url = process.env.NEXT_PUBLIC_CONVEX_URL;
    if (!url) {
      throw new Error('NEXT_PUBLIC_CONVEX_URL is not set');
    }
    browserClient = new ConvexReactClient(url);
  }
  return browserClient;
}

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  const client = useMemo(() => getConvexBrowserClient(), []);
  return <ConvexProvider client={client}>{children}</ConvexProvider>;
}
