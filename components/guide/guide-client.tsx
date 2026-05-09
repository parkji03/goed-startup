"use client";

import { GuideChatPanel } from "@/components/guide/guide-chat-panel";

export function GuideClient({ initialQuery = "" }: { initialQuery?: string }) {
  return (
    <div className="mx-auto flex min-h-[calc(100dvh-8rem)] max-w-3xl flex-col px-4 py-10">
      <GuideChatPanel initialQuery={initialQuery} />
    </div>
  );
}
