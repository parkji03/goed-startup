import { ConvexHttpClient } from 'convex/browser';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  streamText,
  type UIMessage,
} from 'ai';
import { api } from '@/convex/_generated/api';
import { enforceLimits, validateUserMessageText, HISTORY_TURN_CAP } from '@/lib/guide/abuse-guards';
import { logHallucinatedSlugs } from '@/lib/guide/output-validator';
import { buildSystemPrompt } from '@/lib/guide/system-prompt';
import type { GuideContextItem, GuideUIMessage } from '@/lib/guide/types';
import type { FounderProfileConvex } from '@/convex/founderProfile';

export const runtime = 'nodejs'; // Need node:crypto in abuse-guards
export const maxDuration = 30;

const MODEL_ID = 'deepseek/deepseek-v4-flash';
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

export async function POST(req: Request): Promise<Response> {
  const limit = await enforceLimits(req);
  if (!limit.ok) {
    return Response.json(limit.body, { status: limit.status });
  }
  const { hashedIp } = limit;

  let payload: { messages: UIMessage[]; founderProfile?: FounderProfileConvex };
  try {
    payload = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const { messages = [], founderProfile } = payload;
  const query = lastUserText(messages);

  const inputCheck = validateUserMessageText(query);
  if (!inputCheck.ok) {
    return Response.json(inputCheck.body, { status: inputCheck.status });
  }

  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) {
    return Response.json({ error: 'Server misconfigured: NEXT_PUBLIC_CONVEX_URL missing.' }, { status: 500 });
  }
  const convex = new ConvexHttpClient(convexUrl);
  let retrieval: { context: GuideContextItem[] };
  try {
    retrieval = await convex.action(api.guide.retrieve, { query, founderProfile });
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

  const profile: FounderProfileConvex = founderProfile ?? {
    industries: [],
    stages: [],
    goals: [],
    audiences: [],
    counties: [],
    specialStatuses: [],
    freeText: '',
  };

  const system = buildSystemPrompt({ context: retrieval.context, profile, locale: 'en' });

  // Cap history sent to the model. Preserve the first user message for opening context per spec §6.
  const recent = messages.slice(-HISTORY_TURN_CAP * 2);
  const firstUser = messages.find((m) => m.role === 'user');
  const cappedMessages =
    firstUser && messages.length > HISTORY_TURN_CAP * 2 && !recent.includes(firstUser)
      ? [firstUser, ...recent]
      : recent;
  const modelMessages = await convertToModelMessages(cappedMessages);

  const stream = createUIMessageStream<GuideUIMessage>({
    execute: ({ writer }) => {
      // Emit sources first so the client renders them as soon as the bubble appears.
      for (const c of retrieval.context) {
        writer.write({ type: 'data-source', id: c.slug, data: c });
      }

      const startedAt = Date.now();
      const result = streamText({
        model: openrouter.chat(MODEL_ID),
        system,
        messages: modelMessages,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        temperature: TEMPERATURE,
        abortSignal: req.signal,
        onFinish: (event) => {
          logHallucinatedSlugs({
            modelText: event.text,
            contextSlugs: retrieval.context.map((c) => c.slug),
            hashedIp,
          });
          // Per-request audit line - spec section 7-C, hackathon-grade observability.
          console.log('[guide] turn', {
            ip: hashedIp,
            inputChars: query.length,
            hits: retrieval.context.length,
            model: MODEL_ID,
            promptTokens: event.totalUsage?.inputTokens,
            completionTokens: event.totalUsage?.outputTokens,
            latencyMs: Date.now() - startedAt,
          });
        },
      });

      writer.merge(result.toUIMessageStream());
    },
  });

  return createUIMessageStreamResponse({ stream });
}
