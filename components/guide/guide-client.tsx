"use client";

import { useUIMessages } from "@convex-dev/agent/react";
import { useAction, useMutation } from "convex/react";
import { useEffect, useState } from "react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Heading } from "@/components/ui/heading";
import { Text } from "@/components/ui/text";
import { Input } from "@/components/ui/input";
import { loadQuizAnswers } from "@/lib/founder-quiz";

/** Bump when backend requires per-user-owned threads so stale anonymous sessions rotate. */
const THREAD_SESSION_KEY = "goed-guide-thread-v2";

function messageText(parts: unknown[] | undefined) {
  if (!parts) return "";
  return parts
    .filter(
      (p): p is { type?: string; text?: string } =>
        !!p && typeof p === "object" && "type" in p && (p as { type?: string }).type === "text",
    )
    .map((p) => p.text ?? "")
    .join("");
}

export function GuideClient({ initialQuery = "" }: { initialQuery?: string }) {
  const [threadId, setThreadId] = useState<string | null>(() =>
    typeof window !== "undefined" ? sessionStorage.getItem(THREAD_SESSION_KEY) : null,
  );
  const createThread = useMutation(api.guide.createThread);
  const send = useAction(api.guide.sendMessage);

  const [input, setInput] = useState(initialQuery);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);

  useEffect(() => {
    if (threadId) return;
    let cancelled = false;
    void (async () => {
      setBootstrapError(null);
      try {
        const created = await createThread({});
        if (cancelled) return;
        sessionStorage.setItem(THREAD_SESSION_KEY, created.threadId);
        setThreadId(created.threadId);
      } catch (err) {
        if (!cancelled) setBootstrapError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [threadId, createThread]);

  const { results } = useUIMessages(
    api.resources.listThreadUIMessages,
    threadId ? { threadId } : "skip",
    { initialNumItems: 40, stream: true },
  );

  const [pending, setPending] = useState(false);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-10">
      <Heading level={1} className="text-3xl tracking-tight">
        Utah founder guide
      </Heading>
      <Text className="text-muted-fg">
        Retrieval + profile-aware re-ranking over published resources. Responses stream through Convex;
        refresh-safe via the Agent component.
      </Text>
      {bootstrapError ? (
        <div className="rounded-xl border border-border bg-muted/40 p-4">
          <Text className="text-danger-subtle-fg text-sm font-medium">Could not start guide thread</Text>
          <Text className="text-muted-fg mt-2 text-sm">{bootstrapError}</Text>
          <Text className="text-muted-fg mt-2 text-xs">
            Sign in (Clerk) so Convex receives your JWT. If this persists, reset the chat below and try again.
          </Text>
        </div>
      ) : null}
      <div className="space-y-4 rounded-xl border border-border bg-muted/20 p-4">
        {bootstrapError ? (
          <Text className="text-muted-fg text-sm">
            Messages load after you are signed in and a thread has been created.
          </Text>
        ) : results.length === 0 ? (
          <Text className="text-muted-fg text-sm">{threadId ? "Starting chat…" : "Starting thread…"}</Text>
        ) : (
          results.map((m) => (
            <div key={`${m.order}-${m.stepOrder}`} className="border-b border-border pb-3 last:border-0">
              <Text className="text-muted-fg text-xs uppercase">{m.role}</Text>
              <Text className="mt-1 whitespace-pre-wrap text-sm">{messageText(m.parts)}</Text>
            </div>
          ))
        )}
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor="guide-input" className="font-medium text-fg text-sm">
          Ask anything about Utah programs, funding, or operations
        </label>
        <Input
          id="guide-input"
          value={input}
          placeholder="Try: exporting for the first time or rural founder programs"
          onChange={(e) => setInput(e.target.value)}
        />
        <div className="flex gap-3">
          <Button
            intent="primary"
            size="sm"
            isDisabled={pending || !threadId}
            onPress={() => {
              void (async () => {
                if (!threadId) return;
                setPending(true);
                try {
                  const founderProfile = loadQuizAnswers() ?? undefined;
                  await send({ threadId, prompt: input, founderProfile });
                  setInput("");
                } finally {
                  setPending(false);
                }
              })();
            }}
          >
            {pending ? "Thinking…" : "Send"}
          </Button>
          <Button
            intent="outline"
            size="sm"
            onPress={() => {
              sessionStorage.removeItem(THREAD_SESSION_KEY);
              setThreadId(null);
              setBootstrapError(null);
            }}
          >
            Reset thread
          </Button>
        </div>
      </div>
    </div>
  );
}
