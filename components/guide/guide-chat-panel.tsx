"use client";

import { useChat } from '@ai-sdk/react';
import { ArrowDownTrayIcon, ArrowUpIcon, ClipboardDocumentIcon, SparklesIcon, StopIcon } from "@heroicons/react/20/solid";
import { DefaultChatTransport } from 'ai';
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { AssistantMarkdown } from "@/components/guide/assistant-markdown";
import { useQuiz } from "@/components/quiz/quiz-provider";
import { Button } from "@/components/ui/button";
import { Link as UiLink } from "@/components/ui/link";
import { Text } from "@/components/ui/text";
import { Tooltip, TooltipContent } from "@/components/ui/tooltip";
import { Link } from "@/i18n/navigation";
import { loadQuizAnswers } from "@/lib/founder-quiz";
import { useSmoothText } from "@/lib/guide/use-smooth-text";
import type { GuideContextItem, GuideRagItem, GuideUIMessage } from "@/lib/guide/types";

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

/**
 * Render a friendly message for `useChat` errors. The server can return HTML
 * error pages (e.g. Next.js 404) and we don't want that bleeding into the UI.
 * If the error message looks like HTML or is suspiciously long, fall back to
 * a generic line.
 */
function friendlyErrorText(error: Error | undefined): string | null {
  const raw = error?.message;
  if (!raw) return null;
  const looksLikeHtml = /<\/?[a-z][\s\S]*?>/i.test(raw);
  if (looksLikeHtml || raw.length > 200) {
    return "Couldn't reach the guide. Try again in a moment.";
  }
  return raw;
}

function exportToMarkdown(messages: GuideUIMessage[]): string {
  const date = new Date().toLocaleString();
  const lines: string[] = ["# Utah founder guide chat", "", `Exported ${date}`, ""];
  for (const m of messages) {
    const text = m.parts
      .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
      .map((p) => p.text)
      .join('');
    if (m.role === "user") {
      lines.push("## You", "", text, "");
    } else if (m.role === "assistant") {
      const sources = m.metadata?.sources ?? [];
      lines.push("## Guide", "", text, "");
      if (sources.length > 0) {
        lines.push("**Sources used**", "");
        for (const c of sources) lines.push(`- [${c.title}](${c.url}) — \`/resources/${c.slug}\``);
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
  const { messages, sendMessage, status, stop, error } = useChat<GuideUIMessage>({
    transport: new DefaultChatTransport({ api: '/api/chat' }),
  });
  const { pendingPrompt, setPendingPrompt } = useQuiz();

  const [input, setInput] = useState(initialQuery);
  const isStreaming = status === 'submitted' || status === 'streaming';

  const scrollerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const node = scrollerRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [messages]);

  // Auto-send a kickstart prompt set by the questionnaire's "Start chatting"
  // action, but only into an empty thread. If the user already has messages,
  // discard the queued prompt so we don't disrupt an in-progress conversation.
  useEffect(() => {
    if (!pendingPrompt || isStreaming) return;
    if (messages.length > 0) {
      setPendingPrompt(null);
      return;
    }
    const text = pendingPrompt;
    setPendingPrompt(null);
    sendMessage(
      { text },
      { body: { founderProfile: loadQuizAnswers() ?? undefined } },
    );
  }, [pendingPrompt, messages.length, isStreaming, sendMessage, setPendingPrompt]);

  const onSend = (overrideText?: string) => {
    if (isStreaming) return;
    const value = (overrideText ?? input).trim();
    if (!value) return;
    setInput("");
    sendMessage(
      { text: value },
      { body: { founderProfile: loadQuizAnswers() ?? undefined } },
    );
  };

  const exportAll = () => {
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    downloadMarkdown(`utah-founder-guide-chat-${stamp}.md`, exportToMarkdown(messages));
  };

  const errorText = friendlyErrorText(error);

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
          <EmptyState onChipClick={(p) => onSend(p)} />
        ) : (
          <div className="space-y-5 pb-4">
            {messages.map((m) => (
              <ChatBubble
                key={m.id}
                message={m}
                streaming={isStreaming && m === messages.at(-1)}
                onExport={exportAll}
              />
            ))}
          </div>
        )}
      </div>

      {/* Error */}
      {errorText ? (
        <div role="alert" className="mx-4 mb-2 rounded-lg border border-danger/30 bg-danger-subtle/40 px-3 py-2">
          <Text className="text-danger-subtle-fg text-xs font-medium">Guide hiccup</Text>
          <Text className="mt-0.5 text-muted-fg text-xs">{errorText}</Text>
        </div>
      ) : null}

      {/* Input bar */}
      <div className="shrink-0 border-t border-border px-3 py-3">
        <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/30 px-3 py-2 focus-within:ring-2 focus-within:ring-ring/40">
          <input
            value={input}
            placeholder="Ask about Utah programs..."
            disabled={isStreaming}
            className="min-w-0 flex-1 bg-transparent text-sm text-fg placeholder:text-muted-fg outline-none disabled:opacity-50"
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onSend();
              }
            }}
          />
          {isStreaming ? (
            <Tooltip>
              <Button
                intent="primary"
                size="sq-xs"
                isCircle
                onPress={() => stop()}
                aria-label="Stop generating"
              >
                <StopIcon />
              </Button>
              <TooltipContent>Stop</TooltipContent>
            </Tooltip>
          ) : (
            <Tooltip>
              <Button
                intent="primary"
                size="sq-xs"
                isCircle
                isDisabled={!input.trim()}
                onPress={() => onSend()}
                aria-label="Send message"
              >
                <ArrowUpIcon />
              </Button>
              <TooltipContent>Send</TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>
    </div>
  );
}

/** No-op subscribe — getSnapshot is re-evaluated on each render, which is
 *  enough for our needs since EmptyState re-renders when the questionnaire
 *  modal opens/closes (it consumes that state via useQuiz). */
const NOOP_SUBSCRIBE = () => () => {};

function EmptyState({ onChipClick }: { onChipClick: (prompt: string) => void }) {
  const quiz = useQuiz();
  // `loadQuizAnswers` reads localStorage, which only exists on the client.
  // useSyncExternalStore lets us return `false` on the server (matching what
  // SSR will paint) and the real value on the client without triggering a
  // hydration mismatch.
  const hasProfile = useSyncExternalStore(
    NOOP_SUBSCRIBE,
    () => loadQuizAnswers() !== null,
    () => false,
  );

  return (
    <div className="flex h-full flex-col gap-4 pb-2 pt-6">
      {!hasProfile ? (
        <div className="rounded-xl border border-border bg-muted/20 px-3.5 py-3">
          <p className="text-xs font-medium text-fg">Tailor responses to what you’re looking for</p>
          <p className="mt-0.5 text-xs text-muted-fg">
            Take our short questionnaire so the guide can weight recommendations to your stage, industry, and goals.
          </p>
          <Button
            intent="primary"
            size="xs"
            onPress={quiz.open}
            className="mt-2.5"
          >
            <SparklesIcon />
            Take questionnaire
          </Button>
        </div>
      ) : null}
      <div className="mt-auto flex flex-col gap-3">
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

function ChatBubble({
  message,
  streaming,
  onExport,
}: {
  message: GuideUIMessage;
  streaming: boolean;
  onExport: () => void;
}) {
  const isUser = message.role === "user";
  const rawText = message.parts
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map((p) => p.text)
    .join('');
  const sources = message.metadata?.sources ?? [];
  const guides = message.metadata?.guides ?? [];
  const text = useSmoothText(rawText);

  const showThinking = !isUser && streaming && rawText.length === 0;
  const isCompleted = !isUser && !streaming && rawText.length > 0;

  const copyMessage = () => {
    void navigator.clipboard.writeText(rawText);
  };

  return (
    <div>
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-fg">
        {isUser ? "You" : "Guide"}
      </p>
      {showThinking ? (
        <ThinkingDots />
      ) : isUser ? (
        <p className="whitespace-pre-wrap text-sm leading-relaxed">{rawText}</p>
      ) : (
        <AssistantMarkdown text={text} sources={sources} guides={guides} />
      )}
      {!isUser && !streaming && (sources.length > 0 || guides.length > 0) ? (
        <ContextDisclosure resources={sources} guides={guides} />
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

function ContextDisclosure({
  resources,
  guides,
}: {
  resources: GuideContextItem[];
  guides: GuideRagItem[];
}) {
  const total = resources.length + guides.length;
  if (total === 0) return null;
  const summaryWord = total === 1 ? "source" : "sources";
  return (
    <details className="group mt-3 rounded-lg border border-border bg-muted/20">
      <summary className="cursor-pointer list-none px-3 py-2 text-xs font-medium text-muted-fg outline-0 outline-offset-2 hover:text-fg focus-visible:outline-2 focus-visible:outline-ring">
        <span className="inline-flex items-center gap-1">
          <span className="transition group-open:rotate-90" aria-hidden>▸</span>
          {total} {summaryWord} used
        </span>
      </summary>
      <div className="space-y-3 px-3 pb-3">
        {resources.length > 0 ? (
          <div>
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-fg">
              Resources
            </p>
            <ul className="space-y-1.5">
              {resources.map((c) => (
                <li key={`r-${c.slug}`} className="text-xs">
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
          </div>
        ) : null}
        {guides.length > 0 ? (
          <div>
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-fg">
              Further reading
            </p>
            <ul className="space-y-1.5">
              {guides.map((g) => (
                <li key={`g-${g.slug}`} className="text-xs">
                  <Link href={`/guides/${g.slug}`} className="font-medium text-fg hover:underline">
                    {g.title}
                  </Link>
                  {" · "}
                  <UiLink
                    href={g.sourceUrl}
                    className="text-muted-fg hover:underline"
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    Read original
                  </UiLink>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </details>
  );
}
