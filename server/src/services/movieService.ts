import fs from 'fs';
import path from 'path';
import { MovieRecord } from '../types.js';
import { storage } from './storageService.js';
import { Request, Response } from 'express';

const getDirname = (): string => {
  return typeof __dirname !== 'undefined' ? __dirname : process.cwd();
};

const baseDir = getDirname();
const candidates = [
  path.resolve(process.cwd(), 'uploads'),
  path.resolve(process.cwd(), 'server/uploads'),
  path.resolve(baseDir, '../../uploads'),
  path.resolve(baseDir, '../uploads')
];

let UPLOADS_ROOT = candidates[0];
for (const c of candidates) {
  if (fs.existsSync(c)) {
    UPLOADS_ROOT = c;
    break;
  }
}

const MOVIES_DIR = path.join(UPLOADS_ROOT, 'movies');
const TEMP_DIR = path.join(UPLOADS_ROOT, 'temp');

// Ensure directories exist
try {
  if (!fs.existsSync(UPLOADS_ROOT)) fs.mkdirSync(UPLOADS_ROOT, { recursive: true });
  if (!fs.existsSync(MOVIES_DIR)) fs.mkdirSync(MOVIES_DIR, { recursive: true });
  if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });
} catch (err: any) {
  console.warn('[movieService] Directory creation warning:', err.message);
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

interface UploadMeta {
  uploadId: string;
  roomId: string;
  title: string;
  originalName: string;
  fileSize: number;
  totalChunks: number;
  mimeType: string;
  uploaderId: string;
  uploaderName: string;
  createdAt: number;
}

export class MovieService {
  /**
   * Initializes a chunked upload session
   */
  public initUpload(meta: {
    uploadId: string;
    roomId: string;
    title: string;
    originalName: string;
    fileSize: number;
    totalChunks: number;
    mimeType: string;
    uploaderId: string;
    uploaderName: string;
  }): { uploadId: string } {
    const sessionDir = path.join(TEMP_DIR, meta.uploadId);
    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true });
    }

    const ext = path.extname(meta.originalName || '').toLowerCase();
    if (ext === '.mkv') {
      throw new Error('MKV format web browsers me support nahi hota. Watch party ke liye MP4 (H.264) ya WebM upload karein.');
    }

    const uploadMeta: UploadMeta = {
      ...meta,
      createdAt: Date.now()
    };

    fs.writeFileSync(path.join(sessionDir, 'meta.json'), JSON.stringify(uploadMeta, null, 2));
    return { uploadId: meta.uploadId };
  }

  /**
   * Saves an uploaded slice/chunk into the session temp directory
   */
  public saveChunk(uploadId: string, chunkIndex: number, chunkBuffer: Buffer): { chunkIndex: number } {
    const sessionDir = path.join(TEMP_DIR, uploadId);
    if (!fs.existsSync(sessionDir)) {
      throw new Error(`Upload session ${uploadId} not found or expired.`);
    }

    const chunkPath = path.join(sessionDir, `chunk_${chunkIndex}`);
    fs.writeFileSync(chunkPath, chunkBuffer);
    return { chunkIndex };
  }

  /**
   * Merges all uploaded chunks sequentially into the final movie file
   */
  public async completeUpload(uploadId: string): Promise<MovieRecord> {
    const sessionDir = path.join(TEMP_DIR, uploadId);
    const metaPath = path.join(sessionDir, 'meta.json');

    if (!fs.existsSync(metaPath)) {
      throw new Error(`Metadata for upload ${uploadId} not found.`);
    }

    const meta: UploadMeta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
    const { totalChunks, originalName, roomId, title, uploaderId, uploaderName, mimeType } = meta;

    // Verify all chunks exist
    for (let i = 0; i < totalChunks; i++) {
      const chunkPath = path.join(sessionDir, `chunk_${i}`);
      if (!fs.existsSync(chunkPath)) {
        throw new Error(`Missing chunk ${i} of ${totalChunks} for upload ${uploadId}.`);
      }
    }

    // Determine target file extension
    const ext = path.extname(originalName) || '.mp4';
    const movieId = `movie-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const finalFileName = `${movieId}${ext}`;
    const destinationPath = path.join(MOVIES_DIR, finalFileName);

    // Concatenate all chunks using sequential streams with backpressure
    const writeStream = fs.createWriteStream(destinationPath);
    for (let i = 0; i < totalChunks; i++) {
      const chunkPath = path.join(sessionDir, `chunk_${i}`);
      if (!fs.existsSync(chunkPath)) {
        throw new Error(`Missing chunk ${i} of ${totalChunks} for upload ${uploadId}.`);
      }
      const chunkRead = fs.createReadStream(chunkPath);
      await new Promise<void>((resolve, reject) => {
        chunkRead.pipe(writeStream, { end: false });
        chunkRead.on('end', () => resolve());
        chunkRead.on('error', reject);
      });
      // Delete temporary chunk immediately to keep disk & memory usage minimal
      try { fs.unlinkSync(chunkPath); } catch (e) {}
    }

    await new Promise<void>((resolve, reject) => {
      writeStream.end(() => resolve());
      writeStream.on('error', reject);
    });

    const stats = fs.statSync(destinationPath);

    // Clean up temporary session folder
    try {
      fs.rmSync(sessionDir, { recursive: true, force: true });
    } catch (cleanupErr: any) {
      console.warn('[movieService] Cleanup warning:', cleanupErr.message);
    }

    const movieRecord: MovieRecord = {
      id: movieId,
      roomId: (roomId || 'STUDY-ROOM-ALPHA').trim().toUpperCase(),
      title: title?.trim() || path.basename(originalName, ext) || 'Untitled Movie',
      filename: finalFileName,
      originalName,
      fileSize: stats.size,
      fileSizeFormatted: formatBytes(stats.size),
      mimeType: mimeType || 'video/mp4',
      durationSeconds: 0,
      durationFormatted: 'Movie / Video',
      uploadedBy: uploaderName || 'Student',
      uploaderId: uploaderId || 'user',
      createdAt: new Date().toISOString(),
      streamUrl: `/api/movies/stream/${movieId}`
    };

    await storage.saveMovie(movieRecord);
    return movieRecord;
  }

  /**
   * High performance, memory-safe HTTP 206 Partial Content Range streaming
   * Clamped to 4MB max window per response to keep Cloudflare tunnels and RAM rock solid.
   */
  public streamMovie(req: Request, res: Response, movie: MovieRecord): void {
    const filePath = path.join(MOVIES_DIR, movie.filename);

    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: 'Movie file not found on server disk.' });
      return;
    }

    const stat = fs.statSync(filePath);
    const fileSize = stat.size;

    // Block streaming MKV container as HTML5 <video> can't decode it natively
    if (movie.filename.toLowerCase().endsWith('.mkv')) {
      res.status(415).send('MKV format is not supported for direct browser streaming. Please upload an MP4 or WebM video.');
      return;
    }

    // Content type
    let contentType = movie.mimeType || 'video/mp4';
    if (movie.filename.endsWith('.webm')) contentType = 'video/webm';
    else if (movie.filename.endsWith('.mp4')) contentType = 'video/mp4';

    // Handle HEAD request for quick metadata probing
    if (req.method === 'HEAD') {
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': contentType,
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'public, max-age=3600'
      });
      res.end();
      return;
    }

    const range = req.headers.range;
    const MAX_CHUNK_WINDOW = 4 * 1024 * 1024; // 4MB safe window per range response

    let start = 0;
    let end = Math.min(MAX_CHUNK_WINDOW - 1, fileSize - 1);
    let isPartial = false;

    if (range) {
      isPartial = true;
      const parts = range.replace(/bytes=/, '').split('-');
      start = parseInt(parts[0], 10) || 0;
      const requestedEnd = parts[1] ? parseInt(parts[1], 10) : (start + MAX_CHUNK_WINDOW - 1);
      // Clamp end to both requested window and file boundaries
      end = Math.min(requestedEnd, start + MAX_CHUNK_WINDOW - 1, fileSize - 1);

      if (start >= fileSize || end >= fileSize || start > end) {
        res.status(416).set({
          'Content-Range': `bytes */${fileSize}`
        }).send('Requested range not satisfiable');
        return;
      }
    }

    const chunkSize = (end - start) + 1;
    const fileStream = fs.createReadStream(filePath, { start, end, highWaterMark: 64 * 1024 });

    const headers: Record<string, any> = {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunkSize,
      'Content-Type': contentType,
      'Cache-Control': 'no-cache'
    };

    res.writeHead(isPartial ? 206 : 200, headers);

    const cleanup = () => {
      if (!fileStream.destroyed) {
        fileStream.destroy();
      }
    };

    req.on('close', cleanup);
    res.on('close', cleanup);
    res.on('error', cleanup);
    fileStream.on('error', (err: any) => {
      cleanup();
      if (!res.headersSent) {
        res.status(500).end();
      }
    });

    fileStream.pipe(res);
  }

  /**
   * Delete movie file from disk
   */
  public deleteMovieFile(filename: string): void {
    const filePath = path.join(MOVIES_DIR, filename);
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (err: any) {
        console.warn('[movieService] Failed to unlink file:', err.message);
      }
    }
  }

  /**
   * Sweep stale temporary uploads older than 24 hours
   */
  public cleanStaleUploads(): void {
    try {
      if (!fs.existsSync(TEMP_DIR)) return;
      const sessions = fs.readdirSync(TEMP_DIR);
      const now = Date.now();
      const MAX_AGE = 24 * 60 * 60 * 1000;

      for (const session of sessions) {
        const sessionPath = path.join(TEMP_DIR, session);
        try {
          const stat = fs.statSync(sessionPath);
          if (stat.isDirectory() && now - stat.mtimeMs > MAX_AGE) {
            fs.rmSync(sessionPath, { recursive: true, force: true });
          }
        } catch (e) {}
      }
    } catch (e) {}
  }
}

export const movieService = new MovieService();
