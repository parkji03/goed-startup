"use client";

import { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Link as UiLink } from "@/components/ui/link";
import { Link } from "@/i18n/navigation";
import type { GuideContextItem, GuideRagItem } from "@/lib/guide/types";

const INTERNAL_PATH = /^\/(resources|guides)\/([a-z0-9][a-z0-9-]*)\/?$/i;

type Props = {
  text: string;
  /**
   * Trust allowlist for clickable links inside model-authored markdown.
   *
   * Model output is untrusted: it can hallucinate slugs and URLs. We only
   * render an `<a>` as a real link when the href matches one of the items
   * the server actually retrieved for *this* message. Everything else is
   * rendered as plain text (the link's anchor text is preserved, but the
   * destination isn't actionable).
   *
   * `sources` are programs (resource catalog).
   * `guides` are how-to articles + the 19-step founder journey.
   * Each kind has its own allowlist so a "/guides/networking" hallucination
   * isn't accidentally allowlisted by a resource named "networking".
   *
   * The `ContextDisclosure` below the bubble is the canonical place to
   * surface verified items; this allowlist just lets the model sprinkle
   * those same verified links inline without opening a new attack surface.
   */
  sources: GuideContextItem[];
  guides?: GuideRagItem[];
};

/**
 * Renders the assistant's streamed markdown. Internal `/resources/<slug>`
 * and `/guides/<slug>` links route through next-intl navigation; external
 * URLs open in a new tab. Streaming-safe — partial markdown renders the
 * literal characters until closing tokens arrive. Hallucinated/injected
 * hrefs are stripped to plain text per the trust contract above.
 */
export function AssistantMarkdown({ text, sources, guides = [] }: Props) {
  const trustedResourceSlugs = useMemo(
    () => new Set(sources.map((s) => s.slug.toLowerCase())),
    [sources],
  );
  const trustedGuideSlugs = useMemo(
    () => new Set(guides.map((g) => g.slug.toLowerCase())),
    [guides],
  );
  const trustedUrls = useMemo(
    () => new Set([...sources.map((s) => s.url), ...guides.map((g) => g.sourceUrl)]),
    [sources, guides],
  );

  return (
    <div className="space-y-2 text-sm leading-relaxed [&_p]:m-0 [&_strong]:font-semibold [&_em]:italic [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[12px] [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-0.5">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => {
            if (!href) return <span>{children}</span>;

            const internalMatch = href.match(INTERNAL_PATH);
            if (internalMatch) {
              const kind = internalMatch[1].toLowerCase();
              const slug = internalMatch[2].toLowerCase();
              const trusted =
                kind === 'resources'
                  ? trustedResourceSlugs.has(slug)
                  : trustedGuideSlugs.has(slug);
              if (trusted) {
                const path = (kind === 'resources' ? `/resources/${slug}` : `/guides/${slug}`) as
                  | `/resources/${string}`
                  | `/guides/${string}`;
                return (
                  <Link
                    href={path}
                    className="font-medium text-fg underline underline-offset-2 hover:text-primary"
                  >
                    {children}
                  </Link>
                );
              }
              return <span>{children}</span>;
            }

            if (trustedUrls.has(href)) {
              return (
                <UiLink
                  href={href}
                  className="text-fg underline underline-offset-2 hover:text-primary"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {children}
                </UiLink>
              );
            }

            return <span>{children}</span>;
          },
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
