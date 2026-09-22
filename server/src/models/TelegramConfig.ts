import mongoose, { Schema, Document } from 'mongoose';

export interface ITelegramConfigDocument extends Document {
  key: string;
  botToken: string;
  channelId: string;
  channelTitle?: string;
  isConfigured: boolean;
  lastSyncAt: Date;
}

const TelegramConfigSchema = new Schema<ITelegramConfigDocument>({
  key: { type: String, required: true, unique: true, default: 'primary' },
  botToken: { type: String, required: true },
  channelId: { type: String, default: '' },
  channelTitle: { type: String, default: '' },
  isConfigured: { type: Boolean, default: false },
  lastSyncAt: { type: Date, default: Date.now }
});

export const TelegramConfigModel = mongoose.model<ITelegramConfigDocument>('TelegramConfig', TelegramConfigSchema);
