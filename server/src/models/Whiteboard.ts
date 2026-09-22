import mongoose, { Schema, Document } from 'mongoose';

export interface IWhiteboardElementDocument extends Document {
  id: string;
  roomId: string;
  type: string;
  points?: { x: number; y: number }[];
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  color: string;
  strokeWidth: number;
  fill?: string;
  text?: string;
  equationLatex?: string;
  flowchartType?: string;
  nodeColor?: string;
  createdBy: string;
  createdAt: number;
}

const WhiteboardSchema = new Schema<IWhiteboardElementDocument>({
  id: { type: String, required: true, index: true },
  roomId: { type: String, required: true, index: true },
  type: { type: String, required: true },
  points: { type: [{ x: Number, y: Number }], default: undefined },
  x: Number,
  y: Number,
  width: Number,
  height: Number,
  color: { type: String, default: '#818cf8' },
  strokeWidth: { type: Number, default: 2 },
  fill: String,
  text: String,
  equationLatex: String,
  flowchartType: String,
  nodeColor: String,
  createdBy: { type: String, default: 'Student' },
  createdAt: { type: Number, default: Date.now }
});

export const WhiteboardModel = mongoose.model<IWhiteboardElementDocument>('WhiteboardElement', WhiteboardSchema);
