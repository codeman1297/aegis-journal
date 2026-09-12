import { GoogleGenAI } from '@google/genai';
import { logSecurityEvent } from './logger.ts';
import { securityTelemetry } from './telemetry.ts';

// Model Fallback Ladder per Directive 6
export const GEMINI_MODEL_LADDER = [
  'gemini-3.6-flash',
  'gemini-3.1-flash-lite',
  'gemini-flash-latest',
  'gemini-3.7-flash',
];

export const GEMINI_EMBEDDING_MODEL = 'text-embedding-004';

let cachedClient: GoogleGenAI | null = null;

export function getGeminiApiKey(): { key: string; source: 'secret-manager' | 'env' | 'MISSING' } {
  if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim() !== '') {
    return {
      key: process.env.GEMINI_API_KEY,
      source: process.env.SECRET_MANAGER_ACTIVE ? 'secret-manager' : 'env',
    };
  }
  return { key: '', source: 'MISSING' };
}

export function getGeminiClient(): GoogleGenAI {
  if (cachedClient) {
    return cachedClient;
  }

  const { key } = getGeminiApiKey();
  if (!key) {
    throw new Error('GEMINI_API_KEY is not configured in server environment.');
  }

  cachedClient = new GoogleGenAI({ apiKey: key });
  return cachedClient;
}

/**
 * Untrusted Context Envelope (Directive 9 & Directive 2)
 * Strips closing tags and wraps external / user data into structured data envelopes
 */
export function wrapInUntrustedEnvelope(source: string, id: string, content: string): string {
  // Neutralize envelope-closing tokens to prevent sandbox escape
  const sanitized = content
    .replace(/<\/UNTRUSTED_CONTEXT>/gi, '&lt;/UNTRUSTED_CONTEXT&gt;')
    .replace(/<UNTRUSTED_CONTEXT/gi, '&lt;UNTRUSTED_CONTEXT');

  return `<UNTRUSTED_CONTEXT source="${source}" id="${id}">\n${sanitized}\n</UNTRUSTED_CONTEXT>`;
}

export interface InjectionRuleMatch {
  ruleId: string;
  category: 'instruction_override' | 'role_switch' | 'exfiltration' | 'delimiter_escape' | 'hidden_unicode' | 'encoded_payload';
  description: string;
  severity: number;
}

export interface InjectionScanResult {
  score: number; // 0 - 100
  flagged: boolean;
  matchedRules: InjectionRuleMatch[];
  matchedReasons: string[];
}

/**
 * Pre-flight Heuristic Scanner (Directive 9: Injection Firewall)
 * Evaluates inbound prompts across 5 attack vectors and assigns a 0-100 threat score.
 */
export function scanPromptInjection(text: string): InjectionScanResult {
  const matchedRules: InjectionRuleMatch[] = [];

  // Vector 1: Instruction Overrides
  const overrideRules = [
    {
      ruleId: 'RULE_INSTRUCTION_OVERRIDE_IGNORE',
      regex: /\b(ignore|disregard|forget|bypass|dismiss)\s+(all\s+)?(previous|prior|system|initial)\s+(instructions|directives|prompts|rules)\b/i,
      desc: 'Explicit instruction override ("ignore all previous instructions")',
      points: 40,
    },
    {
      ruleId: 'RULE_SYSTEM_OVERRIDE_PHRASE',
      regex: /\b(system\s+override|priority\s+override|admin\s+override|root\s+mode|sudo\s+mode)\b/i,
      desc: 'Administrative/system override keywords',
      points: 35,
    },
    {
      ruleId: 'RULE_NEW_INSTRUCTIONS_PREFIX',
      regex: /\b(from\s+now\s+on\s+you\s+must|starting\s+now\s+your\s+only\s+job\s+is\s+to)\b/i,
      desc: 'Mandatory behavioral override directive',
      points: 30,
    },
  ];

  for (const r of overrideRules) {
    if (r.regex.test(text)) {
      matchedRules.push({
        ruleId: r.ruleId,
        category: 'instruction_override',
        description: r.desc,
        severity: r.points,
      });
    }
  }

  // Vector 2: Role Switch / Jailbreak Persona
  const roleRules = [
    {
      ruleId: 'RULE_ROLE_SWITCH_DAN',
      regex: /\b(DAN\s+mode|jailbreak|unfiltered\s+mode|developer\s+mode\s+enabled)\b/i,
      desc: 'Known persona jailbreak exploit ("DAN mode / developer mode")',
      points: 45,
    },
    {
      ruleId: 'RULE_ROLE_SWITCH_PRETEND',
      regex: /\b(you\s+are\s+no\s+longer\s+an?\s+ai|pretend\s+you\s+have\s+no\s+ethics|act\s+as\s+an\s+unconstrained\s+ai)\b/i,
      desc: 'Role alteration attempting ethical or behavioral bypass',
      points: 35,
    },
  ];

  for (const r of roleRules) {
    if (r.regex.test(text)) {
      matchedRules.push({
        ruleId: r.ruleId,
        category: 'role_switch',
        description: r.desc,
        severity: r.points,
      });
    }
  }

  // Vector 3: System Exfiltration Verbs
  const exfilRules = [
    {
      ruleId: 'RULE_EXFIL_SYSTEM_PROMPT',
      regex: /\b(reveal|print|display|leak|show|repeat|dump)\s+(the\s+)?(system\s+prompt|initial\s+instructions|hidden\s+rules|system\s+directive)\b/i,
      desc: 'Attempt to exfiltrate system instructions or system prompt',
      points: 40,
    },
    {
      ruleId: 'RULE_EXFIL_CREDENTIALS',
      regex: /\b(reveal|show|print|leak|output)\s+(the\s+)?(api\s*key|firebase\s*secret|auth\s*token|environment\s*variables|secret_manager)\b/i,
      desc: 'Attempt to extract environment secrets, API keys, or tokens',
      points: 45,
    },
  ];

  for (const r of exfilRules) {
    if (r.regex.test(text)) {
      matchedRules.push({
        ruleId: r.ruleId,
        category: 'exfiltration',
        description: r.desc,
        severity: r.points,
      });
    }
  }

  // Vector 4: Delimiter Escape Attacks
  const delimiterRules = [
    {
      ruleId: 'RULE_DELIMITER_UNTRUSTED_CLOSING',
      regex: /<\/UNTRUSTED_CONTEXT/i,
      desc: 'Attempted breakout using closing envelope delimiter tag',
      points: 50,
    },
    {
      ruleId: 'RULE_DELIMITER_SYSTEM_TAG_FORGERY',
      regex: /<(SYSTEM|ASSISTANT|ADMIN|DEVELOPER|INST)>|<\/(SYSTEM|ASSISTANT|ADMIN|DEVELOPER|INST)>/i,
      desc: 'Synthetic system tag delimiter insertion',
      points: 40,
    },
  ];

  for (const r of delimiterRules) {
    if (r.regex.test(text)) {
      matchedRules.push({
        ruleId: r.ruleId,
        category: 'delimiter_escape',
        description: r.desc,
        severity: r.points,
      });
    }
  }

  // Vector 5: Hidden Unicode & Zero-Width Obfuscation
  // Zero-width spaces, zero-width joiners, soft hyphens, bidirectional override characters
  const hiddenUnicodeRegex = /[\u200B-\u200D\uFEFF\u00AD\u202A-\u202E\u2066-\u2069]/;
  if (hiddenUnicodeRegex.test(text)) {
    matchedRules.push({
      ruleId: 'RULE_HIDDEN_UNICODE_OBFUSCATION',
      category: 'hidden_unicode',
      description: 'Hidden zero-width characters or bidirectional Unicode overrides detected',
      severity: 35,
    });
  }

  // Vector 6: Base64 / Obfuscated Payload execution patterns
  const encodedRules = [
    {
      ruleId: 'RULE_ENCODED_DECODE_EXECUTE',
      regex: /\b(base64\s*(decode|string)|atob\(|eval\(|decodeURIComponent)\b/i,
      desc: 'Encoding execution instruction ("base64 decode / eval")',
      points: 30,
    },
  ];

  for (const r of encodedRules) {
    if (r.regex.test(text)) {
      matchedRules.push({
        ruleId: r.ruleId,
        category: 'encoded_payload',
        description: r.desc,
        severity: r.points,
      });
    }
  }

  // Calculate cumulative score capped at 100
  const totalSeverity = matchedRules.reduce((sum, r) => sum + r.severity, 0);
  const score = Math.min(totalSeverity, 100);

  return {
    score,
    flagged: score >= 30,
    matchedRules,
    matchedReasons: matchedRules.map((r) => `${r.ruleId}: ${r.description}`),
  };
}

/**
 * Generate semantic embedding vector using text-embedding-004
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const ai = getGeminiClient();
  try {
    const response = await ai.models.embedContent({
      model: GEMINI_EMBEDDING_MODEL,
      contents: text.slice(0, 4000),
    });

    const res = response as any;
    const values = res.embedding?.values || res.embeddings?.[0]?.values;
    if (!values || values.length === 0) {
      throw new Error('Empty embedding response from Gemini');
    }
    return values;
  } catch (err: any) {
    console.error('[Gemini Embeddings] Failed to embed text:', err.message);
    throw err;
  }
}

/**
 * Calculate Cosine Similarity between two numeric vectors
 */
export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length || vecA.length === 0) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Resilient Gemini call with fallback ladder and exponential backoff (Directive 6)
 */
export async function generateContentWithFallback(params: {
  contents: string;
  systemInstruction?: string;
  maxOutputTokens?: number;
  userId?: string;
}): Promise<{ text: string; modelUsed: string; fallbackOccurred: boolean }> {
  const ai = getGeminiClient();
  const ladder = GEMINI_MODEL_LADDER;
  let lastError: any = null;

  for (let i = 0; i < ladder.length; i++) {
    const model = ladder[i];
    try {
      const response = await ai.models.generateContent({
        model,
        contents: params.contents,
        config: {
          systemInstruction: params.systemInstruction,
          maxOutputTokens: params.maxOutputTokens || 1200,
          temperature: 0.7,
        },
      });

      const responseText = response.text || '';
      if (i > 0) {
        securityTelemetry.recordFallback(ladder[0], model, i, `Fallback to index ${i} succeeded`);
        logSecurityEvent('gemini_fallback_invoked', {
          uid: params.userId,
          model,
          reason: `Fallback to model index ${i} succeeded`,
        });
      } else {
        securityTelemetry.recordLadderReset();
      }

      return {
        text: responseText,
        modelUsed: model,
        fallbackOccurred: i > 0,
      };
    } catch (err: any) {
      lastError = err;
      const status = err.status || err.statusCode || (err.message?.includes('429') ? 429 : 500);

      const isRecoverable = [404, 429, 500, 503].includes(status) || err.message?.includes('RESOURCE_EXHAUSTED');
      console.warn(`[Gemini Fallback] Model ${model} failed with status ${status}:`, err.message);

      if (isRecoverable && i < ladder.length - 1) {
        const jitter = Math.random() * 100;
        const delay = Math.pow(2, i) * 200 + jitter;
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      } else {
        break;
      }
    }
  }

  throw lastError || new Error('All models in Gemini fallback ladder failed to respond.');
}
