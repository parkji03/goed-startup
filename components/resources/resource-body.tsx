"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Link as UiLink } from "@/components/ui/link";

type Props = {
  /** Cleaned markdown body. Pass nullish to render nothing. */
  body: string | undefined;
};

/**
 * Renders the long-form markdown body for a published resource. Source
 * content is curated (scraped + cleaned in scripts/build-resource-bodies.py),
 * so unlike `AssistantMarkdown` we don't need a trust allowlist — all links
 * open externally in a new tab. Headings, lists, emphasis use the project's
 * default text styling tuned for prose readability.
 */
export function ResourceBody({ body }: Props) {
  if (!body) return null;
  return (
    <div className="text-base leading-relaxed text-fg [&_h1]:mt-6 [&_h1]:mb-3 [&_h1]:text-2xl [&_h1]:font-semibold [&_h2]:mt-6 [&_h2]:mb-3 [&_h2]:text-xl [&_h2]:font-semibold [&_h3]:mt-5 [&_h3]:mb-2 [&_h3]:text-lg [&_h3]:font-semibold [&_p]:my-3 [&_p]:text-base [&_p]:text-fg [&_strong]:font-semibold [&_em]:italic [&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:my-1 [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-4 [&_blockquote]:text-muted-fg [&_hr]:my-6 [&_hr]:border-border">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => {
            if (!href) return <span>{children}</span>;
            return (
              <UiLink
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline underline-offset-2 hover:text-primary/80"
              >
                {children}
              </UiLink>
            );
          },
        }}
      >
        {body}
      </ReactMarkdown>
    </div>
  );
}
