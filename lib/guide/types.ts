import type { UIMessage } from 'ai';
import type { GuideContextItem } from '@/convex/guide';

export type { GuideContextItem };

/**
 * UIMessage variant our route emits. Sources are attached at message-level
 * via `metadata` (not as data parts) so they live on the same bubble as the
 * model's text — ai-sdk would otherwise create a separate empty assistant
 * message for any data parts written before the model's first text delta.
 */
export type GuideUIMessageMetadata = {
  sources?: GuideContextItem[];
};

export type GuideUIMessage = UIMessage<GuideUIMessageMetadata>;
