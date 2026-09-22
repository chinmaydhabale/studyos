import mongoose, { Schema, Document } from 'mongoose';

export interface IStudyGroupDocument extends Document {
  roomId: string;
  name: string;
  description?: string;
  targetExam: string;
  creatorId: string;
  creatorName: string;
  memberCount: number;
  voicePassword?: string;
  isPrivate: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const StudyGroupSchema = new Schema<IStudyGroupDocument>({
  roomId: { type: String, required: true, unique: true, index: true, uppercase: true, trim: true },
  name: { type: String, required: true },
  description: { type: String, default: '' },
  targetExam: { type: String, default: 'RRB PO & IBPS PO' },
  creatorId: { type: String, required: true },
  creatorName: { type: String, required: true },
  memberCount: { type: Number, default: 1 },
  voicePassword: { type: String, default: 'study123' },
  isPrivate: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

export const StudyGroupModel = mongoose.model<IStudyGroupDocument>('StudyGroup', StudyGroupSchema);
