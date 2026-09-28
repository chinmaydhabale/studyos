import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import https from 'https';
import { spawn } from 'child_process';

const CACHE_DIR = path.join(process.cwd(), 'data', 'tts_cache');

if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

export interface TTSRequest {
  text: string;
  voice?: string;
  speaker?: 'Alex' | 'Sam';
  language?: 'hinglish' | 'hindi' | 'english';
  rate?: string;
  pitch?: string;
}

export const NEURAL_VOICES = {
  hindi: {
    Alex: 'google-tts-hi',
    Sam: 'google-tts-hi'
  },
  hinglish: {
    Alex: 'google-tts-hi',
    Sam: 'google-tts-hi'
  },
  english: {
    Alex: 'google-tts-en-in',
    Sam: 'google-tts-en-in'
  }
};

export class NeuralTtsService {
  private pythonCmd: string;

  constructor() {
    this.pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
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
    speaker?: 'Alex' | 'Sam',
    language?: 'hinglish' | 'hindi' | 'english'
  ): Promise<Buffer | null> {
    const apiKey = process.env.GOOGLE_TTS_KEY || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey) return null;

    const isHindi = language === 'hindi' || language === 'hinglish';
    const voiceName = isHindi
      ? (speaker === 'Sam' ? 'hi-IN-Neural2-B' : 'hi-IN-Neural2-A')
      : (speaker === 'Sam' ? 'en-IN-Neural2-B' : 'en-IN-Neural2-A');
    const langCode = isHindi ? 'hi-IN' : 'en-IN';

    const payload = JSON.stringify({
      input: { text },
      voice: { languageCode: langCode, name: voiceName },
      audioConfig: {
        audioEncoding: 'MP3',
        speakingRate: speaker === 'Alex' ? 1.03 : 0.98,
        pitch: speaker === 'Alex' ? 1.5 : -1.5
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
    speaker?: 'Alex' | 'Sam',
    language?: 'hinglish' | 'hindi' | 'english'
  ): Promise<Buffer> {
    let ttsLang = 'hi';
    if (language === 'english') {
      ttsLang = 'en-IN';
    } else {
      ttsLang = 'hi';
    }

    const speed = speaker === 'Sam' ? 0.98 : 1.0;
    const chunks = this.chunkText(text);
    const audioBuffers: Buffer[] = [];

    for (const chunk of chunks) {
      const buf = await this.fetchGoogleTtsChunk(chunk, ttsLang, speed);
      audioBuffers.push(buf);
    }

    return Buffer.concat(audioBuffers);
  }

  /**
   * Main synthesis entry point.
   * Priority:
   * 1. Check local disk cache (instant response).
   * 2. Attempt Google Cloud Neural2 TTS if key is active.
   * 3. Google Text-to-Speech (native Google voice, 0-config, highly fluent).
   * 4. Edge-tts (fallback if available).
   */
  public async synthesize(req: TTSRequest): Promise<Buffer> {
    const cleanedText = this.cleanTextForSpeech(req.text || '');
    if (!cleanedText) {
      throw new Error('Text is empty after cleaning');
    }

    const speaker = req.speaker || 'Alex';
    const language = req.language || 'hinglish';
    const voiceRequested = req.voice || 'google-tts';

    // Unique cache hash for fast replay
    const hash = crypto
      .createHash('sha256')
      .update(`google_tts|${voiceRequested}|${speaker}|${language}|${cleanedText}`)
      .digest('hex');
    const cacheFile = path.join(CACHE_DIR, `${hash}.mp3`);

    if (fs.existsSync(cacheFile)) {
      try {
        const cached = await fs.promises.readFile(cacheFile);
        if (cached.length > 0) {
          return cached;
        }
      } catch {}
    }

    let buffer: Buffer | null = null;

    // 1. If voice explicitly asks for edge-tts
    if (voiceRequested.includes('Neural') && !voiceRequested.includes('google')) {
      try {
        buffer = await this.synthesizeEdgeTts(cleanedText, voiceRequested, req.rate, req.pitch);
      } catch (e) {
        console.warn('[tts] edge-tts fallback to Google TTS:', e);
      }
    }

    // 2. Try Google Cloud TTS if not yet synthesized
    if (!buffer) {
      try {
        buffer = await this.synthesizeGoogleCloud(cleanedText, speaker, language);
      } catch (err) {
        console.warn('[tts] Google Cloud TTS error, falling back to Google TTS:', err);
      }
    }

    // 3. Primary Google Text-to-Speech (Official Google Engine)
    if (!buffer) {
      buffer = await this.synthesizeGoogle(cleanedText, speaker, language);
    }

    // Write to cache
    if (buffer && buffer.length > 0) {
      fs.promises.writeFile(cacheFile, buffer).catch(() => {});
      return buffer;
    }

    throw new Error('All TTS synthesis methods failed');
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
