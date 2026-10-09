/**
 * Minimal Gemini REST client.
 *
 * Talks to the Generative Language API directly over the global `fetch`
 * (Node 18+) so the server needs no extra dependency. Every method degrades
 * gracefully: if no API key is configured, or the request fails / times out,
 * the caller receives `null` and is expected to fall back to local content.
 */
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

export const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash-lite';

export type GeminiModelTier = 'heavy' | 'lite' | 'balanced' | 'flashcards';

export const GEMINI_MODELS = {
  heavy: 'gemini-3.8-flash',
  flashcards: 'gemini-3.5-flash-lite',
  balanced: 'gemini-3.5-flash',
  lite: 'gemini-3.5-flash-lite'
};

const REQUEST_TIMEOUT_MS = 60000;

export interface GeminiHistoryItem {
  role: 'user' | 'assistant' | 'model';
  text: string;
}

export interface GeminiJsonRequest {
  prompt: string;
  systemInstruction?: string;
  /** OpenAPI-subset schema; REST uses upper-case type names. */
  schema?: Record<string, unknown>;
  temperature?: number;
  maxOutputTokens?: number;
  tier?: GeminiModelTier;
  model?: string;
  conversationHistory?: GeminiHistoryItem[];
}

export interface GeminiTextRequest {
  prompt: string;
  systemInstruction?: string;
  temperature?: number;
  maxOutputTokens?: number;
  tier?: GeminiModelTier;
  model?: string;
  conversationHistory?: GeminiHistoryItem[];
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
  ): Promise<{ text: string; modelUsed: string } | null> {
    const keys = this.getApiKeys();
    if (!keys.length) return null;

    let modelsToTry: string[] = [];
    if (customModel) {
      modelsToTry = [
        customModel,
        'gemini-3.5-flash-lite',
        'gemini-3.5-flash',
        'gemini-3.8-flash',
        'gemini-3.7-flash',
        'gemini-3.6-flash',
        'gemini-2.5-flash',
        'gemini-flash-latest',
        'gemini-2.0-flash',
        'gemini-2.0-flash-lite',
        'gemini-1.5-flash',
        'gemini-2.5-pro',
        'gemini-1.5-pro'
      ];
    } else if (tier === 'lite') {
      modelsToTry = [
        'gemini-3.5-flash-lite',
        'gemini-flash-lite-latest',
        'gemini-2.0-flash-lite',
        'gemini-2.5-flash',
        'gemini-flash-latest',
        'gemini-1.5-flash'
      ];
    } else {
      // Default, heavy or balanced
      const primary = this.getModel();
      modelsToTry = [
        primary,
        'gemini-3.5-flash-lite',
        'gemini-3.5-flash',
        'gemini-3.8-flash',
        'gemini-2.5-flash',
        'gemini-flash-latest',
        'gemini-2.0-flash',
        'gemini-1.5-flash',
        'gemini-2.5-pro'
      ];
    }
    modelsToTry = Array.from(new Set(modelsToTry.filter(Boolean)));

    const keyAttempts = Math.min(keys.length, 3);
    for (let k = 0; k < keyAttempts; k++) {
      const activeKeyIndex = (this.currentKeyIndex + k) % keys.length;
      const activeKey = keys[activeKeyIndex];

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
            // On rate limits or forbidden quota, advance currentKeyIndex and break to next key
            if (res.status === 429 || res.status === 403) {
              this.currentKeyIndex = (activeKeyIndex + 1) % keys.length;
              break;
            }
            // On 503 or 404 or server error, continue to try the next model
            if (res.status === 503 || res.status === 404 || res.status >= 500) {
              continue;
            }
            continue;
          }

          const data = await res.json();
          const text = this.extractText(data);
          if (!text) {
            const reason = data?.promptFeedback?.blockReason || data?.candidates?.[0]?.finishReason || 'empty response';
            console.warn(`[gemini] ${model} no usable content (${reason})`);
            continue;
          }

          // Advance round-robin index on success to load-balance across keys
          this.currentKeyIndex = (activeKeyIndex + 1) % keys.length;
          return { text, modelUsed: model };
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
    const contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [];

    if (req.conversationHistory && req.conversationHistory.length > 0) {
      for (const msg of req.conversationHistory) {
        if (!msg.text || !msg.text.trim()) continue;
        const role = (msg.role === 'assistant' || msg.role === 'model') ? 'model' : 'user';
        if (contents.length > 0 && contents[contents.length - 1].role === role) {
          contents[contents.length - 1].parts[0].text += `\n\n${msg.text.trim()}`;
        } else {
          contents.push({
            role,
            parts: [{ text: msg.text.trim() }]
          });
        }
      }
    }

    if (contents.length > 0 && contents[contents.length - 1].role === 'user') {
      contents[contents.length - 1].parts[0].text += `\n\n${req.prompt}`;
    } else {
      contents.push({
        role: 'user',
        parts: [{ text: req.prompt }]
      });
    }

    // Gemini rejects multi-turn requests that don't begin with a user turn, so drop any
    // leading model turns (e.g. when the first saved exchange was a page-summary with no
    // preceding user question). The prompt above guarantees a trailing user turn remains.
    while (contents.length > 1 && contents[0].role === 'model') {
      contents.shift();
    }

    const payload: Record<string, unknown> = { contents };
    if (req.systemInstruction) {
      payload.systemInstruction = { parts: [{ text: req.systemInstruction }] };
    }
    const generationConfig: Record<string, unknown> = {
      temperature: req.temperature ?? 0.7,
      maxOutputTokens: req.maxOutputTokens ?? 8192
    };
    if (json) {
      generationConfig.responseMimeType = 'application/json';
      const schema = (req as GeminiJsonRequest).schema;
      if (schema) generationConfig.responseSchema = schema;
    }
    payload.generationConfig = generationConfig;
    return payload;
  }

  /** Free-form text generation with metadata (model used). */
  public async generateTextWithMeta(req: GeminiTextRequest): Promise<{ text: string; modelUsed: string } | null> {
    return this.request(this.buildPayload(req, false), req.tier, req.model);
  }

  /** Free-form text generation. Returns null when unavailable. */
  public async generateText(req: GeminiTextRequest): Promise<string | null> {
    const res = await this.generateTextWithMeta(req);
    return res ? res.text : null;
  }

  /**
   * Cleans and repairs common LLM JSON output flaws:
   * - Strips markdown code fences (```json ... ```)
   * - Extracts JSON object or array bounds
   * - Escapes unescaped LaTeX backslashes (\sqrt, \frac, \alpha, \times, \pm, \cdot, etc.)
   * - Escapes literal raw newlines and tabs inside JSON string literals
   */
  private cleanAndParseJson<T>(raw: string): T | null {
    let str = (raw || '').trim();
    if (str.startsWith('```')) {
      str = str.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
    }
    const first = str.indexOf('{');
    const last = str.lastIndexOf('}');
    if (first !== -1 && last > first) {
      str = str.slice(first, last + 1);
    }

    // Direct attempt
    try {
      return JSON.parse(str) as T;
    } catch {}

    // Character-by-character repair for string literals:
    let inString = false;
    let out = '';

    for (let i = 0; i < str.length; i++) {
      const ch = str[i];

      if (!inString) {
        if (ch === '"') inString = true;
        out += ch;
        continue;
      }

      // Inside string literal
      if (ch === '"') {
        inString = false;
        out += ch;
        continue;
      }

      if (ch === '\\') {
        const next = str[i + 1] || '';
        // Standard JSON escape sequences that must be preserved: \", \\, \/
        if (next === '"' || next === '\\' || next === '/') {
          out += ch + next;
          i++;
        } else if (next === 'u' && /^[0-9a-fA-F]{4}$/.test(str.slice(i + 2, i + 6))) {
          // Unicode escape \uXXXX
          out += str.slice(i, i + 6);
          i += 5;
        } else if (next === 'n') {
          // Check if followed by letters (e.g. \neq, \nu, \nabla) -> LaTeX command!
          const following = str.slice(i + 2, i + 5);
          if (/^[a-zA-Z]/.test(following)) {
            out += '\\\\';
          } else {
            // Real JSON newline escape (\n)
            out += '\\n';
            i++;
          }
        } else {
          // All LaTeX backslashes (\frac, \times, \text, \right, \left, \sqrt, \alpha, \beta, \cdot, \pm, etc.)
          // MUST be escaped as \\ so JSON.parse keeps them as valid LaTeX instead of converting to control characters!
          out += '\\\\';
        }
        continue;
      }

      // Replace literal unescaped newlines/tabs inside string literal
      if (ch === '\n') {
        out += '\\n';
      } else if (ch === '\r') {
        out += '\\r';
      } else if (ch === '\t') {
        out += '\\t';
      } else {
        out += ch;
      }
    }

    try {
      return JSON.parse(out) as T;
    } catch {}

    // Regex fallback
    try {
      const sanitized = str.replace(/\\(?!["\\/bfnrt]|u[0-9a-fA-F]{4})/g, '\\\\');
      return JSON.parse(sanitized) as T;
    } catch {}

    return null;
  }

  /**
   * Structured generation with metadata. Returns parsed object and modelUsed.
   */
  public async generateJsonWithMeta<T>(req: GeminiJsonRequest): Promise<{ data: T; modelUsed: string } | null> {
    const rawResult = await this.request(this.buildPayload(req, true), req.tier, req.model);
    if (!rawResult || !rawResult.text) return null;
    const raw = rawResult.text;

    // 1. Direct parse attempt
    try {
      return { data: JSON.parse(raw) as T, modelUsed: rawResult.modelUsed };
    } catch {}

    // 2. Clean and repair common LLM JSON defects
    const cleaned = this.cleanAndParseJson<T>(raw);
    if (cleaned !== null) {
      return { data: cleaned, modelUsed: rawResult.modelUsed };
    }

    console.warn('[gemini] response was not parseable JSON even after sanitization. Raw snippet:', raw.slice(0, 200));
    return null;
  }

  /**
   * Structured generation. Returns the parsed object, or null when the model is
   * unavailable or produced unparseable output.
   */
  public async generateJson<T>(req: GeminiJsonRequest): Promise<T | null> {
    const res = await this.generateJsonWithMeta<T>(req);
    return res ? res.data : null;
  }
}

export const gemini = new GeminiService();
