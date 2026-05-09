import type { UIMessage } from 'ai';
import type { GuideContextItem } from '@/convex/guide';

export type { GuideContextItem };

/**
 * UIMessage variant our route emits. The server writes one `data-source`
 * part per retrieved resource before the model's text deltas.
 */
export type GuideUIMessage = UIMessage<
  never, // metadata
  { source: GuideContextItem } // data parts: { 'data-source': GuideContextItem }
>;
