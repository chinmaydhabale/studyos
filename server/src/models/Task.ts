import mongoose, { Schema, Document } from 'mongoose';

export interface ITaskDocument extends Document {
  id: string;
  userId?: string;
  title: string;
  subject: string;
  durationMinutes: number;
  targetDate: string;
  completed: boolean;
  isAiGenerated: boolean;
  scheduledTime?: string;
  createdAt: Date;
}

const TaskSchema = new Schema<ITaskDocument>({
  id: { type: String, required: true, unique: true, index: true },
  userId: { type: String, default: '', index: true },
  title: { type: String, required: true },
  subject: { type: String, required: true },
  durationMinutes: { type: Number, default: 30 },
  targetDate: { type: String, required: true },
  completed: { type: Boolean, default: false },
  isAiGenerated: { type: Boolean, default: false },
  scheduledTime: { type: String, default: '09:00 AM' },
  createdAt: { type: Date, default: Date.now }
});

export const TaskModel = mongoose.model<ITaskDocument>('Task', TaskSchema);
