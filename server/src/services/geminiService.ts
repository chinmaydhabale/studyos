/**
 * Minimal Gemini REST client.
 *
 * Talks to the Generative Language API directly over the global `fetch`
 * (Node 18+) so the server needs no extra dependency. Every method degrades
 * gracefully: if no API key is configured, or the request fails / times out,
 * the caller receives `null` and is expected to fall back to local content.
 */
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

// Verified against https://ai.google.dev/gemini-api/docs/models
// Primary model is set to gemini-3.8-flash for high quality, fast inference.
export const DEFAULT_GEMINI_MODEL = 'gemini-3.8-flash';

export type GeminiModelTier = 'heavy' | 'lite' | 'balanced' | 'flashcards';

export const GEMINI_MODELS = {
  heavy: 'gemini-3.8-flash',
  flashcards: 'gemini-3.7-flash', // Used for large-batch, high-yield flashcard generation
  balanced: 'gemini-3.6-flash',
  lite: 'gemini-3.5-flash-lite'
};

const REQUEST_TIMEOUT_MS = 25000;

export interface GeminiJsonRequest {
  prompt: string;
  systemInstruction?: string;
  /** OpenAPI-subset schema; REST uses upper-case type names. */
  schema?: Record<string, unknown>;
  temperature?: number;
  maxOutputTokens?: number;
  tier?: GeminiModelTier;
  model?: string;
}

export interface GeminiTextRequest {
  prompt: string;
  systemInstruction?: string;
  temperature?: number;
  maxOutputTokens?: number;
  tier?: GeminiModelTier;
  model?: string;
}

export class GeminiService {
  private currentKeyIndex = 0;

  private getApiKeys(): string[] {
    const raw = process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
    return raw
      .split(',')
      .map(k => k.trim())
      .filter(k => k.length > 0);
  }

  public getModel(): string {
    return (process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL).trim();
  }

  public isConfigured(): boolean {
    return this.getApiKeys().length > 0;
  }

  /** Pulls the concatenated text out of the first candidate, skipping thought parts. */
  private extractText(data: any): string | null {
    const parts = data?.candidates?.[0]?.content?.parts;
    if (!Array.isArray(parts)) return null;
    const text = parts
      .filter((p: any) => p && typeof p.text === 'string' && p.thought !== true)
      .map((p: any) => p.text)
      .join('')
      .trim();
    return text || null;
  }

  private async request(
    payload: Record<string, unknown>,
    tier?: GeminiModelTier,
    customModel?: string
  ): Promise<string | null> {
    const keys = this.getApiKeys();
    if (!keys.length) return null;

    let modelsToTry: string[] = [];
    if (customModel) {
      modelsToTry = [customModel];
    } else if (tier === 'flashcards') {
      modelsToTry = ['gemini-3.7-flash', 'gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-flash-latest'];
    } else if (tier === 'lite') {
      modelsToTry = ['gemini-3.5-flash-lite', 'gemini-flash-lite-latest', 'gemini-3.5-flash', 'gemini-flash-latest'];
    } else if (tier === 'balanced') {
      modelsToTry = ['gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-flash-latest', 'gemini-3.8-flash', 'gemini-3.5-flash-lite'];
    } else {
      // Default or heavy tier: start with primary model (gemini-3.8-flash)
      const primaryModel = this.getModel();
      modelsToTry = [primaryModel];
      if (!modelsToTry.includes('gemini-3.8-flash')) modelsToTry.push('gemini-3.8-flash');
      if (!modelsToTry.includes('gemini-3.7-flash')) modelsToTry.push('gemini-3.7-flash');
      if (!modelsToTry.includes('gemini-3.6-flash')) modelsToTry.push('gemini-3.6-flash');
      if (!modelsToTry.includes('gemini-3.5-flash')) modelsToTry.push('gemini-3.5-flash');
      if (!modelsToTry.includes('gemini-flash-latest')) modelsToTry.push('gemini-flash-latest');
      if (!modelsToTry.includes('gemini-3.5-flash-lite')) modelsToTry.push('gemini-3.5-flash-lite');
    }

    const keyAttempts = Math.min(keys.length, 3);
    for (let k = 0; k < keyAttempts; k++) {
      const activeKey = keys[(this.currentKeyIndex + k) % keys.length];

      for (const model of modelsToTry) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

        try {
          const res = await fetch(`${GEMINI_API_BASE}/${model}:generateContent`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              // Header auth keeps the key out of URLs and logs.
              'x-goog-api-key': activeKey
            },
            body: JSON.stringify(payload),
            signal: controller.signal
          });

          if (!res.ok) {
            const body = await res.text().catch(() => '');
            console.warn(`[gemini] ${model} (key ...${activeKey.slice(-6)}) returned ${res.status} ${res.statusText}: ${body.slice(0, 300)}`);
            if (res.status === 503 || res.status === 429 || res.status === 403) {
              // Rotate key and retry
              this.currentKeyIndex = (this.currentKeyIndex + 1) % keys.length;
              continue; // Fallback to alternative model or next key
            }
            return null;
          }

          const data = await res.json();
          const text = this.extractText(data);
          if (!text) {
            const reason = data?.promptFeedback?.blockReason || data?.candidates?.[0]?.finishReason || 'empty response';
            console.warn(`[gemini] ${model} no usable content (${reason})`);
            continue;
          }
          return text;
        } catch (err: any) {
          const reason = err?.name === 'AbortError' ? `timed out after ${REQUEST_TIMEOUT_MS}ms` : err?.message || err;
          console.warn(`[gemini] ${model} request failed:`, reason);
        } finally {
          clearTimeout(timer);
        }
      }
    }
    return null;
  }

  private buildPayload(req: GeminiJsonRequest | GeminiTextRequest, json: boolean): Record<string, unknown> {
    const payload: Record<string, unknown> = {
      contents: [{ role: 'user', parts: [{ text: req.prompt }] }]
    };
    if (req.systemInstruction) {
      payload.systemInstruction = { parts: [{ text: req.systemInstruction }] };
    }
    const generationConfig: Record<string, unknown> = {
      temperature: req.temperature ?? 0.7,
      maxOutputTokens: req.maxOutputTokens ?? 2048
    };
    if (json) {
      generationConfig.responseMimeType = 'application/json';
      const schema = (req as GeminiJsonRequest).schema;
      if (schema) generationConfig.responseSchema = schema;
    }
    payload.generationConfig = generationConfig;
    return payload;
  }

  /** Free-form text generation. Returns null when unavailable. */
  public async generateText(req: GeminiTextRequest): Promise<string | null> {
    return this.request(this.buildPayload(req, false), req.tier, req.model);
  }

  /**
   * Structured generation. Returns the parsed object, or null when the model is
   * unavailable or produced unparseable output.
   */
  public async generateJson<T>(req: GeminiJsonRequest): Promise<T | null> {
    const raw = await this.request(this.buildPayload(req, true), req.tier, req.model);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      // Models occasionally wrap JSON in a code fence despite responseMimeType.
      const match = raw.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
      if (!match) {
        console.warn('[gemini] response was not JSON');
        return null;
      }
      try {
        return JSON.parse(match[0]) as T;
      } catch {
        console.warn('[gemini] response was not parseable JSON');
        return null;
      }
    }
  }
}

export const gemini = new GeminiService();
