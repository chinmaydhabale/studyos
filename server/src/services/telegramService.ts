import { TelegramConfigModel } from '../models/TelegramConfig.js';
import { isDbConnected } from '../db.js';

const DEFAULT_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8901901969:AAGHqZ1H62gFbuaKz6kkEVEuSq3lVxfP3mY';
const BOT_USERNAME = 'studyosprobot';

export class TelegramService {
  private botToken: string = DEFAULT_BOT_TOKEN;
  private channelId: string = '';
  private channelTitle: string = '';
  private isConfigured: boolean = false;

  constructor() {
    // Will load config on startup
  }

  public async init() {
    if (!isDbConnected()) return;
    try {
      let config = await TelegramConfigModel.findOne({ key: 'primary' });
      if (!config) {
        config = await TelegramConfigModel.create({
          key: 'primary',
          botToken: this.botToken,
          channelId: '',
          channelTitle: '',
          isConfigured: false,
          lastSyncAt: new Date()
        });
      }
      this.botToken = config.botToken || DEFAULT_BOT_TOKEN;
      this.channelId = config.channelId || '';
      this.channelTitle = config.channelTitle || '';
      this.isConfigured = Boolean(this.channelId);
      console.log(`📡 Telegram Storage Service initialized. Configured: ${this.isConfigured} (Channel: ${this.channelId || 'Not set'})`);
    } catch (err: any) {
      console.warn('Failed to load Telegram config:', err.message);
    }
  }

  public getStatus() {
    return {
      botUsername: BOT_USERNAME,
      botToken: `${this.botToken.substring(0, 10)}...`,
      channelId: this.channelId,
      channelTitle: this.channelTitle,
      isConfigured: this.isConfigured
    };
  }

  // Scan Telegram getUpdates to automatically capture channel ID from forward/post
  public async detectChannelFromUpdates(): Promise<{ success: boolean; channelId?: string; channelTitle?: string; message: string }> {
    try {
      const res = await fetch(`https://api.telegram.org/bot${this.botToken}/getUpdates`);
      const data = (await res.json()) as any;

      if (!data.ok) {
        return { success: false, message: data.description || 'Failed to reach Telegram API' };
      }

      const updates = data.result || [];
      if (updates.length === 0) {
        return {
          success: false,
          message: 'No new updates found in Telegram. Please write "test" inside your private channel or forward a post to @studyosprobot, then click Auto-Detect.'
        };
      }

      let detectedId = '';
      let detectedTitle = '';

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

      if (!detectedId) {
        return {
          success: false,
          message: 'Updates were found, but none contained a channel ID. Please post a message directly in the channel or enter the Channel ID manually.'
        };
      }

      // Save to database permanently
      await this.setChannelConfig(detectedId, detectedTitle);

      return {
        success: true,
        channelId: detectedId,
        channelTitle: detectedTitle,
        message: `Successfully connected to channel: "${detectedTitle}" (${detectedId})`
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
      const chatRes = await fetch(`https://api.telegram.org/bot${this.botToken}/getChat?chat_id=${cleanId}`);
      const chatData = (await chatRes.json()) as any;
      if (chatData.ok && chatData.result?.title) {
        realTitle = chatData.result.title;
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
            botToken: this.botToken,
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
    if (!this.channelId) {
      throw new Error('Telegram Channel is not configured yet. Please auto-detect or enter your channel ID.');
    }

    const formData = new FormData();
    formData.append('chat_id', this.channelId);
    formData.append('caption', caption);

    const blob = new Blob([new Uint8Array(fileBuffer)], { type: mimeType || 'application/octet-stream' });
    formData.append('document', blob, fileName);

    const url = `https://api.telegram.org/bot${this.botToken}/sendDocument`;
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
    const url = `https://api.telegram.org/bot${this.botToken}/getFile?file_id=${fileId}`;
    const res = await fetch(url);
    const data = (await res.json()) as any;

    if (!data.ok || !data.result?.file_path) {
      throw new Error(data.description || 'Could not retrieve file path from Telegram');
    }

    return `https://api.telegram.org/file/bot${this.botToken}/${data.result.file_path}`;
  }
}

export const telegramService = new TelegramService();
