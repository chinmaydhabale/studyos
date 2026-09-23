import express from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';
import { connectDatabase } from './db.js';
import { storage } from './services/storageService.js';
import { aiCoach } from './services/aiCoachService.js';
import { telegramService } from './services/telegramService.js';
import { setupVideoSyncSocket } from './sockets/videoSyncSocket.js';
import { setupVoiceAndChatSocket } from './sockets/voiceAndChatSocket.js';
import { setupStudyRoomSocket } from './sockets/studyRoomSocket.js';
import { generateSamplePdf } from './services/samplePdfGenerator.js';

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
app.use(express.json());

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

// Wipe Database & Reset to Pure Zero
app.post('/api/reset', async (req, res) => {
  await storage.wipeAndResetAllCollections();
  res.json({ success: true, message: 'All data wiped. StudyOS is now at pure zero.' });
});

// User Profile
app.get('/api/user', (req, res) => {
  const userId = req.query.userId as string;
  if (!userId) {
    return res.status(404).json({ error: 'User ID required' });
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
    const { username, password, name, targetExam, city, avatar } = req.body;
    const result = await storage.registerUser({ username, password, name, targetExam, city, avatar });
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Registration failed' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
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
    const { roomId } = req.body;
    if (!roomId || !roomId.trim()) {
      return res.status(400).json({ error: 'Group ID is required to join' });
    }
    const cleanId = roomId.trim().toUpperCase();
    const group = await storage.getStudyGroup(cleanId);
    if (!group) {
      return res.status(404).json({
        error: `No study group exists with ID "${cleanId}". You must enter a valid Group ID or create a new group.`
      });
    }
    res.json({ success: true, group });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Error joining study group' });
  }
});

app.get('/api/rooms/:roomId', async (req, res) => {
  const cleanId = req.params.roomId.trim().toUpperCase();
  const group = await storage.getStudyGroup(cleanId);
  if (!group) return res.status(404).json({ error: 'Study group not found' });
  res.json(group);
});

// --- TELEGRAM CLOUD STORAGE (Documents & Notes) ---
app.get('/api/telegram/status', (req, res) => {
  res.json(telegramService.getStatus());
});

app.post('/api/telegram/detect', async (req, res) => {
  const result = await telegramService.detectChannelFromUpdates();
  res.json(result);
});

app.post('/api/telegram/config', async (req, res) => {
  const { channelId, channelTitle } = req.body;
  if (!channelId) return res.status(400).json({ error: 'Channel ID required' });
  const result = await telegramService.setChannelConfig(channelId, channelTitle);
  res.json({ success: true, config: result });
});

app.post('/api/telegram/upload', upload.single('file'), async (req, res) => {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'No file provided' });
    const { roomId, title, subject, uploaderId, uploaderName, description } = req.body;
    if (!roomId || !title) {
      return res.status(400).json({ error: 'Room ID and Title are required' });
    }

    const caption = `📚 ${title}\n🏷️ Subject: ${subject || 'Quantitative Aptitude'}\n👤 Student: ${uploaderName || 'Anonymous'}\n🏛️ Group ID: ${roomId.toUpperCase()}`;
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
    const url = await telegramService.getFileDownloadUrl(fileId);
    const docId = req.query.docId as string;
    if (docId) {
      await storage.incrementDocumentDownload(docId);
    }
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

// Peer Activity Summary (Today's Hours, Subject Breakdown)
app.get('/api/activity/peer-summary', (req, res) => {
  const userId = req.query.userId as string;
  if (!userId) return res.status(400).json({ error: 'User ID required' });
  const summary = storage.getUserDailyActivitySummary(userId);
  res.json(summary);
});

// Activity Session Recording
app.post('/api/activity/session', (req, res) => {
  const { userId, userName, activityName, category, durationSeconds } = req.body;
  if (!userId || !activityName || durationSeconds === undefined) {
    return res.status(400).json({ error: 'Missing required session fields' });
  }
  const session = storage.recordActivitySession(
    userId,
    userName || 'Student',
    activityName,
    category || 'study',
    durationSeconds
  );
  res.json(session);
});

// Verify Voice Room Password
app.post('/api/voice/verify-password', async (req, res) => {
  const { roomId, password } = req.body;
  const cleanId = (roomId || '').trim().toUpperCase();
  const group = await storage.getStudyGroup(cleanId);
  const expected = group?.voicePassword || 'study123';
  const isMatch = password === expected;
  if (isMatch) {
    res.json({ success: true, message: 'Voice room unlocked.' });
  } else {
    res.status(401).json({ success: false, message: 'Incorrect Voice Room Password' });
  }
});

// Tasks
app.get('/api/tasks', (req, res) => {
  res.json(storage.getTasks());
});

app.post('/api/tasks', (req, res) => {
  const newTask = storage.addTask({
    id: `task-${Date.now()}`,
    title: req.body.title || 'Untitled Study Task',
    subject: req.body.subject || 'General',
    durationMinutes: req.body.durationMinutes || 30,
    targetDate: req.body.targetDate || new Date().toISOString().split('T')[0],
    completed: false,
    isAiGenerated: req.body.isAiGenerated || false,
    scheduledTime: req.body.scheduledTime || '09:00 AM'
  });
  res.json(newTask);
});

app.post('/api/tasks/:id/toggle', (req, res) => {
  const updated = storage.toggleTask(req.params.id, {
    userId: req.body?.userId,
    userName: req.body?.userName
  });
  if (!updated) return res.status(404).json({ error: 'Task not found' });
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
  res.json(storage.getLeaderboards(filter));
});

// AI Coach Endpoints
app.post('/api/ai/schedule-prompt', (req, res) => {
  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ error: 'Prompt is required' });
  const result = aiCoach.parseSchedulePrompt(prompt);

  io.emit('notification:toast', {
    title: 'AI Coach Schedule Updated',
    message: result.message,
    type: 'success'
  });

  res.json(result);
});

app.post('/api/ai/doubt', (req, res) => {
  const { question, context } = req.body;
  if (!question) return res.status(400).json({ error: 'Question is required' });
  const solution = aiCoach.explainDoubt(question, context);
  res.json(solution);
});

app.post('/api/ai/quiz', (req, res) => {
  const { topic } = req.body;
  const quiz = aiCoach.generateQuiz(topic || 'Quantitative Aptitude');
  res.json(quiz);
});

app.post('/api/ai/flashcards', (req, res) => {
  const { topic } = req.body;
  const cards = aiCoach.generateFlashcards(topic || 'Quantitative Formulas');
  res.json(cards);
});

app.post('/api/ai/handwritten-notes', (req, res) => {
  const { topic } = req.body;
  const notes = aiCoach.generateHandwrittenNotes(topic || 'Quantitative Aptitude & Reasoning');
  res.json(notes);
});

app.post('/api/ai/summarize-lecture', (req, res) => {
  const { videoUrl, title } = req.body;
  const summary = aiCoach.summarizeLecture(videoUrl, title);
  res.json(summary);
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
    await telegramService.init();
  }
});
