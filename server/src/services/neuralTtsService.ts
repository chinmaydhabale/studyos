import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import https from 'https';
import { spawn } from 'child_process';

const CACHE_DIR = path.join(process.cwd(), 'data', 'tts_cache');

if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

export type PodcastSpeaker = 'Aarav' | 'Ananya' | 'Alex' | 'Sam';

export interface TTSRequest {
  text: string;
  voice?: string;
  speaker?: PodcastSpeaker;
  language?: 'hinglish' | 'hindi' | 'english';
  rate?: string;
  pitch?: string;
  ttsModel?: string;
}

export interface TTSResult {
  buffer: Buffer;
  mimeType: 'audio/wav' | 'audio/mpeg';
  engine: string;
}

export const NEURAL_VOICES = {
  gemini38: {
    Aarav: 'Puck',
    Ananya: 'Aoede'
  },
  notebooklm: {
    Aarav: 'Charon',
    Ananya: 'Kore'
  },
  hindi: {
    Aarav: 'hi-IN-MadhurNeural',
    Ananya: 'hi-IN-SwaraNeural'
  },
  hinglish: {
    Aarav: 'hi-IN-MadhurNeural',
    Ananya: 'hi-IN-SwaraNeural'
  },
  english: {
    Aarav: 'en-IN-PrabhatNeural',
    Ananya: 'en-IN-NeerjaNeural'
  },
  multilingual: {
    Aarav: 'hi-IN-MadhurNeural',
    Ananya: 'hi-IN-SwaraNeural'
  }
};

export const GEMINI_TTS_MODELS = [
  'gemini-3.8-flash-tts',
  'gemini-3.8-flash-lite-tts',
  'gemini-3.1-flash-tts-preview',
  'gemini-2.5-flash-preview-tts',
  'gemini-2.5-pro-preview-tts'
];

const GEMINI_VOICE_NAMES = new Set([
  'Puck',
  'Aoede',
  'Charon',
  'Kore',
  'Fenrir',
  'Leda',
  'Orus',
  'Zephyr'
]);

export const EPISODE_BATCH_TURN_SIZE = 14;
export const EPISODE_BATCH_MAX_CHARS = 3500;

export class NeuralTtsService {
  private pythonCmd: string;
  private keyIndex = 0;
  private quotaCooldownUntil = new Map<string, number>();

  constructor() {
    this.pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
  }

  private getOrderedGeminiTtsModels(preferredModel?: string): string[] {
    const clean = (preferredModel || '').trim();
    if (clean && GEMINI_TTS_MODELS.includes(clean)) {
      return [clean, ...GEMINI_TTS_MODELS.filter(m => m !== clean)];
    }
    return [...GEMINI_TTS_MODELS];
  }

  private isModelKeyCoolingDown(model: string, apiKey: string): boolean {
    const keyId = `${model}:${apiKey.slice(-6)}`;
    const until = this.quotaCooldownUntil.get(keyId);
    if (!until) return false;
    if (Date.now() > until) {
      this.quotaCooldownUntil.delete(keyId);
      return false;
    }
    return true;
  }

  private markModelKeyCooldown(model: string, apiKey: string, durationMs: number): void {
    const keyId = `${model}:${apiKey.slice(-6)}`;
    this.quotaCooldownUntil.set(keyId, Date.now() + durationMs);
  }

  private getGeminiApiKeys(): string[] {
    const raw = [
      process.env.GEMINI_API_KEYS || '',
      process.env.GEMINI_API_KEY || '',
      process.env.GOOGLE_API_KEY || ''
    ].join(',');
    return Array.from(
      new Set(
        raw
          .split(',')
          .map(k => k.trim())
          .filter(k => k.length > 0)
      )
    );
  }

  public isFemaleSpeaker(speaker?: string): boolean {
    const s = (speaker || '').toLowerCase();
    return s === 'ananya' || s === 'sam' || s === 'female';
  }

  public normalizeSpeaker(speaker?: string): 'Aarav' | 'Ananya' {
    return this.isFemaleSpeaker(speaker) ? 'Ananya' : 'Aarav';
  }

  private escapeXml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  /** Mark Devanagari and Latin spans so the Google fallback can switch language cues. */
  private hinglishSsml(text: string): string {
    const tokens = text.match(/[\u0900-\u097F]+|[A-Za-z0-9]+|[^A-Za-z0-9\u0900-\u097F]+/gu) || [text];
    const spans: Array<{ lang: 'hi-IN' | 'en-IN'; text: string }> = [];
    let currentLanguage: 'hi-IN' | 'en-IN' = 'hi-IN';

    for (const token of tokens) {
      if (/[\u0900-\u097F]/u.test(token)) currentLanguage = 'hi-IN';
      else if (/[A-Za-z0-9]/u.test(token)) currentLanguage = 'en-IN';
      const previous = spans[spans.length - 1];
      if (previous?.lang === currentLanguage) previous.text += token;
      else spans.push({ lang: currentLanguage, text: token });
    }

    return `<speak>${spans
      .map(span => `<lang xml:lang="${span.lang}">${this.escapeXml(span.text)}</lang>`)
      .join('')}</speak>`;
  }

  /**
   * Cleans dialogue text before passing to the TTS synthesizer:
   * Strips markdown symbols, asterisks, bullet dashes, code ticks, brackets, and LaTeX commands.
   */
  public cleanTextForSpeech(text: string): string {
    return text
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/#{1,6}\s+/g, '')
      .replace(/[-*+]\s+/g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/\\(?:frac|delta|eta|alpha|beta|theta|pi|partial)/gi, '')
      .replace(/[()[\]{}]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Wraps raw signed 16-bit PCM audio in a standard 44-byte RIFF WAV header.
   */
  public wrapPcmToWav(pcmBuffer: Buffer, sampleRate = 24000, numChannels = 1, bitsPerSample = 16): Buffer {
    const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
    const blockAlign = (numChannels * bitsPerSample) / 8;
    const dataSize = pcmBuffer.length;
    const header = Buffer.alloc(44);

    header.write('RIFF', 0);
    header.writeUInt32LE(36 + dataSize, 4);
    header.write('WAVE', 8);
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16); // Subchunk1Size (16 for PCM)
    header.writeUInt16LE(1, 20); // AudioFormat (1 = PCM)
    header.writeUInt16LE(numChannels, 22);
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(byteRate, 28);
    header.writeUInt16LE(blockAlign, 32);
    header.writeUInt16LE(bitsPerSample, 34);
    header.write('data', 36);
    header.writeUInt32LE(dataSize, 40);

    return Buffer.concat([header, pcmBuffer]);
  }

  /**
   * Extracts raw PCM payload and format metadata from a RIFF WAV buffer.
   */
  private extractPcmFromWav(wavBuffer: Buffer): {
    pcm: Buffer;
    sampleRate: number;
    numChannels: number;
    bitsPerSample: number;
  } | null {
    if (wavBuffer.length < 44 || wavBuffer.toString('ascii', 0, 4) !== 'RIFF') {
      return null;
    }
    const numChannels = wavBuffer.readUInt16LE(22) || 1;
    const sampleRate = wavBuffer.readUInt32LE(24) || 24000;
    const bitsPerSample = wavBuffer.readUInt16LE(34) || 16;

    // Locate 'data' chunk
    let offset = 12;
    while (offset + 8 <= wavBuffer.length) {
      const chunkId = wavBuffer.toString('ascii', offset, offset + 4);
      const chunkSize = wavBuffer.readUInt32LE(offset + 4);
      if (chunkId === 'data') {
        const start = offset + 8;
        const end = Math.min(wavBuffer.length, start + chunkSize);
        return {
          pcm: wavBuffer.subarray(start, end),
          sampleRate,
          numChannels,
          bitsPerSample
        };
      }
      offset += 8 + chunkSize + (chunkSize % 2);
    }

    return {
      pcm: wavBuffer.subarray(44),
      sampleRate,
      numChannels,
      bitsPerSample
    };
  }

  /**
   * Merges multiple WAV buffers into a single WAV file with a natural 280ms studio pause between turns.
   */
  public mergeWavBuffers(buffers: Buffer[], pauseMs = 280): Buffer {
    const valid = buffers.map(b => this.extractPcmFromWav(b)).filter((x): x is NonNullable<typeof x> => x !== null);
    if (valid.length === 0) {
      return Buffer.concat(buffers);
    }

    const { sampleRate, numChannels, bitsPerSample } = valid[0];
    const bytesPerSample = bitsPerSample / 8;
    const silenceSamples = Math.floor((sampleRate * pauseMs) / 1000);
    const silenceBuffer = Buffer.alloc(silenceSamples * numChannels * bytesPerSample, 0);

    const pcmParts: Buffer[] = [];
    valid.forEach((item, index) => {
      pcmParts.push(item.pcm);
      if (index < valid.length - 1) {
        pcmParts.push(silenceBuffer);
      }
    });

    return this.wrapPcmToWav(Buffer.concat(pcmParts), sampleRate, numChannels, bitsPerSample);
  }

  /**
   * Resolves the Gemini 3.8 prebuilt voice name for Aarav (Male) and Ananya (Female).
   */
  private resolveGeminiVoiceName(speaker?: string, requestedVoice?: string): string {
    const isFemale = this.isFemaleSpeaker(speaker);
    if (requestedVoice && GEMINI_VOICE_NAMES.has(requestedVoice)) {
      return requestedVoice;
    }
    if (requestedVoice === 'notebooklm') {
      return isFemale ? 'Kore' : 'Charon';
    }
    // Default Gemini 3.8 Studio voices: Puck (Male - Aarav) & Aoede (Female - Ananya)
    return isFemale ? 'Aoede' : 'Puck';
  }

  /**
   * Synthesizes expressive studio speech using Gemini 3.8 Flash TTS / Gemini 3.8 Flash-Lite TTS (with auto-fallback).
   */
  public async synthesizeGeminiTts(
    text: string,
    speaker?: PodcastSpeaker,
    language: 'hinglish' | 'hindi' | 'english' = 'hinglish',
    requestedVoice?: string,
    preferredModel?: string
  ): Promise<TTSResult | null> {
    const keys = this.getGeminiApiKeys();
    if (!keys.length) return null;

    const voiceName = this.resolveGeminiVoiceName(speaker, requestedVoice);
    const hostName = this.normalizeSpeaker(speaker);

    // Subtle vocal direction prefix so Gemini 3.8 TTS nails Indian Hinglish / English podcast warmth
    const stylePrefix =
      language === 'hinglish'
        ? `Speak in a warm, natural, energetic Indian Hinglish podcast host tone (${hostName}): `
        : language === 'hindi'
        ? `Speak in a warm, fluent, conversational Indian Hindi podcast host tone (${hostName}): `
        : `Speak in an engaging, clear, conversational podcast host tone (${hostName}): `;

    const payload = {
      contents: [
        {
          parts: [{ text: `${stylePrefix}${text}` }]
        }
      ],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName
            }
          }
        }
      }
    };

    const modelsToTry = this.getOrderedGeminiTtsModels(preferredModel);

    for (const model of modelsToTry) {
      for (let attempt = 0; attempt < keys.length; attempt++) {
        const activeIdx = (this.keyIndex + attempt) % keys.length;
        const apiKey = keys[activeIdx];
        if (this.isModelKeyCoolingDown(model, apiKey)) {
          continue;
        }
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 28000);

        try {
          const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: controller.signal
          });

          if (!res.ok) {
            if (res.status === 429 || res.status === 403) {
              this.markModelKeyCooldown(model, apiKey, 15 * 60 * 1000);
            } else if (res.status === 404) {
              this.markModelKeyCooldown(model, apiKey, 60 * 60 * 1000);
            }
            continue;
          }

          const data = (await res.json()) as any;
          const inlineData = data?.candidates?.[0]?.content?.parts?.[0]?.inlineData;
          if (!inlineData?.data) {
            continue;
          }

          const rawBuf = Buffer.from(inlineData.data, 'base64');
          if (rawBuf.length === 0) continue;

          this.keyIndex = (activeIdx + 1) % keys.length;
          const mime = String(inlineData.mimeType || 'audio/wav').toLowerCase();

          if (mime.includes('wav') || rawBuf.toString('ascii', 0, 4) === 'RIFF') {
            return {
              buffer: rawBuf,
              mimeType: 'audio/wav',
              engine: `${model}:${voiceName}`
            };
          }

          if (mime.includes('pcm') || mime.includes('l16')) {
            return {
              buffer: this.wrapPcmToWav(rawBuf, 24000, 1, 16),
              mimeType: 'audio/wav',
              engine: `${model}:${voiceName}`
            };
          }

          return {
            buffer: rawBuf,
            mimeType: 'audio/mpeg',
            engine: `${model}:${voiceName}`
          };
        } catch (err: any) {
          console.warn(`[tts] ${model} failed:`, err?.message || err);
        } finally {
          clearTimeout(timer);
        }
      }
    }

    return null;
  }

  /**
   * Synthesizes a multi-turn conversation between Aarav (Male) and Ananya (Female)
   * in a SINGLE Gemini TTS API call using native `multiSpeakerVoiceConfig`.
   * Reduces API quota consumption by 8x–50x while producing seamless studio banter.
   */
  public async synthesizeMultiSpeakerGeminiTts(
    turns: Array<{ speaker?: string; text: string }>,
    language: 'hinglish' | 'hindi' | 'english' = 'hinglish',
    requestedVoice?: string,
    preferredModel?: string
  ): Promise<TTSResult | null> {
    const validTurns = turns
      .map(t => ({
        speaker: this.normalizeSpeaker(t.speaker),
        text: this.cleanTextForSpeech(t.text || '')
      }))
      .filter(t => t.text.length > 0);

    if (validTurns.length === 0) return null;
    if (validTurns.length === 1) {
      return this.synthesizeGeminiTts(
        validTurns[0].text,
        validTurns[0].speaker,
        language,
        requestedVoice,
        preferredModel
      );
    }

    const keys = this.getGeminiApiKeys();
    if (!keys.length) return null;

    const aaravVoice = requestedVoice === 'notebooklm' ? 'Charon' : 'Puck';
    const ananyaVoice = requestedVoice === 'notebooklm' ? 'Kore' : 'Aoede';

    const styleHeader =
      language === 'hinglish'
        ? 'Read this warm, natural, energetic Indian Hinglish study podcast conversation between Aarav and Ananya:\n\n'
        : language === 'hindi'
        ? 'Read this warm, fluent, conversational Indian Hindi study podcast conversation between Aarav and Ananya:\n\n'
        : 'Read this engaging, clear, natural study podcast conversation between Aarav and Ananya:\n\n';

    const dialogueScript = validTurns.map(t => `${t.speaker}: ${t.text}`).join('\n\n');

    const payload = {
      contents: [
        {
          parts: [{ text: `${styleHeader}${dialogueScript}` }]
        }
      ],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          multiSpeakerVoiceConfig: {
            speakerVoiceConfigs: [
              {
                speaker: 'Aarav',
                voiceConfig: {
                  prebuiltVoiceConfig: {
                    voiceName: aaravVoice
                  }
                }
              },
              {
                speaker: 'Ananya',
                voiceConfig: {
                  prebuiltVoiceConfig: {
                    voiceName: ananyaVoice
                  }
                }
              }
            ]
          }
        }
      }
    };

    const modelsToTry = this.getOrderedGeminiTtsModels(preferredModel);

    for (const model of modelsToTry) {
      for (let attempt = 0; attempt < keys.length; attempt++) {
        const activeIdx = (this.keyIndex + attempt) % keys.length;
        const apiKey = keys[activeIdx];
        if (this.isModelKeyCoolingDown(model, apiKey)) {
          continue;
        }
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 45000);

        try {
          const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: controller.signal
          });

          if (!res.ok) {
            if (res.status === 429 || res.status === 403) {
              this.markModelKeyCooldown(model, apiKey, 15 * 60 * 1000);
            } else if (res.status === 404) {
              this.markModelKeyCooldown(model, apiKey, 60 * 60 * 1000);
            }
            continue;
          }

          const data = (await res.json()) as any;
          const inlineData = data?.candidates?.[0]?.content?.parts?.[0]?.inlineData;
          if (!inlineData?.data) {
            continue;
          }

          const rawBuf = Buffer.from(inlineData.data, 'base64');
          if (rawBuf.length === 0) continue;

          this.keyIndex = (activeIdx + 1) % keys.length;
          const mime = String(inlineData.mimeType || 'audio/wav').toLowerCase();

          if (mime.includes('wav') || rawBuf.toString('ascii', 0, 4) === 'RIFF') {
            return {
              buffer: rawBuf,
              mimeType: 'audio/wav',
              engine: `${model}:multi(${aaravVoice}+${ananyaVoice})`
            };
          }

          if (mime.includes('pcm') || mime.includes('l16')) {
            return {
              buffer: this.wrapPcmToWav(rawBuf, 24000, 1, 16),
              mimeType: 'audio/wav',
              engine: `${model}:multi(${aaravVoice}+${ananyaVoice})`
            };
          }

          return {
            buffer: rawBuf,
            mimeType: 'audio/mpeg',
            engine: `${model}:multi(${aaravVoice}+${ananyaVoice})`
          };
        } catch (err: any) {
          console.warn(`[tts-multi] ${model} failed:`, err?.message || err);
        } finally {
          clearTimeout(timer);
        }
      }
    }

    return null;
  }

  /**
   * Splits long text into chunks of <= 160 characters aligned on sentence and punctuation boundaries.
   * Google Text-to-Speech endpoints support up to 200 characters per query chunk.
   */
  private chunkText(text: string, maxLen = 160): string[] {
    const rawSentences = text.match(/[^.!?|।\n;]+[.!?|।\n;]+|[^.!?|।\n;]+$/g) || [text];
    const chunks: string[] = [];
    let cur = '';

    for (const s of rawSentences) {
      const trimmed = s.trim();
      if (!trimmed) continue;
      if ((cur + ' ' + trimmed).trim().length <= maxLen) {
        cur = (cur + ' ' + trimmed).trim();
      } else {
        if (cur) chunks.push(cur);
        if (trimmed.length > maxLen) {
          const words = trimmed.split(' ');
          let sub = '';
          for (const w of words) {
            if ((sub + ' ' + w).trim().length <= maxLen) {
              sub = (sub + ' ' + w).trim();
            } else {
              if (sub) chunks.push(sub);
              sub = w;
            }
          }
          if (sub) cur = sub;
          else cur = '';
        } else {
          cur = trimmed;
        }
      }
    }
    if (cur) chunks.push(cur);
    return chunks.length ? chunks : [text];
  }

  /**
   * Downloads a single audio segment from Google Text-to-Speech (translate_tts).
   */
  private fetchGoogleTtsChunk(text: string, lang: string, speed = 1.0): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const speedParam = speed < 0.9 ? '&ttsspeed=0.3' : '';
      const url = `https://translate.google.com/translate_tts?ie=UTF-8&tl=${encodeURIComponent(lang)}&client=tw-ob&q=${encodeURIComponent(text)}${speedParam}`;

      const req = https.get(
        url,
        {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            Referer: 'https://translate.google.com/'
          },
          timeout: 10000
        },
        res => {
          if (res.statusCode !== 200) {
            return reject(new Error(`Google TTS returned HTTP ${res.statusCode}`));
          }
          const parts: Buffer[] = [];
          res.on('data', chunk => parts.push(chunk));
          res.on('end', () => resolve(Buffer.concat(parts)));
        }
      );

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Google TTS request timed out'));
      });
      req.on('error', reject);
    });
  }

  /**
   * Attempts Google Cloud Text-to-Speech API if an API key is available and enabled.
   */
  private async synthesizeGoogleCloud(
    text: string,
    speaker?: PodcastSpeaker,
    language?: 'hinglish' | 'hindi' | 'english'
  ): Promise<Buffer | null> {
    const apiKey = process.env.GOOGLE_TTS_KEY || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey) return null;

    const isFemale = this.isFemaleSpeaker(speaker);
    const isHindi = language === 'hindi' || language === 'hinglish';
    const voiceName = isHindi
      ? (isFemale ? 'hi-IN-Neural2-A' : 'hi-IN-Neural2-B')
      : (isFemale ? 'en-IN-Neural2-A' : 'en-IN-Neural2-B');
    const langCode = isHindi ? 'hi-IN' : 'en-IN';

    const payload = JSON.stringify({
      input: language === 'hinglish' ? { ssml: this.hinglishSsml(text) } : { text },
      voice: { languageCode: langCode, name: voiceName },
      audioConfig: {
        audioEncoding: 'MP3',
        speakingRate: isFemale ? 1.0 : 1.03,
        pitch: isFemale ? 1.2 : -1.0
      }
    });

    return new Promise(resolve => {
      const req = https.request(
        {
          hostname: 'texttospeech.googleapis.com',
          path: `/v1/text:synthesize?key=${apiKey}`,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload)
          },
          timeout: 8000
        },
        res => {
          if (res.statusCode !== 200) {
            return resolve(null);
          }
          let data = '';
          res.on('data', d => (data += d));
          res.on('end', () => {
            try {
              const parsed = JSON.parse(data);
              if (parsed.audioContent) {
                return resolve(Buffer.from(parsed.audioContent, 'base64'));
              }
            } catch {}
            resolve(null);
          });
        }
      );

      req.on('timeout', () => {
        req.destroy();
        resolve(null);
      });
      req.on('error', () => resolve(null));
      req.write(payload);
      req.end();
    });
  }

  /**
   * Synthesizes audio using Google Text-to-Speech (Official Engine) with sentence chunking.
   */
  public async synthesizeGoogle(
    text: string,
    speaker?: PodcastSpeaker,
    language?: 'hinglish' | 'hindi' | 'english'
  ): Promise<Buffer> {
    const ttsLang = language === 'english' ? 'en-IN' : 'hi';
    const isFemale = this.isFemaleSpeaker(speaker);
    const speed = isFemale ? 0.98 : 1.0;
    const chunks = this.chunkText(text);
    const audioBuffers: Buffer[] = [];

    for (const chunk of chunks) {
      const buf = await this.fetchGoogleTtsChunk(chunk, ttsLang, speed);
      audioBuffers.push(buf);
    }

    return Buffer.concat(audioBuffers);
  }

  /**
   * Primary synthesis with metadata (buffer, mimeType, engine).
   * Priority:
   * 1. Local disk cache (.wav or .mp3) -> 0ms instant response.
   * 2. Gemini Flash TTS (Puck for Aarav [Male], Aoede for Ananya [Female]).
   * 3. Indian Edge-TTS neural voices (MadhurNeural & SwaraNeural / PrabhatNeural & NeerjaNeural).
   * 4. Google Cloud Neural2 TTS.
   * 5. Google translate_tts fallback.
   */
  public async synthesizeWithMeta(req: TTSRequest): Promise<TTSResult> {
    const cleanedText = this.cleanTextForSpeech(req.text || '');
    if (!cleanedText) {
      throw new Error('Text is empty after cleaning');
    }

    const speaker = this.normalizeSpeaker(req.speaker);
    const language = req.language || 'hinglish';
    const requestedVoice = req.voice || 'gemini-3.8';
    const preferredModel = req.ttsModel || 'gemini-3.8-flash-tts';

    const hash = crypto
      .createHash('sha256')
      .update(`gemini38_v6|${preferredModel}|${requestedVoice}|${speaker}|${language}|${req.rate || '+0%'}|${req.pitch || '+0Hz'}|${cleanedText}`)
      .digest('hex');

    const wavCacheFile = path.join(CACHE_DIR, `${hash}.wav`);
    const mp3CacheFile = path.join(CACHE_DIR, `${hash}.mp3`);

    if (fs.existsSync(wavCacheFile)) {
      try {
        const cached = await fs.promises.readFile(wavCacheFile);
        if (cached.length > 0) {
          return { buffer: cached, mimeType: 'audio/wav', engine: 'disk-cache-wav' };
        }
      } catch {}
    }

    const preferEdgeVoice =
      requestedVoice.endsWith('Neural') ||
      requestedVoice === 'indian' ||
      requestedVoice === 'edge-indian' ||
      preferredModel === 'edge-indian';

    if (preferEdgeVoice && fs.existsSync(mp3CacheFile)) {
      try {
        const cached = await fs.promises.readFile(mp3CacheFile);
        if (cached.length > 0) {
          return { buffer: cached, mimeType: 'audio/mpeg', engine: 'disk-cache-mp3' };
        }
      } catch {}
    }

    // 1. Priority #1: Gemini TTS (unless an explicit Edge Neural voice/model was requested)
    if (!preferEdgeVoice) {
      const geminiRes = await this.synthesizeGeminiTts(
        cleanedText,
        speaker,
        language,
        requestedVoice,
        preferredModel
      );
      if (geminiRes && geminiRes.buffer.length > 0) {
        const targetCache = geminiRes.mimeType === 'audio/wav' ? wavCacheFile : mp3CacheFile;
        fs.promises.writeFile(targetCache, geminiRes.buffer).catch(() => {});
        return geminiRes;
      }
    }

    // Resolve Indian Edge fallback voice for Aarav (Male) & Ananya (Female)
    let edgeVoice = requestedVoice.endsWith('Neural') ? requestedVoice : '';
    if (!edgeVoice) {
      if (language === 'english') {
        edgeVoice = speaker === 'Ananya' ? 'en-IN-NeerjaNeural' : 'en-IN-PrabhatNeural';
      } else {
        // Both Hindi and Hinglish sound most natural with Indian MadhurNeural & SwaraNeural
        edgeVoice = speaker === 'Ananya' ? 'hi-IN-SwaraNeural' : 'hi-IN-MadhurNeural';
      }
    }

    // 2. Priority #2: Indian Edge-TTS Neural Voice
    try {
      const edgeBuf = await this.synthesizeEdgeTts(cleanedText, edgeVoice, req.rate, req.pitch);
      if (edgeBuf && edgeBuf.length > 0) {
        if (preferEdgeVoice) {
          fs.promises.writeFile(mp3CacheFile, edgeBuf).catch(() => {});
        }
        return { buffer: edgeBuf, mimeType: 'audio/mpeg', engine: `edge-tts:${edgeVoice}` };
      }
    } catch (e: any) {
      console.warn(`[tts] edge-tts fallback notice:`, e?.message || e);
    }

    // 3. If Edge-TTS was preferred but failed, try Gemini TTS!
    if (preferEdgeVoice) {
      const geminiRes = await this.synthesizeGeminiTts(cleanedText, speaker, language, undefined, preferredModel);
      if (geminiRes && geminiRes.buffer.length > 0) {
        const targetCache = geminiRes.mimeType === 'audio/wav' ? wavCacheFile : mp3CacheFile;
        fs.promises.writeFile(targetCache, geminiRes.buffer).catch(() => {});
        return geminiRes;
      }
    }

    // 4. Priority #4: Google Cloud Neural2 TTS
    try {
      const cloudBuf = await this.synthesizeGoogleCloud(cleanedText, speaker, language);
      if (cloudBuf && cloudBuf.length > 0) {
        return { buffer: cloudBuf, mimeType: 'audio/mpeg', engine: 'google-cloud-neural2' };
      }
    } catch {}

    // 5. Priority #5: Google translate_tts fallback
    const googleBuf = await this.synthesizeGoogle(cleanedText, speaker, language);
    if (googleBuf && googleBuf.length > 0) {
      return { buffer: googleBuf, mimeType: 'audio/mpeg', engine: 'google-translate-tts' };
    }

    throw new Error('All TTS synthesis methods failed');
  }

  /**
   * Backward-compatible buffer-only synthesis method.
   */
  public async synthesize(req: TTSRequest): Promise<Buffer> {
    const res = await this.synthesizeWithMeta(req);
    return res.buffer;
  }

  /**
   * Synthesizes a batch of dialogue turns (up to 55 turns) in a single multi-speaker Gemini TTS call
   * with disk caching, falling back to turn-by-turn Indian neural synthesis if needed.
   */
  private async synthesizeMultiSpeakerBatch(
    batchTurns: Array<{ speaker?: string; text: string }>,
    language: 'hinglish' | 'hindi' | 'english' = 'hinglish',
    voiceStyle?: string,
    preferredModel?: string
  ): Promise<TTSResult> {
    const normalizedBatch = batchTurns
      .map(t => ({
        speaker: this.normalizeSpeaker(t.speaker),
        text: this.cleanTextForSpeech(t.text || '')
      }))
      .filter(t => t.text.length > 0);

    if (!normalizedBatch.length) {
      throw new Error('Empty batch turns');
    }

    const effectiveStyle = voiceStyle || 'gemini-3.8';
    const effectiveModel = preferredModel || 'gemini-3.8-flash-tts';
    const serialized = normalizedBatch.map(t => `${t.speaker}:${t.text}`).join('||');
    const batchHash = crypto
      .createHash('sha256')
      .update(`gemini38_multibatch_v2|${effectiveStyle}|${language}|${serialized}`)
      .digest('hex');

    const wavBatchCacheFile = path.join(CACHE_DIR, `batch_${batchHash}.wav`);
    const preferEdgeVoice =
      effectiveStyle === 'indian' ||
      effectiveStyle === 'edge-indian' ||
      effectiveStyle.endsWith('Neural') ||
      effectiveModel === 'edge-indian';

    if (!preferEdgeVoice && fs.existsSync(wavBatchCacheFile)) {
      try {
        const cached = await fs.promises.readFile(wavBatchCacheFile);
        if (cached.length > 0) {
          return { buffer: cached, mimeType: 'audio/wav', engine: 'disk-cache-multibatch-wav' };
        }
      } catch {}
    }

    if (!preferEdgeVoice) {
      const multiRes = await this.synthesizeMultiSpeakerGeminiTts(
        normalizedBatch,
        language,
        effectiveStyle,
        effectiveModel
      );
      if (multiRes && multiRes.buffer.length > 0) {
        if (multiRes.mimeType === 'audio/wav') {
          fs.promises.writeFile(wavBatchCacheFile, multiRes.buffer).catch(() => {});
        }
        return multiRes;
      }
    }

    // Fallback: synthesize turns individually and merge
    const buffers: Buffer[] = [];
    let allWav = true;

    for (const turn of normalizedBatch) {
      const res = await this.synthesizeWithMeta({
        text: turn.text,
        speaker: turn.speaker,
        language,
        ttsModel: effectiveModel,
        voice: preferEdgeVoice
          ? (language === 'english'
              ? (turn.speaker === 'Ananya' ? 'en-IN-NeerjaNeural' : 'en-IN-PrabhatNeural')
              : (turn.speaker === 'Ananya' ? 'hi-IN-SwaraNeural' : 'hi-IN-MadhurNeural'))
          : effectiveStyle
      });
      if (res.mimeType !== 'audio/wav') {
        allWav = false;
      }
      buffers.push(res.buffer);
    }

    if (allWav) {
      const mergedWav = this.mergeWavBuffers(buffers, 280);
      fs.promises.writeFile(wavBatchCacheFile, mergedWav).catch(() => {});
      return {
        buffer: mergedWav,
        mimeType: 'audio/wav',
        engine: 'gemini-batch-merger'
      };
    }

    return {
      buffer: Buffer.concat(buffers),
      mimeType: 'audio/mpeg',
      engine: 'mp3-batch-merger'
    };
  }

  /**
   * Synthesizes an entire multi-turn podcast episode (or batch of turns) between Aarav (Male) and Ananya (Female)
   * using Gemini's `multiSpeakerVoiceConfig` up to its full 16,384 audio token limit (~55 turns / ~11.5 mins in 1 API request!).
   */
  public async synthesizeFullEpisode(
    turns: Array<{ speaker?: string; text: string }>,
    language: 'hinglish' | 'hindi' | 'english' = 'hinglish',
    voiceStyle?: string,
    preferredModel?: string
  ): Promise<TTSResult> {
    const validTurns = (turns || []).filter(t => t && typeof t.text === 'string' && t.text.trim().length > 0);
    if (!validTurns.length) {
      throw new Error('No dialogue turns provided for episode synthesis');
    }

    const batches: Array<Array<{ speaker?: string; text: string }>> = [];
    let currentBatch: Array<{ speaker?: string; text: string }> = [];
    let currentChars = 0;

    for (const turn of validTurns) {
      const cleanedLen = this.cleanTextForSpeech(turn.text).length;
      if (
        currentBatch.length > 0 &&
        (currentBatch.length >= EPISODE_BATCH_TURN_SIZE || currentChars + cleanedLen > EPISODE_BATCH_MAX_CHARS)
      ) {
        batches.push(currentBatch);
        currentBatch = [];
        currentChars = 0;
      }
      currentBatch.push(turn);
      currentChars += cleanedLen;
    }
    if (currentBatch.length > 0) {
      batches.push(currentBatch);
    }

    if (batches.length === 1) {
      return this.synthesizeMultiSpeakerBatch(batches[0], language, voiceStyle, preferredModel);
    }

    const batchBuffers: Buffer[] = [];
    let allWav = true;

    for (const chunk of batches) {
      const batchRes = await this.synthesizeMultiSpeakerBatch(chunk, language, voiceStyle, preferredModel);
      if (batchRes.mimeType !== 'audio/wav') {
        allWav = false;
      }
      batchBuffers.push(batchRes.buffer);
    }

    if (allWav) {
      const mergedWav = this.mergeWavBuffers(batchBuffers, 320);
      return {
        buffer: mergedWav,
        mimeType: 'audio/wav',
        engine: 'gemini-multispeaker-episode'
      };
    }

    return {
      buffer: Buffer.concat(batchBuffers),
      mimeType: 'audio/mpeg',
      engine: 'mp3-episode-merger'
    };
  }

  /**
   * Fallback to edge-tts if installed and requested.
   */
  private async synthesizeEdgeTts(cleanedText: string, voice: string, rate = '+0%', pitch = '+0Hz'): Promise<Buffer> {
    const tempTextFile = path.join(CACHE_DIR, `temp_${Date.now()}_${Math.random().toString(36).substring(7)}.txt`);
    const tempOutFile = path.join(CACHE_DIR, `temp_out_${Date.now()}_${Math.random().toString(36).substring(7)}.mp3`);
    await fs.promises.writeFile(tempTextFile, cleanedText, 'utf8');

    try {
      await new Promise<void>((resolve, reject) => {
        const args = [
          '-m',
          'edge_tts',
          `--voice=${voice}`,
          `--rate=${rate}`,
          `--pitch=${pitch}`,
          '-f',
          tempTextFile,
          '--write-media',
          tempOutFile
        ];
        const proc = spawn(this.pythonCmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
        let stderr = '';
        proc.stderr.on('data', d => (stderr += d.toString()));
        proc.on('close', code => {
          if (code === 0 && fs.existsSync(tempOutFile)) resolve();
          else reject(new Error(`edge-tts exit ${code}: ${stderr}`));
        });
        proc.on('error', reject);
      });
      const data = await fs.promises.readFile(tempOutFile);
      return data;
    } finally {
      if (fs.existsSync(tempTextFile)) fs.promises.unlink(tempTextFile).catch(() => {});
      if (fs.existsSync(tempOutFile)) fs.promises.unlink(tempOutFile).catch(() => {});
    }
  }
}

export const neuralTts = new NeuralTtsService();
