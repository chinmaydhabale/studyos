import mongoose, { Schema, Document } from 'mongoose';

export interface IMovieRecordModel extends Document {
  id: string;
  roomId: string;
  title: string;
  filename: string;
  originalName: string;
  fileSize: number;
  fileSizeFormatted: string;
  mimeType: string;
  durationSeconds?: number;
  durationFormatted?: string;
  uploadedBy: string;
  uploaderId: string;
  createdAt: string;
  streamUrl: string;
}

const MovieRecordSchema = new Schema<IMovieRecordModel>({
  id: { type: String, required: true, unique: true, index: true },
  roomId: { type: String, required: true, index: true },
  title: { type: String, required: true },
  filename: { type: String, required: true },
  originalName: { type: String, required: true },
  fileSize: { type: Number, required: true },
  fileSizeFormatted: { type: String, required: true },
  mimeType: { type: String, default: 'video/mp4' },
  durationSeconds: { type: Number, default: 0 },
  durationFormatted: { type: String, default: '0m' },
  uploadedBy: { type: String, required: true },
  uploaderId: { type: String, required: true },
  createdAt: { type: String, default: () => new Date().toISOString() },
  streamUrl: { type: String, required: true }
});

export const MovieRecordModel = mongoose.model<IMovieRecordModel>('MovieRecord', MovieRecordSchema);
