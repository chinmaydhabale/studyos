import mongoose, { Schema, Document } from 'mongoose';

export interface IUserDocument extends Document {
  id: string;
  username: string;
  passwordHash: string;
  salt: string;
  name: string;
  avatar: string;
  targetExam: string;
  college: string;
  city: string;
  country: string;
  xp: number;
  level: number;
  coins: number;
  streak: number;
  bestStreak: number;
  totalStudyHours: number;
  focusScore: number;
  accuracy: number;
  tasksCompleted: number;
  tasksMissed: number;
  badges: string[];
  status: string;
  currentActivity?: string;
  activityCategory?: string;
  activityStartTime?: number | null;
  updatedAt: Date;
}

const UserSchema = new Schema<IUserDocument>({
  id: { type: String, required: true, unique: true, index: true },
  username: { type: String, unique: true, sparse: true, index: true, lowercase: true, trim: true },
  passwordHash: { type: String, default: '' },
  salt: { type: String, default: '' },
  name: { type: String, required: true },
  avatar: { type: String, default: '' },
  targetExam: { type: String, default: 'RRB PO & IBPS PO' },
  college: { type: String, default: 'Competitive Aspirant' },
  city: { type: String, default: 'New Delhi' },
  country: { type: String, default: 'India' },
  xp: { type: Number, default: 0 },
  level: { type: Number, default: 1 },
  coins: { type: Number, default: 50 },
  streak: { type: Number, default: 1 },
  bestStreak: { type: Number, default: 1 },
  totalStudyHours: { type: Number, default: 0 },
  focusScore: { type: Number, default: 90 },
  accuracy: { type: Number, default: 85 },
  tasksCompleted: { type: Number, default: 0 },
  tasksMissed: { type: Number, default: 0 },
  badges: { type: [String], default: ['⚡ New Scholar'] },
  status: { type: String, default: 'Ready to Study' },
  currentActivity: { type: String, default: 'Ready to Study' },
  activityCategory: { type: String, default: 'study' },
  activityStartTime: { type: Number, default: null },
  updatedAt: { type: Date, default: Date.now }
});

export const UserModel = mongoose.model<IUserDocument>('User', UserSchema);
