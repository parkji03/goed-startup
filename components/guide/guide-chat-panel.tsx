"use client";

import { ArrowDownTrayIcon, ArrowUpIcon, ClipboardDocumentIcon } from "@heroicons/react/20/solid";
import { useAction } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Link as UiLink } from "@/components/ui/link";
import { Text } from "@/components/ui/text";
import { Tooltip, TooltipContent } from "@/components/ui/tooltip";
import { Link } from "@/i18n/navigation";
import { loadQuizAnswers } from "@/lib/founder-quiz";

type GuideContextItem = {
  resourceId: Id<"resources">;
  title: string;
  slug: string;
  url: string;
  description: string;
  tags: string[];
  industries: string[];
  communities: string[];
};

type ChatMessage =
  | { id: string; role: "user"; content: string }
  | { id: string; role: "assistant"; content: string; pending: boolean; context: GuideContextItem[] };

type Props = {
  initialQuery?: string;
  compact?: boolean;
  /** Called when the panel collapse button is pressed. Omit to hide the button. */
  onCollapse?: () => void;
};

const SUGGESTED_PROMPTS = [
  "What funding is available for early-stage founders?",
  "Find accelerators and incubators in Utah",
  "Programs for rural or underrepresented founders",
  "How do I connect with Utah angel investors?",
];

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

export function GuideChatPanel({ initialQuery = "", onCollapse }: Props) {
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

  const sendMessage = (overrideText?: string) => {
    if (pending) return;
    const value = (overrideText ?? input).trim();
    if (!value) return;

    const assistantId = newId();
    setMessages((prev) => [
      ...prev,
      { id: newId(), role: "user", content: value },
      { id: assistantId, role: "assistant", content: "", pending: true, context: [] },
    ]);
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
              ? { id: assistantId, role: "assistant", content: result.reply, pending: false, context: result.context }
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

  const exportAll = () => {
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    downloadMarkdown(`utah-founder-guide-chat-${stamp}.md`, exportToMarkdown(messages));
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Collapse button */}
      <div className="flex shrink-0 items-center px-2 py-1.5">
        {onCollapse ? (
          <Tooltip>
            <Button intent="plain" size="sq-xs" onPress={onCollapse} aria-label="Collapse AI guide">
              <svg className="size-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
                <path d="M13.25 2.5c.69 0 1.25.56 1.25 1.25v8.5c0 .69-.56 1.25-1.25 1.25H7.5V15h5.75A2.75 2.75 0 0 0 16 12.25v-8.5A2.75 2.75 0 0 0 13.25 1H7.5v1.5zM5.75 1a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-.75.75h-3A2.75 2.75 0 0 1 0 12.25v-8.5A2.75 2.75 0 0 1 2.75 1z" />
              </svg>
            </Button>
            <TooltipContent>Collapse</TooltipContent>
          </Tooltip>
        ) : null}
      </div>

      {/* Message area */}
      <div ref={scrollerRef} className="min-h-0 flex-1 overflow-y-auto px-4">
        {messages.length === 0 ? (
          <EmptyState onChipClick={(p) => sendMessage(p)} />
        ) : (
          <div className="space-y-5 pb-4">
            {messages.map((m) => (
              <ChatBubble key={m.id} message={m} onExport={exportAll} />
            ))}
          </div>
        )}
      </div>

      {/* Error */}
      {error ? (
        <div role="alert" className="mx-4 mb-2 rounded-lg border border-danger/30 bg-danger-subtle/40 px-3 py-2">
          <Text className="text-danger-subtle-fg text-xs font-medium">Guide hiccup</Text>
          <Text className="mt-0.5 text-muted-fg text-xs">{error}</Text>
        </div>
      ) : null}

      {/* Input bar */}
      <div className="shrink-0 border-t border-border px-3 py-3">
        <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/30 px-3 py-2 focus-within:ring-2 focus-within:ring-ring/40">
          <input
            value={input}
            placeholder="Ask about Utah programs..."
            disabled={pending}
            className="min-w-0 flex-1 bg-transparent text-sm text-fg placeholder:text-muted-fg outline-none disabled:opacity-50"
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
          />
          <Tooltip>
            <Button
              intent="primary"
              size="sq-xs"
              isCircle
              isDisabled={pending || !input.trim()}
              onPress={() => sendMessage()}
              aria-label="Send message"
            >
              <ArrowUpIcon />
            </Button>
            <TooltipContent>Send</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ onChipClick }: { onChipClick: (prompt: string) => void }) {
  return (
    <div className="flex h-full flex-col justify-end gap-3 pb-2 pt-6">
      <p className="text-center text-xs text-muted-fg">Try a question to get started</p>
      <div className="flex flex-col gap-1.5">
        {SUGGESTED_PROMPTS.map((prompt) => (
          <button
            key={prompt}
            type="button"
            onClick={() => onChipClick(prompt)}
            className="rounded-lg border border-border bg-muted/20 px-3 py-2.5 text-left text-xs text-muted-fg transition-colors hover:bg-muted hover:text-fg"
          >
            {prompt}
          </button>
        ))}
      </div>
    </div>
  );
}

function ThinkingDots() {
  return (
    <span className="inline-flex items-center gap-1 py-1">
      <span className="size-1.5 animate-bounce rounded-full bg-muted-fg [animation-delay:-0.3s]" />
      <span className="size-1.5 animate-bounce rounded-full bg-muted-fg [animation-delay:-0.15s]" />
      <span className="size-1.5 animate-bounce rounded-full bg-muted-fg" />
    </span>
  );
}

function ChatBubble({ message, onExport }: { message: ChatMessage; onExport: () => void }) {
  const isUser = message.role === "user";
  const isCompleted = !isUser && !message.pending;

  const copyMessage = () => {
    void navigator.clipboard.writeText(message.content);
  };

  return (
    <div>
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-fg">
        {isUser ? "You" : "Guide"}
      </p>
      {!isUser && message.pending ? (
        <ThinkingDots />
      ) : (
        <p className="whitespace-pre-wrap text-sm leading-relaxed">{message.content}</p>
      )}
      {isCompleted && message.context.length > 0 ? (
        <ContextDisclosure items={message.context} />
      ) : null}
      {isCompleted ? (
        <div className="mt-2 flex items-center gap-0.5">
          <Tooltip>
            <Button intent="plain" size="sq-xs" onPress={copyMessage} aria-label="Copy response">
              <ClipboardDocumentIcon />
            </Button>
            <TooltipContent>Copy response</TooltipContent>
          </Tooltip>
          <Tooltip>
            <Button intent="plain" size="sq-xs" onPress={onExport} aria-label="Download chat as Markdown">
              <ArrowDownTrayIcon />
            </Button>
            <TooltipContent>Export chat</TooltipContent>
          </Tooltip>
        </div>
      ) : null}
    </div>
  );
}

function ContextDisclosure({ items }: { items: GuideContextItem[] }) {
  return (
    <details className="group mt-3 rounded-lg border border-border bg-muted/20">
      <summary className="cursor-pointer list-none px-3 py-2 text-xs font-medium text-muted-fg outline-0 outline-offset-2 hover:text-fg focus-visible:outline-2 focus-visible:outline-ring">
        <span className="inline-flex items-center gap-1">
          <span className="transition group-open:rotate-90" aria-hidden>▸</span>
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
            <UiLink href={c.url} className="text-muted-fg hover:underline" rel="noopener noreferrer" target="_blank">
              Official site
            </UiLink>
          </li>
        ))}
      </ul>
    </details>
  );
}
