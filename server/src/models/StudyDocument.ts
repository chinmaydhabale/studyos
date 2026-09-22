import mongoose, { Schema, Document } from 'mongoose';

export interface IStudyDocumentModel extends Document {
  id: string;
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
  uploadedAt: Date;
  downloadCount: number;
  description?: string;
}

const StudyDocumentSchema = new Schema<IStudyDocumentModel>({
  id: { type: String, required: true, unique: true, index: true },
  roomId: { type: String, required: true, index: true },
  title: { type: String, required: true },
  subject: { type: String, required: true, default: 'Quantitative Aptitude' },
  fileName: { type: String, required: true },
  fileSize: { type: Number, required: true },
  mimeType: { type: String, default: 'application/octet-stream' },
  telegramFileId: { type: String, required: true },
  telegramMessageId: { type: Number, required: true },
  uploaderId: { type: String, required: true },
  uploaderName: { type: String, required: true },
  uploadedAt: { type: Date, default: Date.now },
  downloadCount: { type: Number, default: 0 },
  description: { type: String, default: '' }
});

export const StudyDocumentModel = mongoose.model<IStudyDocumentModel>('StudyDocument', StudyDocumentSchema);
