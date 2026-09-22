import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const DEFAULT_URI = 'mongodb+srv://chinmaydhabale007_db_user:fXgxqIongrV3aVwL@cluster0.keboxsk.mongodb.net/studyos?retryWrites=true&w=majority';
const MONGODB_URI = process.env.MONGODB_URI || DEFAULT_URI;

export async function connectDatabase(): Promise<boolean> {
  try {
    console.log('🔄 Connecting to MongoDB Atlas (Cluster0)...');
    mongoose.set('strictQuery', false);
    
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 8000,
      autoIndex: true
    });

    console.log('🍃 Successfully connected to MongoDB Atlas (Database: studyos)!');
    return true;
  } catch (error: any) {
    console.warn('⚠️ Warning: MongoDB Atlas connection failed:', error.message);
    console.log('ℹ️ Running in resilient fallback mode (in-memory persistent cache active).');
    return false;
  }
}

export function isDbConnected(): boolean {
  return mongoose.connection.readyState === 1;
}
