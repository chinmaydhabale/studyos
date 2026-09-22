import mongoose, { Schema, Document } from 'mongoose';

export interface ISharedNoteDocument extends Document {
  id: string;
  roomId: string;
  title: string;
  content: string;
  lastModifiedBy: string;
  lastModifiedAt: string;
  updatedAt: Date;
}

const SharedNoteSchema = new Schema<ISharedNoteDocument>({
  id: { type: String, required: true },
  roomId: { type: String, required: true, unique: true, index: true },
  title: { type: String, default: 'Collaborative Notes' },
  content: { type: String, default: '' },
  lastModifiedBy: { type: String, default: 'Student' },
  lastModifiedAt: { type: String, default: () => new Date().toISOString() },
  updatedAt: { type: Date, default: Date.now }
});

export const SharedNoteModel = mongoose.model<ISharedNoteDocument>('SharedNote', SharedNoteSchema);
