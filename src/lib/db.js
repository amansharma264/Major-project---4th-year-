import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI;

export async function connectDB() {
  if (mongoose.connection.readyState >= 1) return;
  return mongoose.connect(MONGODB_URI);
}

// Model Schema
const RecordSchema = new mongoose.Schema({
  userAddress: String,
  imageHash: String,
  createdAt: { type: Date, default: Date.now }
});

export const VaultRecord = mongoose.models.VaultRecord || mongoose.model('VaultRecord', RecordSchema);