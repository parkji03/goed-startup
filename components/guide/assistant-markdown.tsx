"use client";

import { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Link as UiLink } from "@/components/ui/link";
import { Link } from "@/i18n/navigation";
import type { GuideContextItem } from "@/lib/guide/types";

const RESOURCE_PATH = /^\/resources\/([a-z0-9][a-z0-9-]*)\/?$/i;
// Map-recommend route emits links of the form `#entity-<kind>-<id>` where
// kind is literally "company" or "investor". Embedding the kind tells
// the click handler which Convex table to fetch from without keeping a
// separate persona-tracking state in sync.
const ENTITY_FRAGMENT = /^#entity-(company|investor)-([A-Za-z0-9_-]+)$/;
export type EntityLinkKind = 'company' | 'investor';

type Props = {
  text: string;
  /**
   * Trust allowlist for clickable links inside model-authored markdown.
   *
   * Model output is untrusted: it can hallucinate slugs and URLs. We only
   * render an `<a>` as a real link when the href matches one of the sources
   * the server actually retrieved for *this* message. Everything else is
   * rendered as plain text (the link's anchor text is preserved, but the
   * destination isn't actionable).
   *
   * The `ContextDisclosure` below the bubble is the canonical place to
   * surface verified resources; this allowlist just lets the model sprinkle
   * those same verified links inline without opening a new attack surface.
   */
  sources: GuideContextItem[];
  /**
   * Optional handler for map-recommendation entity links. When provided,
   * `[Name](#entity-<kind>-<id>)` markdown links render as inline
   * buttons that call this with the parsed id and kind. When omitted,
   * those links degrade to plain text — same trust posture as unverified
   * resource links.
   */
  onEntitySelect?: (entityId: string, kind: EntityLinkKind) => void;
};

/**
 * Renders the assistant's streamed markdown. Internal `/resources/<slug>`
 * links route through next-intl navigation; external URLs open in a new
 * tab. Streaming-safe — partial markdown renders the literal characters
 * until closing tokens arrive. Hallucinated/injected hrefs are stripped to
 * plain text per the trust contract above.
 */
export function AssistantMarkdown({ text, sources, onEntitySelect }: Props) {
  const trustedSlugs = useMemo(
    () => new Set(sources.map((s) => s.slug.toLowerCase())),
    [sources],
  );
  const trustedUrls = useMemo(
    () => new Set(sources.map((s) => s.url)),
    [sources],
  );

  return (
    <div className="space-y-2 text-sm leading-relaxed [&_p]:m-0 [&_strong]:font-semibold [&_em]:italic [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[12px] [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-0.5">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => {
            if (!href) return <span>{children}</span>;

            // Map-recommend entity links: render as button when a handler
            // is wired up. Without a handler, fall through to the
            // not-trusted plain-text path (no in-page anchor jump on a
            // page that has no such anchor).
            const entityMatch = href.match(ENTITY_FRAGMENT);
            if (entityMatch && onEntitySelect) {
              const kind = entityMatch[1] as EntityLinkKind;
              const id = entityMatch[2];
              return (
                <button
                  type="button"
                  onClick={() => onEntitySelect(id, kind)}
                  className="font-medium text-fg underline underline-offset-2 hover:text-primary"
                >
                  {children}
                </button>
              );
            }

            const resourceMatch = href.match(RESOURCE_PATH);
            if (resourceMatch) {
              const slug = resourceMatch[1].toLowerCase();
              if (trustedSlugs.has(slug)) {
                return (
                  <Link
                    href={`/resources/${slug}` as `/resources/${string}`}
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
