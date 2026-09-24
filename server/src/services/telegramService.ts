import dotenv from 'dotenv';
dotenv.config();

import { TelegramConfigModel } from '../models/TelegramConfig.js';
import { isDbConnected } from '../db.js';
import { storage } from './storageService.js';

export class TelegramService {
  private botToken: string = process.env.TELEGRAM_BOT_TOKEN || '';
  private channelId: string = process.env.TELEGRAM_CHANNEL_ID || '';
  private channelTitle: string = '';
  private isConfigured: boolean = Boolean(process.env.TELEGRAM_CHANNEL_ID);

  constructor() {
    // Loaded on startup
  }

  public getBotToken(): string {
    return this.botToken || process.env.TELEGRAM_BOT_TOKEN || '';
  }

  public getChannelId(): string {
    return this.channelId || process.env.TELEGRAM_CHANNEL_ID || '';
  }

  public async init() {
    const envToken = process.env.TELEGRAM_BOT_TOKEN || '';
    const envChannel = process.env.TELEGRAM_CHANNEL_ID || '';

    if (envToken && !this.botToken) {
      this.botToken = envToken;
    }
    if (envChannel && !this.channelId) {
      this.channelId = envChannel;
      this.isConfigured = true;
    }

    if (!isDbConnected()) return;
    try {
      let config = await TelegramConfigModel.findOne({ key: 'primary' });
      if (!config) {
        config = await TelegramConfigModel.create({
          key: 'primary',
          botToken: this.botToken || envToken,
          channelId: this.channelId || envChannel,
          channelTitle: this.channelTitle || (envChannel ? 'Study Channel' : ''),
          isConfigured: Boolean(this.channelId || envChannel),
          lastSyncAt: new Date()
        });
      }

      this.botToken = config.botToken || envToken || this.botToken;
      this.channelId = config.channelId || envChannel || this.channelId;
      this.channelTitle = config.channelTitle || (this.channelId ? 'Study Channel' : '');
      this.isConfigured = Boolean(this.channelId);

      // If database was empty or missing fields from env, sync them up
      if ((!config.botToken && this.botToken) || (!config.channelId && this.channelId)) {
        await TelegramConfigModel.updateOne(
          { key: 'primary' },
          { $set: { botToken: this.botToken, channelId: this.channelId, channelTitle: this.channelTitle, isConfigured: this.isConfigured } }
        ).catch(() => {});
      }

      console.log(`📡 Telegram Storage Service initialized. Configured: ${this.isConfigured} (Channel: ${this.channelId || 'Not set'})`);
    } catch (err: any) {
      console.warn('Failed to load Telegram config:', err.message);
    }
  }

  public getStatus() {
    const token = this.getBotToken();
    const chId = this.getChannelId();
    const botUser = process.env.TELEGRAM_BOT_USERNAME || 'studyosprobot';
    return {
      botUsername: botUser,
      botToken: token ? `${token.substring(0, 10)}...` : 'Not Set',
      channelId: chId,
      channelTitle: this.channelTitle || (chId ? 'Study Channel' : ''),
      isConfigured: Boolean(chId)
    };
  }

  // Scan Telegram getUpdates to automatically capture channel ID from forward/post
  public async detectChannelFromUpdates(roomId?: string): Promise<{ success: boolean; channelId?: string; channelTitle?: string; message: string }> {
    try {
      const token = this.getBotToken();
      if (!token) {
        return {
          success: false,
          message: 'Telegram Bot Token is not configured. Please set TELEGRAM_BOT_TOKEN in .env'
        };
      }

      // Request all channel posts and chat member events
      const res = await fetch(`https://api.telegram.org/bot${token}/getUpdates?allowed_updates=["message","edited_message","channel_post","edited_channel_post","my_chat_member","chat_member"]`);
      const data = (await res.json()) as any;

      if (!data.ok) {
        return { success: false, message: data.description || 'Failed to reach Telegram API' };
      }

      const updates = data.result || [];
      let detectedId = '';
      let detectedTitle = '';

      if (updates.length > 0) {
        // Loop backwards to get the freshest update
        for (let i = updates.length - 1; i >= 0; i--) {
          const u = updates[i];

          // Case 1: Modern Telegram forward origin from channel
          if (u.message?.forward_origin?.chat?.id) {
            detectedId = String(u.message.forward_origin.chat.id);
            detectedTitle = u.message.forward_origin.chat.title || 'Forwarded Channel';
            break;
          }

          // Case 2: Message posted inside the channel
          if (u.channel_post?.chat?.id) {
            detectedId = String(u.channel_post.chat.id);
            detectedTitle = u.channel_post.chat.title || 'Private Study Channel';
            break;
          }

          // Case 3: Channel post sender chat
          if (u.channel_post?.sender_chat?.id) {
            detectedId = String(u.channel_post.sender_chat.id);
            detectedTitle = u.channel_post.sender_chat.title || 'Private Study Channel';
            break;
          }

          // Case 4: Legacy forwarded message from channel to bot
          if (u.message?.forward_from_chat?.id) {
            detectedId = String(u.message.forward_from_chat.id);
            detectedTitle = u.message.forward_from_chat.title || 'Forwarded Channel';
            break;
          }

          // Case 5: Bot added to channel or group as admin
          if (u.my_chat_member?.chat?.id) {
            detectedId = String(u.my_chat_member.chat.id);
            detectedTitle = u.my_chat_member.chat.title || 'Admin Channel';
            break;
          }

          // Case 6: Message sender_chat
          if (u.message?.sender_chat?.id && (u.message.sender_chat.type === 'channel' || u.message.sender_chat.type === 'supergroup')) {
            detectedId = String(u.message.sender_chat.id);
            detectedTitle = u.message.sender_chat.title || 'Study Channel';
            break;
          }

          // Case 7: Message from supergroup or chat
          if (u.message?.chat?.id && (u.message.chat.type === 'channel' || u.message.chat.type === 'supergroup')) {
            detectedId = String(u.message.chat.id);
            detectedTitle = u.message.chat.title || 'Study Channel';
            break;
          }
        }
      }

      // Fallback: If updates array did not contain a channel, check env TELEGRAM_CHANNEL_ID
      if (!detectedId) {
        const envChannelId = this.getChannelId();
        if (envChannelId) {
          detectedId = envChannelId;
          detectedTitle = 'Study Channel';
        }
      }

      if (!detectedId) {
        return {
          success: false,
          message: 'No channel posts found in Telegram. Please post a message (e.g. "test") directly in your channel where @studyosprobot is admin, or enter the Channel ID manually.'
        };
      }

      // Save to database permanently
      await this.setChannelConfig(detectedId, detectedTitle);

      // Automatically sync existing PDF documents from the channel into the
      // room that triggered the detection, so they are not stranded elsewhere.
      await this.syncDocumentsFromUpdates(roomId).catch(() => {});

      return {
        success: true,
        channelId: detectedId,
        channelTitle: this.channelTitle || detectedTitle,
        message: `Successfully connected to channel: "${this.channelTitle || detectedTitle}" (${detectedId})`
      };
    } catch (err: any) {
      return { success: false, message: err.message || 'Telegram detection failed' };
    }
  }

  // Set channel manually or after detection and persist to MongoDB
  public async setChannelConfig(channelId: string, channelTitle?: string) {
    let cleanId = channelId.trim();

    // If user pasted Telegram Web URL like https://web.telegram.org/a/#-1002345678901 or /k/#...
    if (cleanId.includes('/#')) {
      const parts = cleanId.split('/#');
      cleanId = parts[1].split('/')[0].split('?')[0];
    } else if (cleanId.includes('t.me/c/')) {
      const match = cleanId.match(/t\.me\/c\/(\d+)/);
      if (match) cleanId = `-100${match[1]}`;
    }

    // If user entered numbers without -100 prefix
    if (/^\d{9,12}$/.test(cleanId)) {
      cleanId = `-100${cleanId}`;
    }

    let realTitle = channelTitle || 'Private Study Storage';
    try {
      const token = this.getBotToken();
      if (token) {
        const chatRes = await fetch(`https://api.telegram.org/bot${token}/getChat?chat_id=${cleanId}`);
        const chatData = (await chatRes.json()) as any;
        if (chatData.ok && chatData.result?.title) {
          realTitle = chatData.result.title;
        }
      }
    } catch (e) {}

    this.channelId = cleanId;
    this.channelTitle = realTitle;
    this.isConfigured = Boolean(this.channelId);

    if (isDbConnected()) {
      try {
        await TelegramConfigModel.findOneAndUpdate(
          { key: 'primary' },
          {
            botToken: this.getBotToken(),
            channelId: this.channelId,
            channelTitle: this.channelTitle,
            isConfigured: this.isConfigured,
            lastSyncAt: new Date()
          },
          { upsert: true, returnDocument: 'after' }
        );
      } catch (err: any) {
        console.warn('Failed to persist Telegram config:', err.message);
      }
    }

    return {
      channelId: this.channelId,
      channelTitle: this.channelTitle,
      isConfigured: this.isConfigured
    };
  }

  // Scan channel updates and import all PDF documents into the Study Vault
  public async syncDocumentsFromUpdates(roomId: string = 'RRB-7949'): Promise<{ success: boolean; syncedCount: number; message: string }> {
    try {
      const token = this.getBotToken();
      if (!token) {
        return { success: false, syncedCount: 0, message: 'Bot token not set' };
      }

      const targetRoomId = (roomId || 'RRB-7949').trim().toUpperCase();
      const res = await fetch(`https://api.telegram.org/bot${token}/getUpdates?allowed_updates=["message","edited_message","channel_post","edited_channel_post"]`);
      const data = (await res.json()) as any;
      if (!data.ok) {
        return { success: false, syncedCount: 0, message: data.description || 'Failed to fetch Telegram updates' };
      }

      const updates = data.result || [];
      let syncedCount = 0;

      for (const u of updates) {
        const post = u.channel_post || u.message;
        if (!post) continue;

        const doc = post.document;
        if (doc && (doc.mime_type === 'application/pdf' || (doc.file_name && doc.file_name.toLowerCase().endsWith('.pdf')))) {
          // Dedupe inside the destination room only — a document already
          // imported elsewhere must still be importable into this room.
          const existingDocs = await storage.getStudyDocuments(targetRoomId);
          const alreadyExists = existingDocs.some(d => d.telegramFileId === doc.file_id || d.fileName === doc.file_name);
          if (!alreadyExists) {
            const cleanTitle = (doc.file_name || 'Study Notes').replace(/\.pdf$/i, '').replace(/_/g, ' ');
            await storage.saveStudyDocument({
              roomId: targetRoomId,
              title: cleanTitle,
              subject: cleanTitle.toLowerCase().includes('reason') ? 'Reasoning Ability' : cleanTitle.toLowerCase().includes('english') ? 'English Language' : 'Quantitative Aptitude',
              fileName: doc.file_name || 'Document.pdf',
              fileSize: doc.file_size || 0,
              mimeType: 'application/pdf',
              telegramFileId: doc.file_id,
              telegramMessageId: post.message_id || 0,
              uploaderId: post.forward_from?.id ? String(post.forward_from.id) : 'telegram_channel',
              uploaderName: post.forward_from?.first_name || post.chat?.title || 'Telegram Channel',
              description: 'Imported from Telegram Channel'
            });
            syncedCount++;
          }
        }
      }

      return {
        success: true,
        syncedCount,
        message: syncedCount > 0 ? `Synced ${syncedCount} new study documents from your channel!` : 'All channel documents are already in the vault.'
      };
    } catch (err: any) {
      return { success: false, syncedCount: 0, message: err.message || 'Sync failed' };
    }
  }

  // Upload document / file buffer to the private Telegram channel
  public async uploadDocument(
    fileBuffer: Buffer,
    fileName: string,
    mimeType: string,
    caption: string
  ): Promise<{
    telegramFileId: string;
    telegramMessageId: number;
    fileSize: number;
    fileName: string;
    mimeType: string;
  }> {
    const chId = this.getChannelId();
    const token = this.getBotToken();

    if (!chId) {
      throw new Error('Telegram Channel is not configured yet. Please auto-detect or enter your channel ID.');
    }
    if (!token) {
      throw new Error('Telegram Bot Token is not configured. Please check TELEGRAM_BOT_TOKEN.');
    }

    const formData = new FormData();
    formData.append('chat_id', chId);
    formData.append('caption', caption);

    const blob = new Blob([new Uint8Array(fileBuffer)], { type: mimeType || 'application/octet-stream' });
    formData.append('document', blob, fileName);

    const url = `https://api.telegram.org/bot${token}/sendDocument`;
    const res = await fetch(url, {
      method: 'POST',
      body: formData
    });

    const data = (await res.json()) as any;
    if (!data.ok) {
      console.error('Telegram sendDocument error:', data);
      throw new Error(data.description || 'Failed to upload document to Telegram');
    }

    const doc = data.result.document;
    return {
      telegramFileId: doc.file_id,
      telegramMessageId: data.result.message_id,
      fileSize: doc.file_size || fileBuffer.length,
      fileName: doc.file_name || fileName,
      mimeType: doc.mime_type || mimeType
    };
  }

  // Get direct download link for a file from Telegram
  public async getFileDownloadUrl(fileId: string): Promise<string> {
    const token = this.getBotToken();
    if (!token) {
      throw new Error('Telegram Bot Token is not configured.');
    }
    const url = `https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`;
    const res = await fetch(url);
    const data = (await res.json()) as any;

    if (!data.ok || !data.result?.file_path) {
      throw new Error(data.description || 'Could not retrieve file path from Telegram');
    }

    return `https://api.telegram.org/file/bot${token}/${data.result.file_path}`;
  }
}

export const telegramService = new TelegramService();
