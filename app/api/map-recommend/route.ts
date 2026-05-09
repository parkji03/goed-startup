import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { streamText } from 'ai';
import { MAX_INPUT_CHARS } from '@/lib/guide/abuse-guards';
import {
  buildMapRecommendSystemPrompt,
  type MapPersona,
  type MapQuizAnswers,
  type MapRecommendCandidate,
} from '@/lib/map-recommend/prompt';

// Body cap on the JSON payload. Candidates are clamped to MAX_CANDIDATES
// downstream, but we want to fail fast on any pathological body before
// parsing.
const MAX_BODY_BYTES = 256 * 1024;

export const runtime = 'nodejs';
export const maxDuration = 30;

const MODEL_ID = 'deepseek/deepseek-v4-flash';
const MAX_OUTPUT_TOKENS = 900;
const TEMPERATURE = 0.4;
// Cap how many candidates we send to the model. The visible map can hold a
// few thousand investor pins; sending all of them blows the prompt budget.
// 60 keeps the prompt under ~10k tokens while still giving the LLM enough
// surface area to make a meaningful recommendation.
const MAX_CANDIDATES = 60;

type RequestBody = {
  persona: MapPersona;
  answers: MapQuizAnswers;
  candidates: MapRecommendCandidate[];
};

function isPersona(v: unknown): v is MapPersona {
  return v === 'founder' || v === 'investor';
}

function clampCandidates(input: unknown): MapRecommendCandidate[] {
  if (!Array.isArray(input)) return [];
  const out: MapRecommendCandidate[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== 'object') continue;
    const c = raw as Record<string, unknown>;
    const id = typeof c._id === 'string' ? c._id : null;
    const name = typeof c.name === 'string' ? c.name : null;
    const kind = c.kind === 'company' || c.kind === 'investor' ? c.kind : null;
    if (!id || !name || !kind) continue;
    out.push({
      _id: id,
      name,
      kind,
      sector: typeof c.sector === 'string' ? c.sector : undefined,
      stage: typeof c.stage === 'string' ? c.stage : undefined,
      city: typeof c.city === 'string' ? c.city : undefined,
      country: typeof c.country === 'string' ? c.country : undefined,
      employeeCount: typeof c.employeeCount === 'string' ? c.employeeCount : undefined,
      hiring: typeof c.hiring === 'boolean' ? c.hiring : undefined,
      description: typeof c.description === 'string' ? c.description : undefined,
      investorType: typeof c.investorType === 'string' ? c.investorType : undefined,
      investmentThesis:
        typeof c.investmentThesis === 'string' ? c.investmentThesis : undefined,
      stagesOfInvestment: Array.isArray(c.stagesOfInvestment)
        ? c.stagesOfInvestment.filter((s): s is string => typeof s === 'string')
        : undefined,
      countriesOfInvestment: Array.isArray(c.countriesOfInvestment)
        ? c.countriesOfInvestment.filter((s): s is string => typeof s === 'string')
        : undefined,
      firstChequeMin: typeof c.firstChequeMin === 'number' ? c.firstChequeMin : undefined,
      firstChequeMax: typeof c.firstChequeMax === 'number' ? c.firstChequeMax : undefined,
    });
    if (out.length >= MAX_CANDIDATES) break;
  }
  return out;
}

function clampAnswers(input: unknown): MapQuizAnswers {
  if (!input || typeof input !== 'object') {
    return { selections: {}, freeText: '' };
  }
  const raw = input as Record<string, unknown>;
  const selections: Record<string, string[]> = {};
  if (raw.selections && typeof raw.selections === 'object') {
    for (const [key, val] of Object.entries(raw.selections as Record<string, unknown>)) {
      if (!Array.isArray(val)) continue;
      const items = val.filter((s): s is string => typeof s === 'string').slice(0, 20);
      if (items.length) selections[key] = items;
    }
  }
  const freeText =
    typeof raw.freeText === 'string'
      ? raw.freeText.slice(0, MAX_INPUT_CHARS)
      : '';
  return { selections, freeText };
}

export async function POST(req: Request): Promise<Response> {
  // Lightweight body-size guard. We deliberately don't reuse
  // `enforceLimits` from /api/chat — that path requires IP_HASH_SALT for
  // per-IP rate limiting, and the map-recommend flow is naturally gated
  // by a multi-step wizard interaction (no easy way to script-flood).
  const contentLength = Number(req.headers.get('content-length') ?? '0');
  if (contentLength > MAX_BODY_BYTES) {
    return Response.json({ error: 'Request too large.' }, { status: 413 });
  }

  let payload: RequestBody;
  try {
    const parsed = (await req.json()) as Partial<RequestBody>;
    if (!isPersona(parsed.persona)) {
      return Response.json({ error: 'Invalid persona.' }, { status: 400 });
    }
    payload = {
      persona: parsed.persona,
      answers: clampAnswers(parsed.answers),
      candidates: clampCandidates(parsed.candidates),
    };
  } catch {
    return Response.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  if (payload.candidates.length === 0) {
    return Response.json(
      { error: 'No candidates on the map to recommend from. Adjust your filters and try again.' },
      { status: 400 },
    );
  }

  const orKey = process.env.OPENROUTER_API_KEY;
  if (!orKey) {
    return Response.json(
      { error: 'Server misconfigured: OPENROUTER_API_KEY missing.' },
      { status: 500 },
    );
  }
  const openrouter = createOpenRouter({
    apiKey: orKey,
    headers: {
      'HTTP-Referer': process.env.OPENROUTER_SITE_URL ?? 'https://startup.utah.gov',
      'X-Title': 'Startup Utah Map Recommender',
    },
  });

  const system = buildMapRecommendSystemPrompt({
    persona: payload.persona,
    answers: payload.answers,
    candidates: payload.candidates,
  });

  // Synthesized user turn — the questionnaire didn't actually type anything,
  // so we phrase the request as if the user asked for matches. This nudges
  // the model into a recommendation register and gives a clean message
  // history for any future follow-ups.
  const userText =
    payload.persona === 'founder'
      ? 'Pick the best investors for me from the map.'
      : 'Pick the best startups for me to consider from the map.';

  const startedAt = Date.now();
  const result = streamText({
    model: openrouter.chat(MODEL_ID),
    system,
    messages: [{ role: 'user', content: userText }],
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    temperature: TEMPERATURE,
    abortSignal: req.signal,
    // DeepSeek-V4-Flash emits its turn as `reasoning` parts by default.
    // Our chat panel only renders `text` parts (we don't want a wall of
    // chain-of-thought in the bubble), so without this the model returns
    // completion tokens that all get dropped client-side. Disable
    // reasoning entirely so the model emits the ranked list as plain
    // text — simpler + faster, at some cost to ranking quality.
    providerOptions: {
      openrouter: {
        reasoning: { effort: 'none', exclude: true },
      },
    },
    onFinish: (event) => {
      console.log('[map-recommend] turn', {
        persona: payload.persona,
        candidates: payload.candidates.length,
        model: MODEL_ID,
        promptTokens: event.totalUsage?.inputTokens,
        completionTokens: event.totalUsage?.outputTokens,
        latencyMs: Date.now() - startedAt,
      });
    },
  });

  return result.toUIMessageStreamResponse();
}
