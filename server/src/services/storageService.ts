import {
  UserProfile,
  VideoSyncState,
  ChatMessage,
  WhiteboardElement,
  SharedNote,
  StudyTask,
  CalendarDayRecord,
  Flashcard,
  QuizQuestion,
  LeaderboardEntry,
  ActivitySession,
  StudyGroup,
  StudyDocument,
  MockTestRecord
} from '../types.js';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { isDbConnected } from '../db.js';
import { UserModel } from '../models/User.js';
import { ActivitySessionModel } from '../models/ActivitySession.js';
import { TaskModel } from '../models/Task.js';
import { SharedNoteModel } from '../models/SharedNote.js';
import { WhiteboardModel } from '../models/Whiteboard.js';
import { CalendarRecordModel } from '../models/CalendarRecord.js';
import { StudyGroupModel } from '../models/StudyGroup.js';
import { StudyDocumentModel } from '../models/StudyDocument.js';

// Documents loaded from MongoDB via toObject() carry `_id`/`__v`. MongoDB rejects
// $set updates that touch the immutable `_id`, so always strip them before writing.
const stripDbFields = <T extends object>(obj: T): T => {
  const { _id, __v, ...rest } = obj as any;
  if (!rest.username || typeof rest.username !== 'string' || !rest.username.trim()) {
    delete rest.username;
  }
  return rest as T;
};

// "Today" must follow the local calendar day — toISOString() would give the UTC day,
// which is still yesterday for users in India between 00:00 and 05:30 local time.
export const localDateKey = (date: Date = new Date()): string => {
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
};

const getDirname = (): string => {
  return typeof __dirname !== 'undefined' ? __dirname : process.cwd();
};

const resolveDataDir = (): string => {
  const custom = process.env.STUDYOS_DATA_DIR;
  if (custom && custom.trim()) {
    try {
      fs.mkdirSync(custom, { recursive: true });
      return custom;
    } catch (e) {}
  }

  const baseDir = getDirname();
  const candidates = [
    path.resolve(process.cwd(), 'data'),
    path.resolve(process.cwd(), 'server/data'),
    path.resolve(baseDir, '../../data'),
    path.resolve(baseDir, '../data'),
    path.resolve(baseDir, 'data')
  ];

  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }

  const preferred = path.resolve(baseDir, '../../data');
  try {
    fs.mkdirSync(preferred, { recursive: true });
    return preferred;
  } catch {
    const cwdTarget = path.resolve(process.cwd(), 'data');
    try {
      fs.mkdirSync(cwdTarget, { recursive: true });
      return cwdTarget;
    } catch {
      return process.cwd();
    }
  }
};

function writeJsonSafe(filePath: string, data: any): void {
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const tempPath = `${filePath}.${Date.now()}.${Math.random().toString(36).substring(2, 6)}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tempPath, filePath);
  } catch (err: any) {
    console.warn(`[storage] Failed to write ${filePath}:`, err.message);
  }
}

function readJsonSafe<T>(filePath: string, fallback: T): T {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const content = fs.readFileSync(filePath, 'utf-8');
    if (!content.trim()) return fallback;
    return JSON.parse(content) as T;
  } catch (err: any) {
    console.warn(`[storage] Failed to read ${filePath}:`, err.message);
    return fallback;
  }
}

export class StorageService {
  private users: Map<string, UserProfile> = new Map();
  private userCredentials: Map<string, { passwordHash: string; salt: string }> = new Map();
  private videoStates: Map<string, VideoSyncState> = new Map();
  private roomChats: Map<string, ChatMessage[]> = new Map();
  private whiteboardElements: Map<string, WhiteboardElement[]> = new Map();
  private notes: Map<string, SharedNote> = new Map();
  private tasks: StudyTask[] = [];
  private calendarHistory: CalendarDayRecord[] = [];
  private flashcards: Flashcard[] = [];
  private quizBank: QuizQuestion[] = [];
  private activitySessions: ActivitySession[] = [];
  private groups: Map<string, StudyGroup> = new Map();
  private documents: Map<string, StudyDocument> = new Map();
  private mockTestRecords: MockTestRecord[] = [];
  private dataDir: string;

  constructor() {
    this.dataDir = resolveDataDir();
    this.loadFromDisk();
    this.ensureDefaultGroup();
    this.ensureChinmayAccount();
  }

  public ensureDefaultGroup(): StudyGroup {
    const existing = this.groups.get('STUDY-ROOM-ALPHA');
    if (existing) return existing;
    const defaultAlpha: StudyGroup = {
      roomId: 'STUDY-ROOM-ALPHA',
      name: 'Main Alpha Co-Study Theater',
      description: 'Default 24/7 collaborative banking & competitive study room',
      targetExam: 'RRB PO & IBPS PO',
      creatorId: 'system',
      creatorName: 'StudyOS Official',
      memberCount: 1,
      voicePassword: 'study123',
      isPrivate: false,
      createdAt: new Date().toISOString()
    };
    this.groups.set('STUDY-ROOM-ALPHA', defaultAlpha);
    this.saveGroupsToDisk();
    return defaultAlpha;
  }

  public ensureChinmayAccount(): void {
    const targetUsername = 'chinmay';
    const targetPassword = '7717';
    const targetUserId = 'user_1790089573198_ucnf';

    // 1. Ensure credentials exist
    let creds = this.userCredentials.get(targetUsername);
    if (!creds || !creds.passwordHash || !creds.salt) {
      const salt = crypto.randomBytes(16).toString('hex');
      const passwordHash = crypto.pbkdf2Sync(targetPassword, salt, 100000, 64, 'sha512').toString('hex');
      creds = { passwordHash, salt };
      this.userCredentials.set(targetUsername, creds);
      this.saveCredentialsToDisk();
    }

    // 2. Ensure UserProfile exists
    let user = this.getUserByUsername(targetUsername) || this.users.get(targetUserId);

    if (!user) {
      user = {
        id: targetUserId,
        username: targetUsername,
        name: 'Chinmay Dhabale',
        avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=Scholar&backgroundColor=6366f1',
        targetExam: 'RRB PO & IBPS PO',
        college: 'Competitive Aspirant',
        city: 'India',
        country: 'India',
        xp: 0,
        level: 1,
        coins: 50,
        streak: 1,
        bestStreak: 1,
        totalStudyHours: 0,
        focusScore: 100,
        accuracy: 100,
        tasksCompleted: 0,
        tasksMissed: 0,
        badges: ['⚡ New Scholar'],
        status: 'Ready to Study',
        isMuted: true,
        isSpeaking: false,
        currentActivity: 'Ready to Study',
        activityCategory: 'study',
        activityStartTime: null
      };
      this.users.set(user.id, user);
      this.saveUsersToDisk();
    } else {
      let changed = false;
      if (!user.username || user.username.toLowerCase() !== targetUsername) {
        user.username = targetUsername;
        changed = true;
      }
      if (!user.name || user.name === 'Student Aspirant') {
        user.name = 'Chinmay Dhabale';
        changed = true;
      }
      if (changed) {
        this.users.set(user.id, user);
        this.saveUsersToDisk();
      }
    }
  }

  private loadFromDisk(): void {
    try {
      console.log(`📂 Initializing persistent local disk storage at ${this.dataDir}...`);

      // 1. Credentials
      const credsFile = path.join(this.dataDir, 'credentials.json');
      const credsData = readJsonSafe<Record<string, { passwordHash: string; salt: string }>>(credsFile, {});
      for (const [uname, cred] of Object.entries(credsData)) {
        if (cred && cred.passwordHash && cred.salt) {
          this.userCredentials.set(uname.toLowerCase(), cred);
        }
      }

      // 2. Users
      const usersFile = path.join(this.dataDir, 'users.json');
      const usersData = readJsonSafe<UserProfile[]>(usersFile, []);
      for (const u of usersData) {
        if (u && u.id) {
          this.users.set(u.id, u);
        }
      }

      // 3. Groups
      const groupsFile = path.join(this.dataDir, 'groups.json');
      const groupsData = readJsonSafe<StudyGroup[]>(groupsFile, []);
      for (const g of groupsData) {
        if (g && g.roomId) {
          this.groups.set(g.roomId, g);
        }
      }

      // 4. Tasks
      const tasksFile = path.join(this.dataDir, 'tasks.json');
      const loadedTasks = readJsonSafe<StudyTask[]>(tasksFile, []);
      if (loadedTasks.length > 0) {
        this.tasks = loadedTasks;
      }

      // 5. Calendar history
      const calFile = path.join(this.dataDir, 'calendar.json');
      const loadedCal = readJsonSafe<CalendarDayRecord[]>(calFile, []);
      if (loadedCal.length > 0) {
        this.calendarHistory = loadedCal;
      }

      // 6. Activity Sessions
      const sessionsFile = path.join(this.dataDir, 'activity_sessions.json');
      const loadedSessions = readJsonSafe<ActivitySession[]>(sessionsFile, []);
      if (loadedSessions.length > 0) {
        this.activitySessions = loadedSessions;
      }

      // 7. Documents
      const docsFile = path.join(this.dataDir, 'documents.json');
      const docsData = readJsonSafe<StudyDocument[]>(docsFile, []);
      for (const d of docsData) {
        if (d && d.id) {
          this.documents.set(d.id, d);
        }
      }

      // 8. Shared Notes
      const notesFile = path.join(this.dataDir, 'notes.json');
      const notesData = readJsonSafe<Record<string, SharedNote>>(notesFile, {});
      for (const [rId, note] of Object.entries(notesData)) {
        if (note) {
          this.notes.set(rId, note);
        }
      }

      // 9. Mock Test Records
      const mocksFile = path.join(this.dataDir, 'mock_tests.json');
      const mocksData = readJsonSafe<MockTestRecord[]>(mocksFile, []);
      if (mocksData.length > 0) {
        this.mockTestRecords = mocksData;
      }

      console.log(`✅ Disk storage loaded: ${this.users.size} users, ${this.userCredentials.size} accounts with credentials, ${this.groups.size} groups, ${this.mockTestRecords.length} mock tests.`);
    } catch (err: any) {
      console.warn('[storage] Error loading from disk:', err.message);
    }
  }

  public saveAllToDisk(): void {
    this.saveCredentialsToDisk();
    this.saveUsersToDisk();
    this.saveGroupsToDisk();
    this.saveTasksToDisk();
    this.saveCalendarToDisk();
    this.saveActivitySessionsToDisk();
    this.saveDocumentsToDisk();
    this.saveNotesToDisk();
    this.saveFlashcardsToDisk();
    this.saveMockTestRecordsToDisk();
  }

  public saveMockTestRecordsToDisk(): void {
    writeJsonSafe(path.join(this.dataDir, 'mock_tests.json'), this.mockTestRecords);
  }

  public saveCredentialsToDisk(): void {
    const obj: Record<string, { passwordHash: string; salt: string }> = {};
    for (const [k, v] of this.userCredentials.entries()) {
      obj[k] = v;
    }
    writeJsonSafe(path.join(this.dataDir, 'credentials.json'), obj);
  }

  public saveUsersToDisk(): void {
    writeJsonSafe(path.join(this.dataDir, 'users.json'), Array.from(this.users.values()));
  }

  public saveGroupsToDisk(): void {
    writeJsonSafe(path.join(this.dataDir, 'groups.json'), Array.from(this.groups.values()));
  }

  public saveTasksToDisk(): void {
    writeJsonSafe(path.join(this.dataDir, 'tasks.json'), this.tasks);
  }

  public saveCalendarToDisk(): void {
    writeJsonSafe(path.join(this.dataDir, 'calendar.json'), this.calendarHistory);
  }

  public saveActivitySessionsToDisk(): void {
    writeJsonSafe(path.join(this.dataDir, 'activity_sessions.json'), this.activitySessions);
  }

  public saveDocumentsToDisk(): void {
    writeJsonSafe(path.join(this.dataDir, 'documents.json'), Array.from(this.documents.values()));
  }

  public saveNotesToDisk(): void {
    const obj: Record<string, SharedNote> = {};
    for (const [k, v] of this.notes.entries()) {
      obj[k] = v;
    }
    writeJsonSafe(path.join(this.dataDir, 'notes.json'), obj);
  }

  public saveFlashcardsToDisk(): void {
    writeJsonSafe(path.join(this.dataDir, 'flashcards.json'), this.flashcards);
  }

  // Clear all mock data from MongoDB Atlas on first startup
  public async wipeAndResetAllCollections() {
    this.users.clear();
    this.videoStates.clear();
    this.roomChats.clear();
    this.whiteboardElements.clear();
    this.notes.clear();
    this.tasks = [];
    this.calendarHistory = [];
    this.flashcards = [];
    this.quizBank = [];
    this.activitySessions = [];
    this.groups.clear();
    this.documents.clear();
    this.userCredentials.clear();
    this.ensureDefaultGroup();

    if (!isDbConnected()) return;
    try {
      console.log('🧹 Purging any old mock data from MongoDB Atlas...');
      await UserModel.deleteMany({});
      await ActivitySessionModel.deleteMany({});
      await TaskModel.deleteMany({});
      await SharedNoteModel.deleteMany({});
      await WhiteboardModel.deleteMany({});
      await CalendarRecordModel.deleteMany({});
      await StudyGroupModel.deleteMany({});
      await StudyDocumentModel.deleteMany({});
      console.log('✨ MongoDB Atlas is now 100% clean and ready for real student data!');
    } catch (err: any) {
      console.warn('Wipe error:', err.message);
    }
  }

  // Load real data from MongoDB Atlas
  public async syncWithDatabase() {
    if (!isDbConnected()) return;

    try {
      console.log('🔄 Loading real data from MongoDB Atlas...');

      // Sync Users
      const dbUsers = await UserModel.find({});
      dbUsers.forEach(u => {
        const rawUser = stripDbFields(u.toObject()) as any;
        if (rawUser.username && (u as any).passwordHash && (u as any).salt) {
          this.userCredentials.set(rawUser.username.toLowerCase(), {
            passwordHash: (u as any).passwordHash,
            salt: (u as any).salt
          });
        }
        delete rawUser.passwordHash;
        delete rawUser.salt;
        this.users.set(u.id, rawUser);
      });

      // Sync Tasks
      const dbTasks = await TaskModel.find({});
      this.tasks = dbTasks.map(t => stripDbFields(t.toObject()) as any);

      // Sync Activity Sessions
      const dbSessions = await ActivitySessionModel.find({});
      this.activitySessions = dbSessions.map(s => stripDbFields(s.toObject()) as any);

      // Sync Shared Notes
      const dbNotes = await SharedNoteModel.find({});
      dbNotes.forEach(n => {
        this.notes.set(n.roomId, stripDbFields(n.toObject()) as any);
      });

      // Sync Whiteboard Elements
      const dbWb = await WhiteboardModel.find({});
      const roomMap = new Map<string, WhiteboardElement[]>();
      dbWb.forEach(el => {
        const list = roomMap.get(el.roomId) || [];
        list.push(stripDbFields(el.toObject()) as any);
        roomMap.set(el.roomId, list);
      });
      roomMap.forEach((elems, rId) => {
        this.whiteboardElements.set(rId, elems);
      });

      // Sync Calendar Records
      const dbCal = await CalendarRecordModel.find({});
      this.calendarHistory = dbCal.map(c => stripDbFields(c.toObject()) as any);

      // Sync Groups
      const dbGroups = await StudyGroupModel.find({});
      dbGroups.forEach(g => {
        this.groups.set(g.roomId, stripDbFields(g.toObject()) as any);
      });
      this.ensureDefaultGroup();

      // Sync Documents
      const dbDocs = await StudyDocumentModel.find({});
      dbDocs.forEach(d => {
        this.documents.set(d.id, stripDbFields(d.toObject()) as any);
      });

      // Save all synced data from MongoDB Atlas to persistent local disk
      this.ensureChinmayAccount();
      this.saveAllToDisk();

      console.log(`✅ Loaded ${this.users.size} registered users, ${this.groups.size} study groups, and ${this.documents.size} documents from MongoDB.`);
    } catch (err: any) {
      console.warn('MongoDB sync error:', err.message);
    }
  }

  // --- Real Account Management (Starts at 0) ---

  public getUser(id: string): UserProfile | undefined {
    return this.users.get(id);
  }

  public createOrUpdateUser(profile: Partial<UserProfile> & { id: string }): UserProfile {
    let existing = this.users.get(profile.id);
    if (!existing) {
      existing = {
        id: profile.id,
        username: profile.username || '',
        name: profile.name || 'Student Aspirant',
        avatar: profile.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(profile.name || profile.id)}&backgroundColor=6366f1`,
        targetExam: profile.targetExam || 'RRB PO & IBPS PO',
        college: profile.college || 'Aspirant',
        city: profile.city || 'India',
        country: 'India',
        xp: 0,
        level: 1,
        coins: 50,
        streak: 0,
        bestStreak: 0,
        totalStudyHours: 0,
        focusScore: 100,
        accuracy: 100,
        tasksCompleted: 0,
        tasksMissed: 0,
        badges: ['⚡ New Scholar'],
        status: 'Ready to Study',
        isMuted: true,
        isSpeaking: false,
        currentActivity: 'Ready to Study',
        activityCategory: 'study',
        activityStartTime: null
      };
    }

    // Determine username safely without letting guest socket sessions hijack registered usernames
    let username = existing.username || '';
    if (profile.username && profile.username.trim()) {
      const candidateUsername = profile.username.trim().toLowerCase();
      const userWithThisUsername = this.getUserByUsername(candidateUsername);
      if (!userWithThisUsername || userWithThisUsername.id === profile.id || !this.userCredentials.has(candidateUsername)) {
        username = candidateUsername;
      }
    }

    const updated: UserProfile = { ...existing, ...profile, username };
    this.users.set(profile.id, updated);
    this.saveUsersToDisk();

    if (isDbConnected()) {
      // Safe update - update profile fields without wiping stats or password hash
      const updateData: any = {
        name: updated.name,
        avatar: updated.avatar,
        targetExam: updated.targetExam,
        college: updated.college,
        city: updated.city,
        country: updated.country,
        status: updated.status,
        updatedAt: new Date()
      };
      if (username && typeof username === 'string' && username.trim()) {
        updateData.username = username.trim().toLowerCase();
      }
      UserModel.findOneAndUpdate(
        { id: profile.id },
        { 
          $set: updateData,
          $setOnInsert: {
            id: profile.id,
            xp: existing.xp || 0,
            level: existing.level || 1,
            coins: existing.coins || 50,
            streak: existing.streak || 0,
            bestStreak: existing.bestStreak || 0,
            totalStudyHours: existing.totalStudyHours || 0,
            focusScore: existing.focusScore || 100,
            accuracy: existing.accuracy || 100,
            tasksCompleted: existing.tasksCompleted || 0,
            tasksMissed: existing.tasksMissed || 0,
            badges: existing.badges || ['⚡ New Scholar'],
            currentActivity: 'Ready to Study',
            activityCategory: 'study',
            activityStartTime: null
          }
        },
        { upsert: true, returnDocument: 'after' }
      ).catch(e => console.warn('MongoDB User save error:', e.message));
    }

    return updated;
  }

  // --- Permanent Account Authentication (Username & Password) ---

  public getUserByUsername(username: string): UserProfile | undefined {
    if (!username || typeof username !== 'string') return undefined;
    const cleanUsername = username.trim().toLowerCase();
    for (const user of this.users.values()) {
      if (user.username && user.username.toLowerCase() === cleanUsername) {
        return user;
      }
    }
    return undefined;
  }

  public async registerUser(data: {
    username: string;
    password: string;
    name: string;
    targetExam?: string;
    city?: string;
    avatar?: string;
  }): Promise<{ user: UserProfile; token: string }> {
    if (!data.username || typeof data.username !== 'string') {
      throw new Error('Username is required.');
    }
    if (!data.password || typeof data.password !== 'string') {
      throw new Error('Password is required.');
    }

    const cleanUsername = data.username.trim().toLowerCase();
    if (!cleanUsername || cleanUsername.length < 3) {
      throw new Error('Username must be at least 3 characters');
    }
    if (data.password.length < 4) {
      throw new Error('Password must be at least 4 characters');
    }

    // Check in-memory credentials and DB
    const existingCreds = this.userCredentials.get(cleanUsername);
    let existingInDb: any = null;
    if (isDbConnected()) {
      try {
        existingInDb = await UserModel.findOne({ username: cleanUsername });
      } catch (err: any) {
        console.warn('MongoDB check failed in registerUser:', err.message);
      }
    }

    // Only throw "already taken" if actual password credentials exist for this username
    if (existingCreds || (existingInDb && existingInDb.passwordHash)) {
      throw new Error('Username already taken. Please choose another one or log in.');
    }

    // Hash password with salt
    const salt = crypto.randomBytes(16).toString('hex');
    const passwordHash = crypto.pbkdf2Sync(data.password, salt, 100000, 64, 'sha512').toString('hex');

    // Store in dedicated credentials map & persist to disk
    this.userCredentials.set(cleanUsername, { passwordHash, salt });
    this.saveCredentialsToDisk();

    // Check if user profile already exists (e.g. from socket join or unauthenticated session)
    let existingUser = this.getUserByUsername(cleanUsername);
    const userId = existingUser ? existingUser.id : (cleanUsername === 'chinmay' ? 'user_1790089573198_ucnf' : `user_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`);

    const effectiveName = (data.name && typeof data.name === 'string' && data.name.trim()) 
      ? data.name.trim() 
      : (existingUser?.name || cleanUsername);

    const newUser: UserProfile = {
      ...(existingUser || {}),
      id: userId,
      username: cleanUsername,
      name: effectiveName,
      avatar: data.avatar || existingUser?.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(cleanUsername)}&backgroundColor=6366f1`,
      targetExam: data.targetExam || existingUser?.targetExam || 'RRB PO & IBPS PO',
      college: existingUser?.college || 'Competitive Aspirant',
      city: data.city || existingUser?.city || 'India',
      country: 'India',
      xp: existingUser?.xp || 0,
      level: existingUser?.level || 1,
      coins: existingUser?.coins || 50,
      streak: existingUser?.streak || 0,
      bestStreak: existingUser?.bestStreak || 0,
      totalStudyHours: existingUser?.totalStudyHours || 0,
      focusScore: existingUser?.focusScore || 100,
      accuracy: existingUser?.accuracy || 100,
      tasksCompleted: existingUser?.tasksCompleted || 0,
      tasksMissed: existingUser?.tasksMissed || 0,
      badges: existingUser?.badges || ['⚡ New Scholar'],
      status: 'Ready to Study',
      isMuted: true,
      isSpeaking: false,
      currentActivity: 'Ready to Study',
      activityCategory: 'study',
      activityStartTime: null
    };

    this.users.set(userId, newUser);
    this.saveUsersToDisk();

    if (isDbConnected()) {
      try {
        await UserModel.findOneAndUpdate(
          { username: cleanUsername },
          {
            $set: {
              ...stripDbFields(newUser),
              passwordHash,
              salt,
              updatedAt: new Date()
            }
          },
          { upsert: true }
        );
      } catch (err: any) {
        console.warn('MongoDB User save in register error:', err.message);
      }
    }

    const token = `token_${userId}_${Date.now()}`;
    return { user: stripDbFields(newUser), token };
  }

  public async authenticateUser(username: string, password: string): Promise<{ user: UserProfile; token: string }> {
    if (!username || typeof username !== 'string' || !password || typeof password !== 'string') {
      throw new Error('Please enter both username and password.');
    }
    const cleanInput = username.trim().toLowerCase();
    if (!cleanInput) {
      throw new Error('Username cannot be blank.');
    }

    // Resolve username or display name (e.g. username 'pari_01' has name 'shivanshi')
    let resolvedUsername = cleanInput;
    for (const u of this.users.values()) {
      if ((u.username && u.username.toLowerCase() === cleanInput) ||
          (u.name && u.name.trim().toLowerCase() === cleanInput && u.username)) {
        resolvedUsername = u.username.toLowerCase();
        break;
      }
    }

    const escapeRegex = (s: string) => s.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');

    let dbUser: any = null;
    if (isDbConnected()) {
      try {
        dbUser = await UserModel.findOne({
          $or: [
            { username: cleanInput },
            { username: resolvedUsername },
            { name: { $regex: new RegExp(`^${escapeRegex(cleanInput)}$`, 'i') } }
          ]
        });
      } catch (err: any) {
        console.warn('MongoDB authentication lookup failed, falling back to disk cache:', err.message);
      }
    }

    if (dbUser) {
      const actualUsername = (dbUser.username || resolvedUsername).toLowerCase();
      const salt = dbUser.salt || '';
      const expectedHash = dbUser.passwordHash || '';
      const inputHash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
      if (inputHash !== expectedHash) {
        throw new Error('Invalid username or password.');
      }

      // Cache credentials in memory & disk under actual username
      this.userCredentials.set(actualUsername, { passwordHash: expectedHash, salt });
      this.saveCredentialsToDisk();

      const safeUser = stripDbFields(dbUser.toObject()) as any;
      delete safeUser.passwordHash;
      delete safeUser.salt;

      this.users.set(safeUser.id, safeUser);
      this.saveUsersToDisk();
      return { user: safeUser as UserProfile, token: `token_${safeUser.id}_${Date.now()}` };
    }

    // Fallback: Check local credentials store (by resolvedUsername or cleanInput)
    const inMemoryCreds = this.userCredentials.get(resolvedUsername) || this.userCredentials.get(cleanInput);
    if (!inMemoryCreds?.passwordHash || !inMemoryCreds?.salt) {
      throw new Error('Invalid username or password.');
    }

    const inputHash = crypto.pbkdf2Sync(password, inMemoryCreds.salt, 100000, 64, 'sha512').toString('hex');
    if (inputHash !== inMemoryCreds.passwordHash) {
      throw new Error('Invalid username or password.');
    }

    let inMemoryUser = this.getUserByUsername(resolvedUsername) || this.getUserByUsername(cleanInput);
    if (!inMemoryUser) {
      for (const u of this.users.values()) {
        if (u.name && u.name.trim().toLowerCase() === cleanInput) {
          inMemoryUser = u;
          break;
        }
      }
    }

    if (!inMemoryUser) {
      const newUserId = cleanInput === 'chinmay' ? 'user_1790089573198_ucnf' : `user_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      inMemoryUser = {
        id: newUserId,
        username: resolvedUsername,
        name: resolvedUsername.charAt(0).toUpperCase() + resolvedUsername.slice(1),
        avatar: `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(resolvedUsername)}&backgroundColor=6366f1`,
        targetExam: 'RRB PO & IBPS PO',
        college: 'Competitive Aspirant',
        city: 'India',
        country: 'India',
        xp: 0,
        level: 1,
        coins: 50,
        streak: 0,
        bestStreak: 0,
        totalStudyHours: 0,
        focusScore: 100,
        accuracy: 100,
        tasksCompleted: 0,
        tasksMissed: 0,
        badges: ['⚡ New Scholar'],
        status: 'Ready to Study',
        isMuted: true,
        isSpeaking: false,
        currentActivity: 'Ready to Study',
        activityCategory: 'study',
        activityStartTime: null
      };
      this.users.set(newUserId, inMemoryUser);
      this.saveUsersToDisk();
    }

    const safeUser = stripDbFields(inMemoryUser) as any;
    delete safeUser.passwordHash;
    delete safeUser.salt;

    return { user: safeUser as UserProfile, token: `token_${safeUser.id}_${Date.now()}` };
  }

  // --- Unique Study Group Rooms ---

  public async createStudyGroup(groupData: {
    roomId?: string;
    name: string;
    description?: string;
    targetExam?: string;
    creatorId: string;
    creatorName: string;
    voicePassword?: string;
  }): Promise<StudyGroup> {
    // Generate unique readable room code if not specified (e.g. RRB-PO-8419)
    let generatedId = groupData.roomId?.trim().toUpperCase();
    if (!generatedId) {
      const prefix = (groupData.targetExam?.includes('RRB') ? 'RRB' : groupData.targetExam?.includes('IBPS') ? 'IBPS' : 'STUDY');
      let attempts = 0;
      do {
        const randomDigits = Math.floor(1000 + Math.random() * 9000);
        generatedId = `${prefix}-${randomDigits}`;
        attempts++;
      } while (this.groups.has(generatedId) && attempts < 20);
    }

    const newGroup: StudyGroup = {
      roomId: generatedId,
      name: groupData.name.trim(),
      description: groupData.description || '',
      targetExam: groupData.targetExam || 'RRB PO & IBPS PO',
      creatorId: groupData.creatorId,
      creatorName: groupData.creatorName,
      memberCount: 1,
      voicePassword: groupData.voicePassword || 'study123',
      isPrivate: true,
      createdAt: new Date().toISOString()
    };

    this.groups.set(generatedId, newGroup);
    this.saveGroupsToDisk();

    if (isDbConnected()) {
      await StudyGroupModel.findOneAndUpdate(
        { roomId: generatedId },
        { $set: newGroup },
        { upsert: true, returnDocument: 'after' }
      );
    }

    return newGroup;
  }

  public async getStudyGroup(roomId: string): Promise<StudyGroup | undefined> {
    const cleanId = (roomId || '').trim().toUpperCase();
    if (!cleanId) return undefined;

    const inMem = this.groups.get(cleanId);
    if (inMem) return inMem;

    if (isDbConnected()) {
      const doc = await StudyGroupModel.findOne({ roomId: cleanId });
      if (doc) {
        const obj = stripDbFields(doc.toObject()) as any;
        this.groups.set(cleanId, obj);
        return obj;
      }
    }

    if (cleanId === 'STUDY-ROOM-ALPHA') {
      return this.ensureDefaultGroup();
    }

    return undefined;
  }

  public async getStudyGroups(): Promise<StudyGroup[]> {
    this.ensureDefaultGroup();
    if (isDbConnected()) {
      try {
        const docs = await StudyGroupModel.find({}).sort({ createdAt: -1 });
        docs.forEach(doc => {
          const obj = stripDbFields(doc.toObject()) as any;
          this.groups.set(obj.roomId, obj);
        });
      } catch (e) {}
    }
    return Array.from(this.groups.values());
  }

  // --- Study Documents & Notes (Telegram Backed) ---

  public async saveStudyDocument(docData: {
    roomId: string;
    title: string;
    subject: string;
    fileName: string;
    fileSize: number;
    mimeType: string;
    telegramFileId: string;
    telegramMessageId: number;
    uploaderId: string;
    uploaderName: string;
    description?: string;
  }): Promise<StudyDocument> {
    const id = `doc_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const newDoc: StudyDocument = {
      id,
      roomId: docData.roomId.toUpperCase(),
      title: docData.title,
      subject: docData.subject,
      fileName: docData.fileName,
      fileSize: docData.fileSize,
      mimeType: docData.mimeType,
      telegramFileId: docData.telegramFileId,
      telegramMessageId: docData.telegramMessageId,
      uploaderId: docData.uploaderId,
      uploaderName: docData.uploaderName,
      uploadedAt: new Date().toISOString(),
      downloadCount: 0,
      description: docData.description || ''
    };

    this.documents.set(id, newDoc);
    this.saveDocumentsToDisk();

    if (isDbConnected()) {
      await StudyDocumentModel.create(newDoc);
    }

    return newDoc;
  }

  public async getStudyDocuments(roomId?: string, subject?: string): Promise<StudyDocument[]> {
    let docs: StudyDocument[] = [];

    if (isDbConnected()) {
      const filter: any = {};
      if (roomId) filter.roomId = roomId.toUpperCase();
      if (subject && subject !== 'All') filter.subject = subject;
      const dbDocs = await StudyDocumentModel.find(filter).sort({ uploadedAt: -1 });
      docs = dbDocs.map(d => d.toObject() as any);
    } else {
      docs = Array.from(this.documents.values());
      if (roomId) docs = docs.filter(d => d.roomId === roomId.toUpperCase());
      if (subject && subject !== 'All') docs = docs.filter(d => d.subject === subject);
    }

    // The shared sample library is only offered when browsing without a room filter,
    // so a specific study room never shows documents that were never uploaded to it.
    if (docs.length === 0 && !roomId) {
      docs = [
        {
          id: 'doc-sample-math-1',
          title: 'RRB PO 2026: Speed Math & Simplification Tricks',
          fileName: 'RRB_PO_Speed_Math_Formula_Sheet.pdf',
          subject: 'Quantitative Aptitude',
          fileSize: 48500,
          mimeType: 'application/pdf',
          telegramFileId: 'sample-math-rrb',
          telegramMessageId: 1,
          uploaderId: 'system',
          uploaderName: 'StudyOS Exam Faculty',
          uploadedAt: new Date().toISOString(),
          downloadCount: 142,
          description: 'High-speed calculation shortcuts, fraction tables & quadratic sign methods.',
          roomId: 'SAMPLE-LIBRARY'
        },
        {
          id: 'doc-sample-reasoning-1',
          title: 'IBPS PO 2026: Reasoning Puzzles & Syllogism Master Notes',
          fileName: 'IBPS_PO_Reasoning_Puzzles_Handout.pdf',
          subject: 'Reasoning Ability',
          fileSize: 52100,
          mimeType: 'application/pdf',
          telegramFileId: 'sample-reasoning-ibps',
          telegramMessageId: 2,
          uploaderId: 'system',
          uploaderName: 'StudyOS Exam Faculty',
          uploadedAt: new Date().toISOString(),
          downloadCount: 198,
          description: 'Only a few syllogism rules, floor puzzles and circular seating diagrams.',
          roomId: 'SAMPLE-LIBRARY'
        },
        {
          id: 'doc-sample-ga-1',
          title: 'General Awareness & Monthly RBI Banking Capsule',
          fileName: 'RBI_Banking_Current_Affairs_Capsule.pdf',
          subject: 'Current Affairs',
          fileSize: 46200,
          mimeType: 'application/pdf',
          telegramFileId: 'sample-ga-capsule',
          telegramMessageId: 3,
          uploaderId: 'system',
          uploaderName: 'StudyOS Exam Faculty',
          uploadedAt: new Date().toISOString(),
          downloadCount: 89,
          description: 'Monetary policy repo rates, digital banking initiatives & international summits.',
          roomId: 'SAMPLE-LIBRARY'
        }
      ];
    }

    return docs;
  }

  public async getStudyDocumentById(id: string): Promise<StudyDocument | undefined> {
    const inMem = this.documents.get(id);
    if (inMem) return inMem;
    if (isDbConnected()) {
      const doc = await StudyDocumentModel.findOne({ id });
      if (doc) return doc.toObject() as any;
    }
    return undefined;
  }

  public async incrementDocumentDownload(id: string): Promise<void> {
    const doc = this.documents.get(id);
    if (doc) doc.downloadCount = (doc.downloadCount || 0) + 1;
    if (isDbConnected()) {
      await StudyDocumentModel.updateOne({ id }, { $inc: { downloadCount: 1 } });
    }
  }

  // --- Real Dynamic Activity Session Recording ---

  public recordActivitySession(
    userId: string,
    userName: string,
    activityName: string,
    category: 'study' | 'break' | 'personal',
    durationSeconds: number,
    dateKey?: string
  ): ActivitySession {
    const safeDuration = Math.max(0, Math.floor(durationSeconds || 0));
    const session: ActivitySession = {
      id: `session-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      userId,
      userName,
      activityName,
      category,
      durationSeconds: safeDuration,
      startedAt: new Date(Date.now() - safeDuration * 1000).toISOString(),
      endedAt: new Date().toISOString()
    };

    this.activitySessions.push(session);
    this.saveActivitySessionsToDisk();

    if (isDbConnected()) {
      ActivitySessionModel.create(session).catch(e => console.warn('MongoDB session save error:', e.message));
    }

    // Update real user statistics
    const user = this.users.get(userId);
    if (user) {
      if (category === 'study') {
        const addedHours = +(safeDuration / 3600).toFixed(2);
        user.totalStudyHours = +(user.totalStudyHours + addedHours).toFixed(2);
        
        // 5 XP per full minute of real studying (minimum 60s)
        const earnedXp = safeDuration >= 60 ? Math.floor(safeDuration / 60) * 5 : 0;
        user.xp += earnedXp;
        // 1 coin per 5 minutes of study (minimum 300s)
        const earnedCoins = safeDuration >= 300 ? Math.floor(safeDuration / 300) : 0;
        user.coins += earnedCoins;
        user.level = Math.floor(user.xp / 400) + 1;

        // Update Today's real calendar entry (per user)
        const todayDate = dateKey || localDateKey();
        let todayRecord = this.calendarHistory.find(r => r.date === todayDate && r.userId === userId);
        const isFirstSessionToday = !todayRecord || todayRecord.hoursStudied === 0;

        if (isFirstSessionToday) {
          const d = dateKey ? new Date(dateKey + 'T12:00:00') : new Date();
          const yesterday = new Date(d);
          yesterday.setDate(yesterday.getDate() - 1);
          const yesterdayDate = localDateKey(yesterday);

          const studiedYesterday = this.calendarHistory.some(
            r => r.userId === userId && r.date === yesterdayDate && r.hoursStudied > 0
          ) || this.activitySessions.some(
            s => s.userId === userId && s.category === 'study' && s.startedAt && localDateKey(new Date(s.startedAt)) === yesterdayDate
          );

          if (studiedYesterday) {
            user.streak = (user.streak || 0) + 1;
          } else {
            user.streak = 1;
          }
          user.bestStreak = Math.max(user.bestStreak || 0, user.streak);
        }

        if (!todayRecord) {
          todayRecord = {
            date: todayDate,
            hoursStudied: 0,
            deepFocusHours: 0,
            subjects: [],
            tasksDone: 0,
            tasksPlanned: 1,
            status: 'moderate',
            userId
          };
          this.calendarHistory.push(todayRecord);
        }

        todayRecord.hoursStudied = +(todayRecord.hoursStudied + addedHours).toFixed(2);
        todayRecord.deepFocusHours = +(todayRecord.deepFocusHours + addedHours * 0.9).toFixed(2);
        if (!todayRecord.subjects.includes(activityName)) {
          todayRecord.subjects.push(activityName);
        }
        todayRecord.status = todayRecord.hoursStudied >= 4 ? 'strong' : todayRecord.hoursStudied >= 1.5 ? 'moderate' : 'weak';

        this.saveCalendarToDisk();

        if (isDbConnected()) {
          CalendarRecordModel.findOneAndUpdate(
            { date: todayDate, userId },
            { $set: stripDbFields(todayRecord) },
            { upsert: true }
          ).catch(() => {});
        }
      }

      user.currentActivity = category === 'break' ? '☕ Break Finished' : 'Idle 💤';
      user.activityStartTime = null;
      this.saveUsersToDisk();

      if (isDbConnected()) {
        UserModel.findOneAndUpdate({ id: userId }, { $set: stripDbFields(user) }).catch(() => {});
      }
    }

    return session;
  }

  public getActivitySessions(userId?: string): ActivitySession[] {
    if (userId) {
      return this.activitySessions.filter(s => s.userId === userId);
    }
    return this.activitySessions;
  }

  public getUserDailyActivitySummary(userId: string, dateKey?: string): {
    userId: string;
    userName: string;
    todayStudySeconds: number;
    todayHours: number;
    sessionCount: number;
    subjectBreakdown: Record<string, number>;
  } {
    const todayDate = dateKey || localDateKey();
    // startedAt is stored as a UTC ISO string, so it must be converted back to
    // the local calendar day before comparing with the local date key.
    const userSessions = this.activitySessions.filter(s =>
      s.userId === userId && s.startedAt && localDateKey(new Date(s.startedAt)) === todayDate
    );

    let todayStudySeconds = 0;
    const subjectBreakdown: Record<string, number> = {};

    userSessions.forEach(s => {
      if (s.category === 'study') {
        todayStudySeconds += s.durationSeconds;
      }
      subjectBreakdown[s.activityName] = (subjectBreakdown[s.activityName] || 0) + s.durationSeconds;
    });

    const user = this.users.get(userId);
    return {
      userId,
      userName: user?.name || user?.username || 'Student',
      todayStudySeconds,
      todayHours: +(todayStudySeconds / 3600).toFixed(2),
      sessionCount: userSessions.length,
      subjectBreakdown
    };
  }

  // --- Real-time Video, Chat & Tools ---

  public getVideoState(roomId: string): VideoSyncState {
    let state = this.videoStates.get(roomId);
    if (!state) {
      state = {
        roomId,
        videoUrl: 'https://www.youtube.com/watch?v=k7YS_P_t3uA',
        videoId: 'k7YS_P_t3uA',
        isPlaying: false,
        currentTime: 0,
        playbackRate: 1,
        lastUpdated: Date.now(),
        updatedBy: 'System'
      };
      this.videoStates.set(roomId, state);
    }
    return state;
  }

  public updateVideoState(roomId: string, stateUpdate: Partial<VideoSyncState>): VideoSyncState {
    const current = this.getVideoState(roomId);
    const updated: VideoSyncState = {
      ...current,
      ...stateUpdate,
      lastUpdated: Date.now()
    };
    this.videoStates.set(roomId, updated);
    return updated;
  }

  public getRoomChat(roomId: string): ChatMessage[] {
    return this.roomChats.get(roomId) || [];
  }

  public addChatMessage(roomId: string, message: ChatMessage): ChatMessage {
    const chats = this.getRoomChat(roomId);
    chats.push(message);
    this.roomChats.set(roomId, chats);
    return message;
  }

  public getWhiteboard(roomId: string): WhiteboardElement[] {
    return this.whiteboardElements.get(roomId) || [];
  }

  public saveWhiteboardElement(roomId: string, element: WhiteboardElement): WhiteboardElement {
    const list = this.getWhiteboard(roomId);
    list.push(element);
    this.whiteboardElements.set(roomId, list);

    if (isDbConnected()) {
      WhiteboardModel.create({ roomId, ...element }).catch(() => {});
    }
    return element;
  }

  public clearWhiteboard(roomId: string): void {
    this.whiteboardElements.set(roomId, []);
    if (isDbConnected()) {
      WhiteboardModel.deleteMany({ roomId }).catch(() => {});
    }
  }

  public getNote(roomId: string): SharedNote {
    let note = this.notes.get(roomId);
    if (!note) {
      note = {
        id: `note-${roomId}`,
        roomId,
        title: 'Collaborative Notes',
        content: '# Collaborative Study Room Notes 📝\n\nStart typing notes together...',
        lastModifiedBy: 'You',
        lastModifiedAt: new Date().toISOString()
      };
      this.notes.set(roomId, note);
    }
    return note;
  }

  public updateNote(roomId: string, content: string, modifiedBy: string): SharedNote {
    const note = this.getNote(roomId);
    note.content = content;
    note.lastModifiedBy = modifiedBy;
    note.lastModifiedAt = new Date().toISOString();
    this.notes.set(roomId, note);
    this.saveNotesToDisk();

    if (isDbConnected()) {
      SharedNoteModel.findOneAndUpdate(
        { roomId },
        { $set: stripDbFields(note) },
        { upsert: true }
      ).catch(() => {});
    }
    return note;
  }

  public getTasks(userId?: string): StudyTask[] {
    if (!userId) return this.tasks;
    // Legacy tasks created before per-user isolation stay visible to everyone.
    return this.tasks.filter(t => !t.userId || t.userId === userId);
  }

  public addTask(task: StudyTask): StudyTask {
    this.tasks.unshift(task);
    this.saveTasksToDisk();
    if (isDbConnected()) {
      TaskModel.create(task).catch(() => {});
    }
    return task;
  }

  public toggleTask(id: string, completedBy?: { userId?: string; userName?: string }): StudyTask | undefined {
    const task = this.tasks.find(t => t.id === id);
    if (!task) return undefined;

    const wasCompleted = task.completed;
    task.completed = !wasCompleted;

    const userId = completedBy?.userId;
    const user = userId ? this.users.get(userId) : undefined;

    // Reward only on the pending -> completed transition, and always revoke from
    // the user who actually received the reward. Combined with the ownership
    // check this means nobody can farm XP by toggling someone else's task.
    if (task.completed) {
      const isOwner = !task.userId || task.userId === userId;
      if (user && isOwner && !task.rewardedUserId) {
        user.xp += 50;
        user.coins += 10;
        user.tasksCompleted += 1;
        user.level = Math.floor(user.xp / 400) + 1;
        task.rewardedUserId = userId;
        this.persistUserStats(user.id);
      }
    } else if (task.rewardedUserId) {
      const recipient = this.users.get(task.rewardedUserId);
      if (recipient) {
        recipient.xp = Math.max(0, recipient.xp - 50);
        recipient.coins = Math.max(0, recipient.coins - 10);
        recipient.tasksCompleted = Math.max(0, recipient.tasksCompleted - 1);
        recipient.level = Math.floor(recipient.xp / 400) + 1;
        this.persistUserStats(recipient.id);
      }
      task.rewardedUserId = undefined;
    }

    this.saveTasksToDisk();

    if (isDbConnected()) {
      TaskModel.findOneAndUpdate(
        { id },
        { $set: { completed: task.completed, rewardedUserId: task.rewardedUserId || '' } }
      ).catch(() => {});
    }

    return task;
  }

  private persistUserStats(userId: string): void {
    const user = this.users.get(userId);
    if (!user) return;
    this.saveUsersToDisk();
    if (!isDbConnected()) return;
    UserModel.findOneAndUpdate(
      { id: userId },
      { $set: { xp: user.xp, coins: user.coins, tasksCompleted: user.tasksCompleted, level: user.level } }
    ).catch(() => {});
  }

  public getCalendarHistory(userId?: string): CalendarDayRecord[] {
    if (userId) return this.calendarHistory.filter(r => r.userId === userId);
    return this.calendarHistory;
  }

  public getFlashcards(): Flashcard[] {
    return this.flashcards;
  }

  public addFlashcard(card: Flashcard): Flashcard {
    const existingIdx = this.flashcards.findIndex(c => c.id === card.id || (c.front === card.front && c.subject === card.subject));
    if (existingIdx !== -1) {
      this.flashcards[existingIdx] = { ...this.flashcards[existingIdx], ...card };
      this.saveFlashcardsToDisk();
      return this.flashcards[existingIdx];
    }
    this.flashcards.unshift(card);
    this.saveFlashcardsToDisk();
    return card;
  }

  public addFlashcards(cards: Flashcard[]): Flashcard[] {
    const added: Flashcard[] = [];
    for (const card of cards) {
      if (!card.front || !card.back) continue;
      const existing = this.flashcards.find(c => c.id === card.id || (c.front === card.front && c.subject === card.subject));
      if (!existing) {
        this.flashcards.unshift(card);
        added.push(card);
      }
    }
    if (added.length) {
      this.saveFlashcardsToDisk();
    }
    return this.flashcards;
  }

  public updateFlashcardMastery(id: string, level: 'learning' | 'reviewing' | 'mastered'): Flashcard | undefined {
    const card = this.flashcards.find(c => c.id === id);
    if (card) {
      card.masteryLevel = level;
      card.lastReviewed = new Date().toISOString();
      this.saveFlashcardsToDisk();
    }
    return card;
  }

  public getQuizBank(): QuizQuestion[] {
    return this.quizBank;
  }

  public getLeaderboards(filter: 'Friends' | 'Study Room' | 'College' | 'City' | 'Country' | 'Global', userId?: string): LeaderboardEntry[] {
    // Build real leaderboard strictly from registered users!
    const me = userId ? this.users.get(userId) : undefined;
    let realUsers = Array.from(this.users.values());

    // Scope the board to the requester's own college / city / country when asked.
    // 'Friends' and 'Study Room' have no relationship model yet, so they fall back to Global.
    if (filter === 'College') {
      realUsers = me?.college
        ? realUsers.filter(u => u.college && u.college === me.college)
        : realUsers.filter(u => Boolean(u.college));
    } else if (filter === 'City') {
      realUsers = me?.city
        ? realUsers.filter(u => u.city && u.city === me.city)
        : realUsers.filter(u => Boolean(u.city));
    } else if (filter === 'Country') {
      realUsers = me?.country
        ? realUsers.filter(u => u.country && u.country === me.country)
        : realUsers.filter(u => Boolean(u.country));
    }

    realUsers.sort((a, b) => b.xp - a.xp || b.totalStudyHours - a.totalStudyHours);

    return realUsers.map((u, idx) => ({
      rank: idx + 1,
      id: u.id,
      name: u.name,
      avatar: u.avatar,
      college: u.college,
      city: u.city,
      country: u.country,
      studyHours: u.totalStudyHours,
      focusScore: u.focusScore || 95,
      consistency: u.streak > 0 ? 100 : 0,
      completedTasks: u.tasksCompleted || 0,
      xp: u.xp,
      accuracy: u.accuracy || 90,
      compositeScore: Math.round(u.xp * 0.4 + u.totalStudyHours * 10),
      tier: u.xp >= 1000 ? 'Diamond' : u.xp >= 500 ? 'Platinum' : u.xp >= 200 ? 'Gold' : 'Bronze'
    }));
  }

  public getAnalyticsSummary(userId?: string) {
    const targetUser = userId ? this.users.get(userId) : Array.from(this.users.values())[0];
    const sessions = targetUser
      ? this.activitySessions.filter(s => s.userId === targetUser.id && s.category === 'study')
      : this.activitySessions.filter(s => s.category === 'study');

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const weekStart = now.getTime() - 7 * 24 * 60 * 60 * 1000;
    const monthStart = now.getTime() - 30 * 24 * 60 * 60 * 1000;

    const subjectMap = new Map<string, number>();
    let totalSeconds = 0;
    let todaySeconds = 0;
    let weeklySeconds = 0;
    let monthlySeconds = 0;

    sessions.forEach(s => {
      totalSeconds += s.durationSeconds;
      const sessionTime = new Date(s.startedAt || s.endedAt || Date.now()).getTime();
      if (sessionTime >= todayStart) {
        todaySeconds += s.durationSeconds;
      }
      if (sessionTime >= weekStart) {
        weeklySeconds += s.durationSeconds;
      }
      if (sessionTime >= monthStart) {
        monthlySeconds += s.durationSeconds;
      }
      const current = subjectMap.get(s.activityName) || 0;
      subjectMap.set(s.activityName, current + s.durationSeconds / 3600);
    });

    const totalHours = +(totalSeconds / 3600).toFixed(2);
    const todayHours = +(todaySeconds / 3600).toFixed(2);
    const weeklyHours = +(weeklySeconds / 3600).toFixed(2);
    const monthlyHours = +(monthlySeconds / 3600).toFixed(2);
    const quantHours = +(subjectMap.get('📐 Quantitative Aptitude (Quant)') || 0).toFixed(1);
    const reasoningHours = +(subjectMap.get('🧩 Reasoning Ability (Puzzles)') || 0).toFixed(1);
    const gaHours = +(subjectMap.get('🌍 General Awareness & Current Affairs') || 0).toFixed(1);
    const englishHours = +(subjectMap.get('📖 English Language (Reading & Cloze)') || 0).toFixed(1);

    const distribution = Array.from(subjectMap.entries()).map(([name, hrs]) => ({
      subject: name,
      hours: +hrs.toFixed(1),
      percentage: totalHours > 0 ? Math.round((hrs / totalHours) * 100) : 0,
      color: name.includes('Quant') ? '#6366f1' : name.includes('Reasoning') ? '#06b6d4' : name.includes('Awareness') ? '#10b981' : '#f59e0b'
    }));

    return {
      todayHours,
      weeklyHours,
      monthlyHours,
      deepFocusHours: +(totalHours * 0.85).toFixed(2),
      breakFrequencyAvgMinutes: 0,
      longestSessionMinutes: sessions.length > 0 ? Math.round(Math.max(...sessions.map(s => s.durationSeconds)) / 60) : 0,
      averageSessionMinutes: sessions.length > 0 ? Math.round(totalSeconds / sessions.length / 60) : 0,
      tasksCompleted: targetUser?.tasksCompleted || 0,
      tasksMissed: targetUser?.tasksMissed || 0,
      bestStudyTime: sessions.length > 0 ? 'Peak Active Hours' : 'Start studying to discover peak focus time',
      mostProductiveSubject: distribution.length > 0 ? distribution[0].subject : 'No sessions yet',
      leastStudiedSubject: distribution.length > 1 ? distribution[distribution.length - 1].subject : 'N/A',
      weakestTopic: 'Record quizzes to predict weak topics',
      strongestTopic: 'Record quizzes to identify strongest topics',
      subjectDistribution: distribution.length > 0 ? distribution : [
        { subject: 'Quantitative Aptitude', hours: 0, percentage: 0, color: '#6366f1' },
        { subject: 'Reasoning Ability', hours: 0, percentage: 0, color: '#06b6d4' }
      ]
    };
  }

  public addMockTestRecord(record: Omit<MockTestRecord, 'id' | 'createdAt'>): MockTestRecord {
    const newRecord: MockTestRecord = {
      ...record,
      id: `mock-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      createdAt: new Date().toISOString()
    };
    this.mockTestRecords.unshift(newRecord);
    this.saveMockTestRecordsToDisk();

    // Reward XP and coins for completing a mock test
    const user = this.users.get(record.userId);
    if (user) {
      user.xp = (user.xp || 0) + 150;
      user.coins = (user.coins || 0) + 25;
      if (record.accuracy) {
        user.accuracy = Math.round(user.accuracy ? (user.accuracy + record.accuracy) / 2 : record.accuracy);
      }
      this.users.set(user.id, user);
      this.saveUsersToDisk();
    }

    return newRecord;
  }

  public getMockTestRecords(userId?: string): MockTestRecord[] {
    if (userId) {
      return this.mockTestRecords.filter(m => m.userId === userId);
    }
    return this.mockTestRecords;
  }
}

export const storage = new StorageService();
