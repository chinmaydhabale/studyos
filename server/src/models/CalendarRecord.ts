import mongoose, { Schema, Document } from 'mongoose';

export interface ICalendarRecordDocument extends Document {
  date: string;
  hoursStudied: number;
  deepFocusHours: number;
  subjects: string[];
  tasksDone: number;
  tasksPlanned: number;
  status: 'strong' | 'moderate' | 'weak' | 'missed';
  userId?: string;
  updatedAt: Date;
}

const CalendarRecordSchema = new Schema<ICalendarRecordDocument>({
  date: { type: String, required: true, unique: true, index: true },
  hoursStudied: { type: Number, default: 0 },
  deepFocusHours: { type: Number, default: 0 },
  subjects: { type: [String], default: [] },
  tasksDone: { type: Number, default: 0 },
  tasksPlanned: { type: Number, default: 2 },
  status: { type: String, enum: ['strong', 'moderate', 'weak', 'missed'], default: 'moderate' },
  userId: { type: String, default: 'user_self' },
  updatedAt: { type: Date, default: Date.now }
});

export const CalendarRecordModel = mongoose.model<ICalendarRecordDocument>('CalendarRecord', CalendarRecordSchema);
