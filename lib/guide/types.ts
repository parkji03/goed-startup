import type { UIMessage } from 'ai';
import type { GuideContextItem } from '@/convex/guide';
import type { GuideRagItem } from '@/convex/guides';

export type { GuideContextItem, GuideRagItem };

/**
 * UIMessage variant our route emits. Sources and guides are attached at
 * message-level via `metadata` (not as data parts) so they live on the same
 * bubble as the model's text — ai-sdk would otherwise create a separate empty
 * assistant message for any data parts written before the model's first
 * text delta.
 *
 * `sources` are programs (the resources catalog).
 * `guides` are how-to articles + the 19-step founder journey.
 *
 * They're separate fields rather than a tagged union to keep downstream code
 * (citation rules, trust allowlist, export, disclosure) branch-on-kind by
 * inspection rather than narrowing.
 */
export type GuideUIMessageMetadata = {
  sources?: GuideContextItem[];
  guides?: GuideRagItem[];
};

export type GuideUIMessage = UIMessage<GuideUIMessageMetadata>;
