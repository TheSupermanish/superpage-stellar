import mongoose, { Schema, Document } from 'mongoose';

export interface IStore extends Document {
  id: string;
  name: string;
  url: string;
  shopDomain?: string;
  adminAccessToken: string;
  creatorId?: mongoose.Types.ObjectId;
  description?: string;
  currency: string;
  networks: string[];
  asset: string;
  agentMetadata?: Record<string, any>;
  createdAt: Date;
}

const StoreSchema = new Schema<IStore>(
  {
    id: {
      type: String,
      required: true,
      unique: true,
    },
    name: {
      type: String,
      required: true,
    },
    url: {
      type: String,
      required: true,
    },
    shopDomain: {
      type: String,
    },
    adminAccessToken: {
      type: String,
      required: true,
    },
    creatorId: {
      type: Schema.Types.ObjectId,
      ref: 'Creator',
    },
    description: {
      type: String,
    },
    currency: {
      type: String,
      default: process.env.X402_CURRENCY || 'USDC',
    },
    networks: {
      type: [String],
      default: [process.env.X402_CHAIN || 'bite-v2-sandbox'],
    },
    asset: {
      type: String,
      default: process.env.X402_CURRENCY || 'USDC',
    },
    agentMetadata: {
      type: Schema.Types.Mixed,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
// id is already indexed via unique: true
StoreSchema.index({ shopDomain: 1 });
StoreSchema.index({ creatorId: 1 });

export const Store = mongoose.model<IStore>('Store', StoreSchema);
