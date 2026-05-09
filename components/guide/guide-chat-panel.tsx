"use client";

import { useAction } from "convex/react";
import { useEffect, useId, useRef, useState } from "react";
import { ArrowDownTrayIcon, TrashIcon } from "@heroicons/react/20/solid";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/field";
import { Heading } from "@/components/ui/heading";
import { Input } from "@/components/ui/input";
import { Link as UiLink } from "@/components/ui/link";
import { Text } from "@/components/ui/text";
import { Link } from "@/i18n/navigation";
import { loadQuizAnswers } from "@/lib/founder-quiz";

type GuideContextItem = {
  resourceId: Id<"resources">;
  title: string;
  slug: string;
  url: string;
  description: string;
  topics: string[];
  industries: string[];
  communities: string[];
};

type ChatMessage =
  | { id: string; role: "user"; content: string }
  | { id: string; role: "assistant"; content: string; pending: boolean; context: GuideContextItem[] };

type Props = {
  initialQuery?: string;
  compact?: boolean;
};

function newId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function exportToMarkdown(messages: ChatMessage[]): string {
  const date = new Date().toLocaleString();
  const lines: string[] = ["# Utah founder guide chat", "", `Exported ${date}`, ""];
  for (const m of messages) {
    if (m.role === "user") {
      lines.push("## You", "", m.content, "");
    } else {
      lines.push("## Guide", "", m.content, "");
      if (m.context.length > 0) {
        lines.push("**Sources used**", "");
        for (const c of m.context) {
          lines.push(`- [${c.title}](${c.url}) — \`/resources/${c.slug}\``);
        }
        lines.push("");
      }
    }
  }
  return lines.join("\n");
}

function downloadMarkdown(filename: string, body: string) {
  const blob = new Blob([body], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export function GuideChatPanel({ initialQuery = "", compact = false }: Props) {
  const inputId = useId();
  const ask = useAction(api.guide.ask);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState(initialQuery);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const scrollerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const node = scrollerRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [messages]);

  const sendMessage = () => {
    if (pending) return;
    const value = input.trim();
    if (!value) return;

    const userMessage: ChatMessage = { id: newId(), role: "user", content: value };
    const assistantId = newId();
    const placeholder: ChatMessage = {
      id: assistantId,
      role: "assistant",
      content: "Thinking...",
      pending: true,
      context: [],
    };

    setMessages((prev) => [...prev, userMessage, placeholder]);
    setInput("");
    setError(null);
    setPending(true);

    void (async () => {
      try {
        const founderProfile = loadQuizAnswers() ?? undefined;
        const result = await ask({ prompt: value, founderProfile });
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  id: assistantId,
                  role: "assistant",
                  content: result.reply,
                  pending: false,
                  context: result.context,
                }
              : m,
          ),
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setMessages((prev) => prev.filter((m) => m.id !== assistantId));
      } finally {
        setPending(false);
      }
    })();
  };

  const clearChat = () => {
    setMessages([]);
    setError(null);
  };

  const exportChat = () => {
    if (messages.length === 0) return;
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    downloadMarkdown(`utah-founder-guide-chat-${stamp}.md`, exportToMarkdown(messages));
  };

  const hasMessages = messages.length > 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex shrink-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <Heading level={compact ? 2 : 1} className={compact ? "text-lg" : "text-3xl tracking-tight"}>
            Utah founder guide
          </Heading>
          <Text className="mt-2 text-muted-fg">
            Ask about Utah programs, funding, or operations. Chat is ephemeral — refresh and it&apos;s gone.
          </Text>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Button
            intent="plain"
            size="sq-xs"
            onPress={exportChat}
            isDisabled={!hasMessages}
            aria-label="Export chat as Markdown"
          >
            <ArrowDownTrayIcon />
          </Button>
          <Button
            intent="plain"
            size="sq-xs"
            onPress={clearChat}
            isDisabled={!hasMessages || pending}
            aria-label="Clear chat"
          >
            <TrashIcon />
          </Button>
        </div>
      </div>

      {error ? (
        <div role="alert" className="rounded-xl border border-border bg-muted/40 p-4">
          <Text className="text-danger-subtle-fg text-sm font-medium">Guide hiccup</Text>
          <Text className="mt-2 text-muted-fg text-sm">{error}</Text>
        </div>
      ) : null}

      <div
        ref={scrollerRef}
        className="min-h-48 flex-1 space-y-4 overflow-auto rounded-xl border border-border bg-muted/20 p-4"
      >
        {messages.length === 0 ? (
          <Text className="text-muted-fg text-sm">
            Ask anything about Utah programs to get started.
          </Text>
        ) : (
          messages.map((m) => (
            <ChatBubble key={m.id} message={m} />
          ))
        )}
      </div>

      <div className="shrink-0 space-y-2">
        <Label htmlFor={inputId}>Ask the AI guide</Label>
        <Input
          id={inputId}
          value={input}
          placeholder="Try: rural founder programs"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              sendMessage();
            }
          }}
        />
        <div className="flex flex-wrap gap-2">
          <Button intent="primary" size="sm" isDisabled={pending || !input.trim()} onPress={sendMessage}>
            {pending ? "Thinking..." : "Send"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function ChatBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  return (
    <div className="border-b border-border pb-3 last:border-0">
      <Text className="text-muted-fg text-xs uppercase">{isUser ? "You" : "Guide"}</Text>
      <Text className="mt-1 whitespace-pre-wrap text-sm">{message.content}</Text>
      {!isUser && !message.pending && message.context.length > 0 ? (
        <ContextDisclosure items={message.context} />
      ) : null}
    </div>
  );
}

function ContextDisclosure({ items }: { items: GuideContextItem[] }) {
  return (
    <details className="group mt-3 rounded-lg border border-border bg-bg/40">
      <summary className="cursor-pointer list-none px-3 py-2 text-xs font-medium text-muted-fg outline-0 outline-offset-2 hover:text-fg focus-visible:outline-2 focus-visible:outline-ring">
        <span className="inline-flex items-center gap-1">
          <span className="transition group-open:rotate-90" aria-hidden>
            ▸
          </span>
          {items.length} {items.length === 1 ? "source" : "sources"} used
        </span>
      </summary>
      <ul className="space-y-1.5 px-3 pb-3">
        {items.map((c) => (
          <li key={c.resourceId} className="text-xs">
            <Link href={`/resources/${c.slug}`} className="font-medium text-fg hover:underline">
              {c.title}
            </Link>
            {" · "}
            <UiLink
              href={c.url}
              className="text-muted-fg hover:underline"
              rel="noopener noreferrer"
              target="_blank"
            >
              Official site
            </UiLink>
          </li>
        ))}
      </ul>
    </details>
  );
}
