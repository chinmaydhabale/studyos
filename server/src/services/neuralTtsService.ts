import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
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
    Alex: 'hi-IN-SwaraNeural',
    Sam: 'hi-IN-MadhurNeural'
  },
  hinglish: {
    Alex: 'hi-IN-SwaraNeural',
    Sam: 'hi-IN-MadhurNeural'
  },
  english: {
    Alex: 'en-IN-NeerjaExpressiveNeural',
    Sam: 'en-IN-PrabhatNeural'
  }
};

export class NeuralTtsService {
  private pythonCmd: string;

  constructor() {
    this.pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
  }

  /**
   * Cleans dialogue text before passing to the neural TTS synthesizer:
   * Strips markdown symbols, asterisks, bullet dashes, code ticks, and LaTeX commands.
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
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Resolves the best neural voice for a speaker and language
   */
  public resolveVoice(speaker?: 'Alex' | 'Sam', language?: 'hinglish' | 'hindi' | 'english', customVoice?: string): string {
    if (customVoice && customVoice.includes('Neural')) {
      return customVoice;
    }

    const spk = speaker === 'Sam' ? 'Sam' : 'Alex';
    const lang = language === 'hindi' ? 'hindi' : language === 'english' ? 'english' : 'hinglish';

    return NEURAL_VOICES[lang][spk] || 'hi-IN-SwaraNeural';
  }

  /**
   * Synthesizes audio using edge-tts and returns the MP3 buffer.
   * Caches results by hash of voice + cleaned text + rate.
   */
  public async synthesize(req: TTSRequest): Promise<Buffer> {
    const cleanedText = this.cleanTextForSpeech(req.text || '');
    if (!cleanedText) {
      throw new Error('Text is empty after cleaning');
    }

    const voice = req.voice || this.resolveVoice(req.speaker, req.language, req.voice);
    const rate = req.rate || '+0%';
    const pitch = req.pitch || (req.speaker === 'Alex' ? '+3Hz' : '-3Hz');

    // Create unique hash for caching
    const hash = crypto.createHash('sha256').update(`${voice}|${rate}|${pitch}|${cleanedText}`).digest('hex');
    const cacheFile = path.join(CACHE_DIR, `${hash}.mp3`);

    // Check if already in cache
    if (fs.existsSync(cacheFile)) {
      try {
        const cached = await fs.promises.readFile(cacheFile);
        if (cached.length > 0) {
          return cached;
        }
      } catch (err) {
        // Cache read failed, regenerate
      }
    }

    // Write text to a temporary file to avoid command-line argument length/escaping issues
    const tempTextFile = path.join(CACHE_DIR, `temp_${Date.now()}_${Math.random().toString(36).substring(7)}.txt`);
    await fs.promises.writeFile(tempTextFile, cleanedText, 'utf8');

    try {
      await new Promise<void>((resolve, reject) => {
        // Use python -m edge_tts
        const args = [
          '-m',
          'edge_tts',
          '--voice',
          voice,
          '--rate',
          rate,
          '--pitch',
          pitch,
          '-f',
          tempTextFile,
          '--write-media',
          cacheFile
        ];

        const proc = spawn(this.pythonCmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });

        let stderr = '';
        proc.stderr.on('data', (d) => {
          stderr += d.toString();
        });

        proc.on('close', (code) => {
          if (code === 0 && fs.existsSync(cacheFile)) {
            resolve();
          } else {
            reject(new Error(`edge-tts exited with code ${code}: ${stderr || 'Unknown error'}`));
          }
        });

        proc.on('error', (err) => {
          reject(err);
        });
      });

      const audioBuffer = await fs.promises.readFile(cacheFile);
      return audioBuffer;
    } finally {
      // Clean up temp text file
      if (fs.existsSync(tempTextFile)) {
        fs.promises.unlink(tempTextFile).catch(() => {});
      }
    }
  }
}

export const neuralTts = new NeuralTtsService();
