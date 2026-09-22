import mongoose, { Schema, Document } from 'mongoose';

export interface IActivitySessionDocument extends Document {
  id: string;
  userId: string;
  userName: string;
  activityName: string;
  category: 'study' | 'break' | 'personal';
  durationSeconds: number;
  startedAt: string;
  endedAt: string;
  createdAt: Date;
}

const ActivitySessionSchema = new Schema<IActivitySessionDocument>({
  id: { type: String, required: true, unique: true, index: true },
  userId: { type: String, required: true, index: true },
  userName: { type: String, required: true },
  activityName: { type: String, required: true },
  category: { type: String, enum: ['study', 'break', 'personal'], default: 'study' },
  durationSeconds: { type: Number, required: true },
  startedAt: { type: String, required: true },
  endedAt: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

export const ActivitySessionModel = mongoose.model<IActivitySessionDocument>('ActivitySession', ActivitySessionSchema);
