import { ConvexHttpClient } from 'convex/browser';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import {
  convertToModelMessages,
  streamText,
  type UIMessage,
} from 'ai';
import { api } from '@/convex/_generated/api';
import {
  enforceLimits,
  validateUserMessageText,
  HISTORY_TURN_CAP,
  MAX_INPUT_CHARS,
} from '@/lib/guide/abuse-guards';
import { logHallucinatedSlugs } from '@/lib/guide/output-validator';
import { buildSystemPrompt } from '@/lib/guide/system-prompt';
import type { GuideContextItem, GuideRagItem } from '@/lib/guide/types';
import {
  clampFounderProfileForConvex,
  emptyFounderProfile,
  type FounderProfileConvex,
} from '@/convex/founderProfile';

export const runtime = 'nodejs'; // Need node:crypto in abuse-guards
export const maxDuration = 30;

const MODEL_ID = 'google/gemini-3.1-flash-lite';
const MAX_OUTPUT_TOKENS = 800;
const TEMPERATURE = 0.3;

function lastUserText(messages: UIMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== 'user') continue;
    return m.parts
      .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
      .map((p) => p.text)
      .join('\n');
  }
  return '';
}

function exceedsPerMessageCap(messages: UIMessage[], cap: number): boolean {
  for (const m of messages) {
    if (m.role !== 'user') continue;
    const text = m.parts
      .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
      .map((p) => p.text)
      .join('\n');
    if (text.length > cap) return true;
  }
  return false;
}

export async function POST(req: Request): Promise<Response> {
  const limit = await enforceLimits(req);
  if (!limit.ok) {
    return Response.json(limit.body, { status: limit.status });
  }
  const { hashedIp } = limit;

  let payload: {
    messages: UIMessage[];
    founderProfile?: FounderProfileConvex;
    locale?: 'en' | 'es';
  };
  try {
    payload = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const { messages = [], founderProfile } = payload;
  const locale: 'en' | 'es' = payload.locale === 'es' ? 'es' : 'en';

  if (exceedsPerMessageCap(messages, MAX_INPUT_CHARS)) {
    return Response.json(
      { error: `Message too long (max ${MAX_INPUT_CHARS} chars per turn).` },
      { status: 400 },
    );
  }

  const query = lastUserText(messages);

  if (!query.trim()) {
    return Response.json({ error: 'Message text is required.' }, { status: 400 });
  }

  const inputCheck = validateUserMessageText(query);
  if (!inputCheck.ok) {
    return Response.json(inputCheck.body, { status: inputCheck.status });
  }

  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) {
    return Response.json({ error: 'Server misconfigured: NEXT_PUBLIC_CONVEX_URL missing.' }, { status: 500 });
  }
  const convex = new ConvexHttpClient(convexUrl);
  let retrieval: { context: GuideContextItem[]; guides: GuideRagItem[] };
  try {
    retrieval = await convex.action(api.guide.retrieve, { query, founderProfile, locale });
  } catch (err) {
    console.error('[guide] retrieve failed', { ip: hashedIp, err: err instanceof Error ? err.message : String(err) });
    return Response.json({ error: 'Resource lookup failed. Please try again.' }, { status: 502 });
  }

  const orKey = process.env.OPENROUTER_API_KEY;
  if (!orKey) {
    return Response.json({ error: 'Server misconfigured: OPENROUTER_API_KEY missing.' }, { status: 500 });
  }
  const openrouter = createOpenRouter({
    apiKey: orKey,
    headers: {
      'HTTP-Referer': process.env.OPENROUTER_SITE_URL ?? 'https://startup.utah.gov',
      'X-Title': 'Startup Utah Guide',
    },
  });

  const profile: FounderProfileConvex = clampFounderProfileForConvex(
    founderProfile ?? emptyFounderProfile(),
  );

  const system = buildSystemPrompt({
    context: retrieval.context,
    guides: retrieval.guides,
    profile,
    locale,
  });

  // Cap history sent to the model. Preserve the first user message for opening context per spec §6.
  const recent = messages.slice(-HISTORY_TURN_CAP * 2);
  const firstUser = messages.find((m) => m.role === 'user');
  const cappedMessages =
    firstUser && messages.length > HISTORY_TURN_CAP * 2 && !recent.includes(firstUser)
      ? [firstUser, ...recent]
      : recent;
  const modelMessages = await convertToModelMessages(cappedMessages);

  const startedAt = Date.now();
  const result = streamText({
    model: openrouter.chat(MODEL_ID, {
      reasoning: { effort: 'minimal' },
    }),
    system,
    messages: modelMessages,
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    temperature: TEMPERATURE,
    abortSignal: req.signal,
    onFinish: (event) => {
      logHallucinatedSlugs({
        modelText: event.text,
        contextResourceSlugs: retrieval.context.map((c) => c.slug),
        contextGuideSlugs: retrieval.guides.map((g) => g.slug),
        hashedIp,
      });
      // Per-request audit line - spec section 7-C, hackathon-grade observability.
      console.log('[guide] turn', {
        ip: hashedIp,
        inputChars: query.length,
        resourceHits: retrieval.context.length,
        guideHits: retrieval.guides.length,
        model: MODEL_ID,
        promptTokens: event.totalUsage?.inputTokens,
        completionTokens: event.totalUsage?.outputTokens,
        latencyMs: Date.now() - startedAt,
      });
    },
  });

  // Attach sources via message metadata at the start event so they live on
  // the same assistant bubble as the streamed text. Data parts written before
  // the merged stream would otherwise create a separate empty message.
  return result.toUIMessageStreamResponse({
    messageMetadata: ({ part }) => {
      if (part.type === 'start') {
        return { sources: retrieval.context, guides: retrieval.guides };
      }
      return undefined;
    },
  });
}
