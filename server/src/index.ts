import 'dotenv/config';
import express from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import dns from 'dns';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';
import { connectDatabase } from './db.js';
import { storage, localDateKey } from './services/storageService.js';
import { aiCoach } from './services/aiCoachService.js';
import { telegramService } from './services/telegramService.js';
import { setupVideoSyncSocket } from './sockets/videoSyncSocket.js';
import { setupVoiceAndChatSocket } from './sockets/voiceAndChatSocket.js';
import { setupStudyRoomSocket, getExpectedVoicePassword } from './sockets/studyRoomSocket.js';
import { generateSamplePdf } from './services/samplePdfGenerator.js';
import { neuralTts } from './services/neuralTtsService.js';
import { extractArticleFromHtml } from './services/articleExtractorService.js';
import { Flashcard } from './types.js';

dotenv.config();

const app = express();
const server = http.createServer(app);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 } // 50 MB limit
});

const PORT = process.env.PORT || 4000;

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Destructive / configuration endpoints must not be reachable anonymously.
// Set ADMIN_TOKEN in the environment and send it as the x-admin-token header.
const requireAdmin = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const adminToken = process.env.ADMIN_TOKEN;
  if (!adminToken) {
    return res.status(503).json({
      error: 'Admin access is disabled: set the ADMIN_TOKEN environment variable on the server to enable this endpoint.'
    });
  }
  if (req.header('x-admin-token') !== adminToken) {
    return res.status(401).json({ error: 'Unauthorized: a valid x-admin-token header is required.' });
  }
  next();
};

// Initialize Socket.IO
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

io.on('connection', (socket) => {
  setupVideoSyncSocket(io, socket);
  setupVoiceAndChatSocket(io, socket);
  setupStudyRoomSocket(io, socket);
});

// Health Check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// Wipe Database & Reset to Pure Zero (admin only)
app.post('/api/reset', requireAdmin, async (req, res) => {
  await storage.wipeAndResetAllCollections();
  res.json({ success: true, message: 'All data wiped. StudyOS is now at pure zero.' });
});

// User Profile
app.get('/api/user', (req, res) => {
  const userId = req.query.userId as string;
  if (!userId) {
    return res.status(400).json({ error: 'User ID required' });
  }
  const user = storage.getUser(userId);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  res.json(user);
});

app.post('/api/user/profile', (req, res) => {
  const { id, name, targetExam, avatar, college, city } = req.body;
  if (!id || !name) return res.status(400).json({ error: 'User ID and Name are required' });
  const updated = storage.createOrUpdateUser({
    id,
    name,
    targetExam: targetExam || 'RRB PO & IBPS PO',
    avatar,
    college,
    city
  });
  res.json(updated);
});

// --- PERMANENT AUTHENTICATION (Username & Password) ---
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password, name, targetExam, city, avatar } = req.body || {};
    if (!username || typeof username !== 'string' || username.trim().length < 3) {
      return res.status(400).json({ error: 'Username is required and must be at least 3 characters.' });
    }
    if (!password || typeof password !== 'string' || password.length < 4) {
      return res.status(400).json({ error: 'Password is required and must be at least 4 characters.' });
    }
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Full name is required.' });
    }
    const result = await storage.registerUser({ username, password, name, targetExam, city, avatar });
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Registration failed' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || typeof username !== 'string' || !username.trim() || !password || typeof password !== 'string') {
      return res.status(400).json({ error: 'Please enter both username and password.' });
    }
    const result = await storage.authenticateUser(username, password);
    res.json(result);
  } catch (err: any) {
    res.status(401).json({ error: err.message || 'Login failed' });
  }
});

app.get('/api/auth/me', (req, res) => {
  const userId = req.query.userId as string;
  if (!userId) return res.status(400).json({ error: 'User ID required' });
  const user = storage.getUser(userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(user);
});

// --- STUDY GROUP ROOMS (Unique Group IDs) ---
app.post('/api/rooms/create', async (req, res) => {
  try {
    const { roomId, name, description, targetExam, creatorId, creatorName, voicePassword } = req.body;
    if (!name || !creatorId) {
      return res.status(400).json({ error: 'Group name and creator ID are required' });
    }
    const group = await storage.createStudyGroup({
      roomId,
      name,
      description,
      targetExam,
      creatorId,
      creatorName,
      voicePassword
    });
    res.json({ success: true, group });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to create study group' });
  }
});

app.post('/api/rooms/join', async (req, res) => {
  try {
    const { roomId, userId, userName } = req.body;
    if (!roomId || !roomId.trim()) {
      return res.status(400).json({ error: 'Group ID is required to join' });
    }
    const cleanId = roomId.trim().toUpperCase();
    let group = await storage.getStudyGroup(cleanId);
    if (!group) {
      // Auto-provision room so any custom or shared Group ID can be joined immediately
      group = await storage.createStudyGroup({
        roomId: cleanId,
        name: cleanId.replace(/[-_]/g, ' '),
        description: `Study group ${cleanId}`,
        targetExam: 'RRB PO & IBPS PO',
        creatorId: userId || 'member',
        creatorName: userName || 'Study Partner'
      });
    }
    res.json({ success: true, group });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Error joining study group' });
  }
});

app.get('/api/rooms', async (req, res) => {
  try {
    const groups = await storage.getStudyGroups();
    res.json({ success: true, groups });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to list study groups' });
  }
});

app.get('/api/rooms/:roomId', async (req, res) => {
  const cleanId = req.params.roomId.trim().toUpperCase();
  let group = await storage.getStudyGroup(cleanId);
  if (!group) {
    group = await storage.createStudyGroup({
      roomId: cleanId,
      name: cleanId.replace(/[-_]/g, ' '),
      description: `Study group ${cleanId}`,
      creatorId: 'system',
      creatorName: 'StudyOS'
    });
  }
  res.json(group);
});

// --- TELEGRAM CLOUD STORAGE (Documents & Notes) ---
app.get('/api/telegram/status', (req, res) => {
  res.json(telegramService.getStatus());
});

app.post('/api/telegram/detect', async (req, res) => {
  const { roomId } = req.body || {};
  const result = await telegramService.detectChannelFromUpdates(roomId);
  res.json(result);
});

app.post('/api/telegram/config', async (req, res) => {
  const adminToken = process.env.ADMIN_TOKEN;
  if (adminToken && req.header('x-admin-token') !== adminToken) {
    return res.status(401).json({ error: 'Unauthorized: valid x-admin-token required' });
  }
  const { channelId, channelTitle } = req.body;
  if (!channelId) return res.status(400).json({ error: 'Channel ID required' });
  const result = await telegramService.setChannelConfig(channelId, channelTitle);
  res.json({ success: true, config: result });
});

app.post('/api/telegram/sync', async (req, res) => {
  const { roomId } = req.body || {};
  const result = await telegramService.syncDocumentsFromUpdates(roomId);
  res.json(result);
});

app.post('/api/telegram/upload', upload.single('file'), async (req, res) => {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'No file provided' });
    const { roomId, title, subject, uploaderId, uploaderName, description } = req.body;
    if (!roomId || !title) {
      return res.status(400).json({ error: 'Room ID and Title are required' });
    }

    const cleanRoomId = roomId.trim().toUpperCase();
    const group = await storage.getStudyGroup(cleanRoomId);
    if (!group && cleanRoomId !== 'SAMPLE-LIBRARY') {
      return res.status(404).json({
        error: `Study group "${cleanRoomId}" does not exist. Please create or join a valid group first.`
      });
    }

    // Whitelist safe document & study asset MIME types and extensions
    const allowedMimeTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'text/plain',
      'image/jpeg',
      'image/png',
      'image/webp'
    ];
    const isAllowedMime = allowedMimeTypes.includes((file.mimetype || '').toLowerCase());
    const isAllowedExt = /\.(pdf|docx?|xlsx?|pptx?|txt|jpe?g|png|webp)$/i.test(file.originalname);
    if (!isAllowedMime && !isAllowedExt) {
      return res.status(400).json({
        error: 'Invalid file type. Only PDFs, Word documents, spreadsheets, presentations, and study notes/images are permitted.'
      });
    }

    const caption = `📚 ${title}\n🏷️ Subject: ${subject || 'Quantitative Aptitude'}\n👤 Student: ${uploaderName || 'Anonymous'}\n🏛️ Group ID: ${cleanRoomId}`;
    const telegramRes = await telegramService.uploadDocument(
      file.buffer,
      file.originalname,
      file.mimetype,
      caption
    );

    const docRecord = await storage.saveStudyDocument({
      roomId: roomId.toUpperCase(),
      title,
      subject: subject || 'Quantitative Aptitude',
      fileName: telegramRes.fileName,
      fileSize: telegramRes.fileSize,
      mimeType: telegramRes.mimeType,
      telegramFileId: telegramRes.telegramFileId,
      telegramMessageId: telegramRes.telegramMessageId,
      uploaderId: uploaderId || 'student',
      uploaderName: uploaderName || 'Student',
      description: description || ''
    });

    // Notify room members in real-time via Socket.IO
    io.to(roomId.toUpperCase()).emit('vault:document-added', docRecord);

    res.json({ success: true, document: docRecord });
  } catch (err: any) {
    console.error('Telegram upload error:', err.message);
    res.status(500).json({ error: err.message || 'Failed to upload document to Telegram storage' });
  }
});

app.get('/api/telegram/documents', async (req, res) => {
  const roomId = req.query.roomId as string;
  const subject = req.query.subject as string;
  const docs = await storage.getStudyDocuments(roomId, subject);
  res.json(docs);
});

app.get('/api/telegram/download/:fileId', async (req, res) => {
  try {
    const fileId = req.params.fileId;
    const docId = req.query.docId as string;
    if (docId) {
      await storage.incrementDocumentDownload(docId);
    }

    // Handle pre-seeded sample documents
    if (fileId.startsWith('sample-')) {
      const title = fileId.includes('math')
        ? 'RRB PO 2026: Speed Math & Simplification Tricks'
        : fileId.includes('reasoning')
        ? 'IBPS PO 2026: Reasoning Puzzles & Syllogism'
        : 'Banking Awareness & Current Affairs Capsule';
      const subject = fileId.includes('math')
        ? 'Quantitative Aptitude'
        : fileId.includes('reasoning')
        ? 'Reasoning Ability'
        : 'Current Affairs';
      const pdfBuffer = generateSamplePdf(title, subject);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(title)}.pdf"`);
      res.setHeader('Content-Length', pdfBuffer.length);
      return res.send(pdfBuffer);
    }

    const url = await telegramService.getFileDownloadUrl(fileId);
    res.redirect(url);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Could not retrieve file from Telegram storage' });
  }
});

// Inline PDF Stream for In-App PDF Reader
app.get('/api/telegram/stream/:fileId', async (req, res) => {
  try {
    const fileId = req.params.fileId;

    // Handle pre-seeded sample documents
    if (fileId.startsWith('sample-')) {
      const title = fileId.includes('math')
        ? 'RRB PO 2026: Speed Math & Simplification Tricks'
        : fileId.includes('reasoning')
        ? 'IBPS PO 2026: Reasoning Puzzles & Syllogism'
        : 'Banking Awareness & Current Affairs Capsule';
      const subject = fileId.includes('math')
        ? 'Quantitative Aptitude'
        : fileId.includes('reasoning')
        ? 'Reasoning Ability'
        : 'Current Affairs';
      const pdfBuffer = generateSamplePdf(title, subject);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'inline');
      res.setHeader('Content-Length', pdfBuffer.length);
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Access-Control-Allow-Origin', '*');
      return res.send(pdfBuffer);
    }

    const url = await telegramService.getFileDownloadUrl(fileId);
    const response = await fetch(url);
    if (!response.ok) {
      const fallbackPdf = generateSamplePdf('StudyOS Revision Notes', 'Exam Preparation');
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'inline');
      res.setHeader('Content-Length', fallbackPdf.length);
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Access-Control-Allow-Origin', '*');
      return res.send(fallbackPdf);
    }
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Access-Control-Allow-Origin', '*');
    const contentLength = response.headers.get('content-length');
    if (contentLength) {
      res.setHeader('Content-Length', contentLength);
    }

    if (response.body) {
      const { Readable } = await import('stream');
      // @ts-ignore
      const nodeStream = Readable.fromWeb(response.body);
      return nodeStream.pipe(res);
    }
    const arrayBuffer = await response.arrayBuffer();
    res.send(Buffer.from(arrayBuffer));
  } catch (err: any) {
    const fallbackPdf = generateSamplePdf('StudyOS Revision Notes', 'Exam Preparation');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('Content-Length', fallbackPdf.length);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.send(fallbackPdf);
  }
});

// HTML escape helper to prevent reflected XSS in dynamically injected templates
function escapeHtml(str: string): string {
  if (!str || typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// --- SSRF & Private IP Protection for Web Proxy ---
function isPrivateIp(ip: string): boolean {
  if (ip === '127.0.0.1' || ip === '::1' || ip === '0.0.0.0' || ip === '::') return true;
  if (ip.startsWith('10.') || ip.startsWith('192.168.') || ip.startsWith('169.254.') || ip.startsWith('127.')) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(ip)) return true;
  if (/^(fc00|fe80)/i.test(ip)) return true;
  return false;
}

async function isSafeUrlForProxy(urlString: string): Promise<{ safe: boolean; reason?: string; parsed?: URL }> {
  try {
    const parsed = new URL(urlString);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { safe: false, reason: 'Only HTTP and HTTPS protocols are allowed' };
    }
    const host = parsed.hostname.toLowerCase();
    if (host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host === '0.0.0.0') {
      return { safe: false, reason: 'Internal/loopback requests are strictly forbidden' };
    }
    if (isPrivateIp(host)) {
      return { safe: false, reason: 'Private/internal IP addresses are strictly forbidden' };
    }

    try {
      const lookupResult = await dns.promises.lookup(host);
      if (lookupResult && isPrivateIp(lookupResult.address)) {
        return { safe: false, reason: 'Destination domain resolves to a private or internal IP' };
      }
    } catch {
      return { safe: false, reason: 'Unable to resolve destination domain' };
    }

    return { safe: true, parsed };
  } catch (e: any) {
    return { safe: false, reason: 'Malformed URL' };
  }
}

// --- SECURE WEB EMBED PROXY & CLEAN READER (Study Notes & Portals) ---
app.get('/api/proxy/web', async (req, res) => {
  const targetUrl = req.query.url as string;
  if (!targetUrl || typeof targetUrl !== 'string') {
    return res.status(400).send('Invalid or missing URL parameter.');
  }

  const urlCheck = await isSafeUrlForProxy(targetUrl);
  if (!urlCheck.safe || !urlCheck.parsed) {
    return res.status(403).send(`Blocked: ${urlCheck.reason || 'Unsafe destination'}`);
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);

    const response = await fetch(targetUrl, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Language': 'en-US,en;q=0.9,hi;q=0.8',
        'Sec-Ch-Ua': '"Chromium";v="130", "Google Chrome";v="130", "Not?A_Brand";v="99"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1',
        'Referer': urlCheck.parsed.origin
      }
    });

    clearTimeout(timeout);

    const finalUrl = response.url || targetUrl;
    const rawContentType = response.headers.get('content-type') || 'text/html';

    // Remove anti-framing headers
    res.removeHeader('X-Frame-Options');
    res.removeHeader('Content-Security-Policy');
    res.removeHeader('Content-Security-Policy-Report-Only');
    res.removeHeader('Cross-Origin-Embedder-Policy');
    res.removeHeader('Cross-Origin-Opener-Policy');
    res.removeHeader('Cross-Origin-Resource-Policy');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', rawContentType);

    const safeUrl = escapeHtml(finalUrl);

    if (rawContentType.includes('text/html')) {
      const contentLength = Number(response.headers.get('content-length') || 0);
      if (contentLength > 15 * 1024 * 1024) {
        return res.status(413).send('Content too large to proxy (exceeds 15MB limit).');
      }

      let html = await response.text();

      // Remove meta tags that enforce frame protection or restrictive CSP
      html = html.replace(/<meta[^>]*http-equiv=["']?(?:X-Frame-Options|Content-Security-Policy)["']?[^>]*>/gi, '');

      // Neutralize common frame-busting scripts
      html = html.replace(/top\.location(\.href)?\s*=/gi, '// top.location =');
      html = html.replace(/window\.top(\.location)?/gi, 'window.self');
      html = html.replace(/parent\.location/gi, 'window.self.location');

      // Inject base tag, frame protection shim, and smooth link-navigation interceptor
      const injectedHead = `
        <base href="${safeUrl}">
        <script>
          (function() {
            try {
              Object.defineProperty(window, 'top', { get: function() { return window.self; }, set: function() {} });
              Object.defineProperty(window, 'parent', { get: function() { return window.self; }, set: function() {} });
              Object.defineProperty(window, 'frameElement', { get: function() { return null; } });
            } catch(e) {}
            // Smooth in-app navigation: notify parent container
            document.addEventListener('click', function(e) {
              var el = e.target;
              while (el && el.tagName !== 'A') { el = el.parentElement; }
              if (el && el.href && !el.href.startsWith('javascript:') && !el.href.startsWith('#')) {
                try {
                  window.parent.postMessage({ type: 'STUDYOS_NAVIGATE', url: el.href }, '*');
                } catch(err) {}
              }
            }, true);
          })();
        </script>
      `;

      if (/<head(\s[^>]*)?>/i.test(html)) {
        html = html.replace(/<head(\s[^>]*)?>/i, (match) => `${match}${injectedHead}`);
      } else {
        html = injectedHead + html;
      }
      return res.send(html);
    } else {
      if (response.body) {
        const { Readable } = await import('stream');
        // @ts-ignore
        const nodeStream = Readable.fromWeb(response.body);
        return nodeStream.pipe(res);
      }
      const arrayBuffer = await response.arrayBuffer();
      return res.send(Buffer.from(arrayBuffer));
    }
  } catch (err: any) {
    const safeUrl = escapeHtml(targetUrl);
    return res.status(502).send(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>StudyOS Notes Notice</title>
          <style>
            body { font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 32px 16px; background: #090d16; color: #f8fafc; text-align: center; margin: 0; }
            .card { max-width: 580px; margin: 40px auto; background: #111827; padding: 32px 28px; border-radius: 20px; border: 1px solid #1f2937; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.6); }
            .badge { display: inline-flex; align-items: center; gap: 6px; background: rgba(245, 158, 11, 0.15); color: #fbbf24; padding: 6px 14px; border-radius: 9999px; font-size: 12px; font-weight: 700; margin-bottom: 16px; border: 1px solid rgba(245, 158, 11, 0.3); }
            h2 { margin: 0 0 12px 0; color: #f1f5f9; font-size: 20px; font-weight: 700; }
            p { color: #94a3b8; font-size: 13px; line-height: 1.6; margin: 0 0 16px 0; }
            .url { background: #030712; padding: 10px 14px; border-radius: 12px; font-family: monospace; font-size: 12px; word-break: break-all; color: #38bdf8; margin: 16px 0; border: 1px solid #1f2937; text-align: left; }
            .actions { display: flex; flex-direction: column; gap: 10px; margin-top: 24px; }
            .btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; color: white; text-decoration: none; padding: 12px 20px; border-radius: 12px; font-weight: 600; font-size: 13px; transition: all 0.2s; cursor: pointer; border: none; }
            .btn-primary { background: linear-gradient(135deg, #4f46e5, #06b6d4); box-shadow: 0 4px 14px rgba(79, 70, 229, 0.4); }
            .btn-primary:hover { opacity: 0.95; transform: translateY(-1px); }
            .btn-secondary { background: #1f2937; color: #e2e8f0; border: 1px solid #374151; }
            .btn-secondary:hover { background: #374151; }
            .tips { margin-top: 20px; font-size: 11px; color: #64748b; }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="badge">⚠️ Third-Party Portal Protection</div>
            <h2>Cannot Embed Directly in Frame</h2>
            <p>This study portal has strict anti-bot shields (e.g. Cloudflare Turnstile / Akamai) or restricts embedded iframes.</p>
            <div class="url">🔗 ${safeUrl}</div>
            <div class="actions">
              <a href="${safeUrl}" target="_blank" rel="noopener noreferrer" class="btn btn-primary">
                Open in Companion Tab ↗
              </a>
              <button onclick="window.parent.postMessage({ type: 'STUDYOS_SWITCH_READER', url: '${safeUrl}' }, '*')" class="btn btn-secondary">
                📖 Switch to Clean Reader Mode
              </button>
              <button onclick="window.location.reload()" class="btn btn-secondary">
                🔄 Retry Loading Website
              </button>
            </div>
            <div class="tips">
              💡 Tip: The Companion Tab opens right beside StudyOS so your Live Room Chat, Vocab notes, and AI doubt solver stay active!
            </div>
          </div>
        </body>
      </html>
    `);
  }
});

// Clean Reader Mode Endpoint: Extracts Article Content, Byline, and Text
app.get('/api/proxy/article', async (req, res) => {
  const targetUrl = req.query.url as string;
  if (!targetUrl || typeof targetUrl !== 'string') {
    return res.status(400).json({ success: false, error: 'Invalid or missing URL parameter.' });
  }

  const urlCheck = await isSafeUrlForProxy(targetUrl);
  if (!urlCheck.safe || !urlCheck.parsed) {
    return res.status(403).json({ success: false, error: `Blocked: ${urlCheck.reason || 'Unsafe destination'}` });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);

    const response = await fetch(targetUrl, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Language': 'en-US,en;q=0.9,hi;q=0.8',
        'Sec-Ch-Ua': '"Chromium";v="130", "Google Chrome";v="130", "Not?A_Brand";v="99"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1',
        'Referer': urlCheck.parsed.origin
      }
    });

    clearTimeout(timeout);

    const finalUrl = response.url || targetUrl;
    const rawContentType = response.headers.get('content-type') || 'text/html';

    if (!rawContentType.includes('text/html')) {
      return res.json({
        success: false,
        title: 'Non-HTML Resource',
        source: urlCheck.parsed.hostname,
        url: finalUrl,
        contentHtml: `<p>This resource is not a webpage (${rawContentType}). You can open it directly in a new tab.</p>`,
        textContent: '',
        wordCount: 0,
        readingTimeMinutes: 1
      });
    }

    const html = await response.text();
    const article = extractArticleFromHtml(html, finalUrl);
    return res.json(article);
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err.message || 'Failed to extract article content',
      url: targetUrl
    });
  }
});

// --- MOCK TEST RECORDS ---
app.get('/api/mock/records', (req, res) => {
  const userId = req.query.userId as string | undefined;
  res.json(storage.getMockTestRecords(userId));
});

app.post('/api/mock/record', (req, res) => {
  const { userId, userName, platform, testTitle, score, totalMarks, accuracy, percentile, attemptedQuestions, totalQuestions, timeTakenMinutes } = req.body;
  if (!userId || typeof userId !== 'string' || !platform || typeof platform !== 'string') {
    return res.status(400).json({ error: 'Valid userId and platform are required' });
  }

  // Verify user exists to prevent orphaned/injected XP minting
  const existingUser = storage.getUser(userId);
  if (!existingUser) {
    return res.status(404).json({ error: 'User not found. Valid registered user required.' });
  }

  const numScore = Number(score);
  const numTotal = Number(totalMarks);
  if (isNaN(numScore) || isNaN(numTotal) || !isFinite(numScore) || !isFinite(numTotal) || numScore < 0 || numTotal <= 0) {
    return res.status(400).json({ error: 'Score and total marks must be valid positive numbers' });
  }

  const rawAccuracy = accuracy !== undefined ? Number(accuracy) : Math.round((numScore / numTotal) * 100);
  const validAccuracy = isNaN(rawAccuracy) || !isFinite(rawAccuracy) ? 0 : Math.max(0, Math.min(100, rawAccuracy));

  const validPercentile = percentile !== undefined && !isNaN(Number(percentile)) && isFinite(Number(percentile))
    ? Math.max(0, Math.min(100, Number(percentile)))
    : undefined;

  const validAttempted = attemptedQuestions !== undefined && !isNaN(Number(attemptedQuestions)) && isFinite(Number(attemptedQuestions))
    ? Math.max(0, Math.floor(Number(attemptedQuestions)))
    : undefined;

  const validTotalQuestions = totalQuestions !== undefined && !isNaN(Number(totalQuestions)) && isFinite(Number(totalQuestions))
    ? Math.max(1, Math.floor(Number(totalQuestions)))
    : undefined;

  const validTimeTaken = timeTakenMinutes !== undefined && !isNaN(Number(timeTakenMinutes)) && isFinite(Number(timeTakenMinutes))
    ? Math.max(1, Math.floor(Number(timeTakenMinutes)))
    : undefined;

  const record = storage.addMockTestRecord({
    userId,
    userName: userName || existingUser.name || 'Student',
    platform: platform.trim(),
    testTitle: (testTitle && typeof testTitle === 'string' && testTitle.trim()) ? testTitle.trim() : `${platform} Mock Test`,
    score: numScore,
    totalMarks: numTotal,
    accuracy: validAccuracy,
    percentile: validPercentile,
    attemptedQuestions: validAttempted,
    totalQuestions: validTotalQuestions,
    timeTakenMinutes: validTimeTaken
  });

  // Notify room peers with a cheerful toast if test was taken within a specific study group room
  const targetRoom = req.body.roomId ? String(req.body.roomId).trim().toUpperCase() : null;
  if (targetRoom) {
    io.to(targetRoom).emit('notification:toast', {
      title: '🏆 Mock Test Completed!',
      message: `${record.userName} completed ${record.testTitle} on ${platform}: Score ${record.score}/${record.totalMarks} (${record.accuracy}% Accuracy)!`,
      type: 'success'
    });
  }

  // Also broadcast user profile update so XP/badges update in real-time
  const updatedUser = storage.getUser(userId);
  if (updatedUser) {
    io.emit('user:profile_updated', updatedUser);
  }

  res.json({ success: true, record });
});

// Peer Activity Summary (Today's Hours, Subject Breakdown)
app.get('/api/activity/peer-summary', (req, res) => {
  const userId = req.query.userId as string;
  if (!userId) return res.status(400).json({ error: 'User ID required' });
  const dateKey = (req.query.date as string) || undefined;
  const summary = storage.getUserDailyActivitySummary(userId, dateKey);
  res.json(summary);
});

// Activity Session Recording
app.post('/api/activity/session', (req, res) => {
  const { userId, userName, activityName, category, durationSeconds, localDate } = req.body;
  if (!userId || !activityName || durationSeconds === undefined) {
    return res.status(400).json({ error: 'Missing required session fields' });
  }
  const session = storage.recordActivitySession(
    userId,
    userName || 'Student',
    activityName,
    category || 'study',
    durationSeconds,
    typeof localDate === 'string' && localDate.trim() ? localDate.trim() : undefined
  );
  res.json(session);
});

// Verify Voice Room Password
app.post('/api/voice/verify-password', async (req, res) => {
  const { roomId, password } = req.body || {};
  const cleanId = (roomId || 'STUDY-ROOM-ALPHA').trim().toUpperCase();
  const expected = await getExpectedVoicePassword(cleanId);
  if (!expected) {
    return res.status(404).json({
      success: false,
      message: `No voice password is configured for study group "${cleanId}". Create or join the group first.`
    });
  }
  if (password && typeof password === 'string' && password.trim() === expected.trim()) {
    res.json({ success: true, message: 'Voice room unlocked.' });
  } else {
    res.status(401).json({ success: false, message: 'Incorrect Voice Room Password' });
  }
});

// Tasks (strictly per user)
app.get('/api/tasks', (req, res) => {
  const userId = req.query.userId as string | undefined;
  res.json(storage.getTasks(userId));
});

app.post('/api/tasks', (req, res) => {
  const userId = req.body?.userId;
  if (!userId || typeof userId !== 'string' || !userId.trim()) {
    return res.status(400).json({ error: 'Valid userId is required to create a task' });
  }
  const newTask = storage.addTask({
    id: `task-${Date.now()}`,
    userId: userId.trim(),
    title: req.body.title || 'Untitled Study Task',
    subject: req.body.subject || 'General',
    durationMinutes: req.body.durationMinutes || 30,
    targetDate: req.body.targetDate || localDateKey(),
    completed: false,
    isAiGenerated: req.body.isAiGenerated || false,
    scheduledTime: req.body.scheduledTime || '09:00 AM'
  });
  res.json(newTask);
});

app.post('/api/tasks/:id/toggle', (req, res) => {
  const userId = req.body?.userId;
  if (!userId || typeof userId !== 'string' || !userId.trim()) {
    return res.status(400).json({ error: 'User ID is required to toggle task' });
  }

  const cleanUserId = userId.trim();
  const task = storage.getTask(req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });

  // Ownership verification: user can only toggle their own task
  if (task.userId && task.userId !== cleanUserId) {
    return res.status(403).json({ error: 'Forbidden: You can only toggle your own tasks' });
  }

  const updated = storage.toggleTask(req.params.id, {
    userId: cleanUserId,
    userName: req.body?.userName
  });
  if (!updated) return res.status(404).json({ error: 'Task not found' });
  if (cleanUserId) {
    const user = storage.getUser(cleanUserId);
    if (user) {
      io.emit('user:profile_updated', user);
    }
  }
  res.json(updated);
});

// Calendar History
app.get('/api/calendar', (req, res) => {
  const userId = req.query.userId as string;
  res.json(storage.getCalendarHistory(userId));
});

// Flashcards
app.get('/api/flashcards', (req, res) => {
  res.json(storage.getFlashcards());
});

app.post('/api/flashcards', (req, res) => {
  const cardData = req.body;
  if (Array.isArray(cardData)) {
    const saved = storage.addFlashcards(cardData);
    return res.json(saved);
  }
  if (!cardData?.front || !cardData?.back) {
    return res.status(400).json({ error: 'Front and back are required' });
  }
  const card: Flashcard = {
    id: cardData.id || `fc-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    front: cardData.front,
    back: cardData.back,
    subject: cardData.subject || 'General',
    masteryLevel: cardData.masteryLevel || 'learning',
    lastReviewed: new Date().toISOString()
  };
  const saved = storage.addFlashcard(card);
  res.json(saved);
});

app.post('/api/flashcards/:id/mastery', (req, res) => {
  const updated = storage.updateFlashcardMastery(req.params.id, req.body.level);
  if (!updated) return res.status(404).json({ error: 'Card not found' });
  res.json(updated);
});

// Quizzes
app.get('/api/quiz', (req, res) => {
  res.json(storage.getQuizBank());
});

// Analytics Summary
app.get('/api/analytics', (req, res) => {
  const userId = req.query.userId as string;
  res.json(storage.getAnalyticsSummary(userId));
});

// Leaderboards
app.get('/api/leaderboard', (req, res) => {
  const filter = (req.query.filter as any) || 'Global';
  const userId = req.query.userId as string | undefined;
  res.json(storage.getLeaderboards(filter, userId));
});

// AI Coach Endpoints (Gemini-backed, with deterministic offline fallbacks)
app.get('/api/ai/status', (_req, res) => {
  res.json(aiCoach.getStatus());
});

app.post('/api/ai/schedule-prompt', async (req, res) => {
  const { prompt, userId } = req.body;
  if (!prompt) return res.status(400).json({ error: 'Prompt is required' });
  try {
    const result = await aiCoach.parseSchedulePrompt(prompt, userId);
    res.json(result);
  } catch (err) {
    console.error('[ai] schedule-prompt failed:', err);
    res.status(500).json({ error: 'AI coach could not schedule that right now' });
  }
});

app.post('/api/ai/doubt', async (req, res) => {
  const { question, context } = req.body;
  if (!question) return res.status(400).json({ error: 'Question is required' });
  try {
    const solution = await aiCoach.explainDoubt(question, context);
    res.json(solution);
  } catch (err) {
    console.error('[ai] doubt failed:', err);
    res.status(500).json({ error: 'AI coach could not answer that right now' });
  }
});

app.post('/api/ai/quiz', async (req, res) => {
  const { topic, count } = req.body;
  try {
    const quiz = await aiCoach.generateQuiz(topic || 'Quantitative Aptitude', count);
    res.json(quiz);
  } catch (err) {
    console.error('[ai] quiz failed:', err);
    res.status(500).json({ error: 'AI coach could not build a quiz right now' });
  }
});

app.post('/api/ai/flashcards', async (req, res) => {
  const { topic, count } = req.body;
  try {
    const cards = await aiCoach.generateFlashcards(topic || 'Quantitative Formulas', count);
    res.json(cards);
  } catch (err) {
    console.error('[ai] flashcards failed:', err);
    res.status(500).json({ error: 'AI coach could not build flashcards right now' });
  }
});

app.post('/api/ai/handwritten-notes', async (req, res) => {
  const { topic, userId } = req.body;
  try {
    const notes = await aiCoach.generateHandwrittenNotes(topic || 'Quantitative Aptitude & Reasoning', userId);
    res.json(notes);
  } catch (err) {
    console.error('[ai] handwritten-notes failed:', err);
    res.status(500).json({ error: 'AI coach could not generate notes right now' });
  }
});

app.post('/api/ai/summarize-lecture', async (req, res) => {
  const { videoUrl, title, userId } = req.body;
  try {
    const summary = await aiCoach.summarizeLecture(videoUrl, title, userId);
    res.json(summary);
  } catch (err) {
    console.error('[ai] summarize-lecture failed:', err);
    res.status(500).json({ error: 'AI coach could not summarise that right now' });
  }
});

// Available AI Models for StudyOS
app.get('/api/ai/models', (_req, res) => {
  res.json({
    default: 'gemini-3.5-flash',
    models: [
      {
        id: 'gemini-3.5-flash',
        name: 'Gemini 3.5 Flash',
        tag: 'Recommended & Stable',
        description: 'Rock solid, comprehensive textbook explanations with guaranteed instant availability',
        badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
      },
      {
        id: 'gemini-3.8-flash',
        name: 'Gemini 3.8 Flash',
        tag: 'Next-Gen Reasoning',
        description: 'Next-Gen intelligence, ultra-fast step-by-step reasoning & math solver',
        badgeColor: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
      },
      {
        id: 'gemini-3.7-flash',
        name: 'Gemini 3.7 Flash',
        tag: 'Math & Logic',
        description: 'Deep analytical thinking for complex mathematical derivations & proofs',
        badgeColor: 'bg-purple-500/20 text-purple-300 border-purple-500/30'
      },
      {
        id: 'gemini-3.6-flash',
        name: 'Gemini 3.6 Flash',
        tag: 'High Precision',
        description: 'Rigorous calculation accuracy and formula verification',
        badgeColor: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30'
      },
      {
        id: 'gemini-3.5-flash-lite',
        name: 'Gemini 3.5 Flash Lite',
        tag: 'Lightning Fast',
        description: 'Instant answers for quick formula checks and rapid doubt lookup',
        badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/30'
      }
    ]
  });
});

// PDF reader assistant — the page text is extracted client-side so locally
// opened (never uploaded) PDFs work the same as cloud ones.
app.post('/api/ai/pdf-assist', async (req, res) => {
  const { mode, docTitle, page, pageText, selectedText, question, userId, model, conversationHistory } = req.body || {};
  try {
    const result = await aiCoach.assistWithPdf({
      mode,
      docTitle,
      page,
      pageText,
      selectedText,
      question,
      userId,
      model,
      conversationHistory
    });
    res.json(result);
  } catch (err) {
    console.error('[ai] pdf-assist failed:', err);
    res.status(500).json({ error: 'AI coach could not read that page right now' });
  }
});

// NotebookLM Studio Endpoints
app.post('/api/ai/notebook/briefing', async (req, res) => {
  const { docTitle, sourceText, userId } = req.body || {};
  if (!sourceText) return res.status(400).json({ error: 'sourceText is required' });
  try {
    const result = await aiCoach.generateBriefingDoc({ docTitle, sourceText, userId });
    res.json(result);
  } catch (err) {
    console.error('[ai] notebook/briefing failed:', err);
    res.status(500).json({ error: 'Failed to generate briefing document' });
  }
});

app.post('/api/ai/notebook/audio-overview', async (req, res) => {
  const { docTitle, sourceText, language, userId } = req.body || {};
  if (!sourceText) return res.status(400).json({ error: 'sourceText is required' });
  try {
    const result = await aiCoach.generateAudioOverview({ docTitle, sourceText, language, userId });
    res.json(result);
  } catch (err) {
    console.error('[ai] notebook/audio-overview failed:', err);
    res.status(500).json({ error: 'Failed to generate audio overview' });
  }
});

app.post('/api/ai/tts', async (req, res) => {
  const { text, speaker, language, voice, rate, pitch } = req.body || {};
  if (!text) {
    return res.status(400).json({ error: 'text is required' });
  }
  try {
    const audioBuffer = await neuralTts.synthesize({ text, speaker, language, voice, rate, pitch });
    res.set({
      'Content-Type': 'audio/mpeg',
      'Content-Length': audioBuffer.length.toString(),
      'Cache-Control': 'public, max-age=86400'
    });
    res.send(audioBuffer);
  } catch (err: any) {
    console.error('[tts] neural synthesis failed:', err?.message || err);
    res.status(500).json({ error: 'Neural TTS generation failed', details: err?.message });
  }
});

app.post('/api/ai/notebook/ask', async (req, res) => {
  const { docTitle, sourceText, question, history, userId } = req.body || {};
  if (!sourceText || !question) return res.status(400).json({ error: 'sourceText and question are required' });
  try {
    const result = await aiCoach.askSourceQuestion({ docTitle, sourceText, question, history, userId });
    res.json(result);
  } catch (err) {
    console.error('[ai] notebook/ask failed:', err);
    res.status(500).json({ error: 'Failed to answer question' });
  }
});

app.post('/api/ai/notebook/study-pack', async (req, res) => {
  const { docTitle, sourceText, userId } = req.body || {};
  if (!sourceText) return res.status(400).json({ error: 'sourceText is required' });
  try {
    const result = await aiCoach.generateSourceStudyPack({ docTitle, sourceText, userId });
    res.json(result);
  } catch (err) {
    console.error('[ai] notebook/study-pack failed:', err);
    res.status(500).json({ error: 'Failed to generate study pack' });
  }
});

// In production, serve the compiled client from client/dist if present
const clientDistPath = fs.existsSync(path.resolve(process.cwd(), 'client/dist'))
  ? path.resolve(process.cwd(), 'client/dist')
  : path.resolve(__dirname, '../../client/dist');

if (fs.existsSync(clientDistPath)) {
  app.use(express.static(clientDistPath));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) {
      return next();
    }
    res.sendFile(path.join(clientDistPath, 'index.html'));
  });
}

server.listen(PORT, async () => {
  console.log(`🚀 StudyOS Server running on http://localhost:${PORT}`);
  console.log(`📡 WebSocket & Real-time Live Situation Engine active`);

  // Connect to MongoDB Atlas
  const connected = await connectDatabase();
  if (connected) {
    await storage.syncWithDatabase();
  }
  await telegramService.init();
});
