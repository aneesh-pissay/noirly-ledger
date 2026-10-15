import mongoose from "mongoose";

type MongooseCache = {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
};

declare global {
  var ledgerMongooseCache: MongooseCache | undefined;
}

const cache: MongooseCache = global.ledgerMongooseCache ?? {
  conn: null,
  promise: null,
};

global.ledgerMongooseCache = cache;

export async function connectMongo(): Promise<typeof mongoose> {
  if (cache.conn) {
    return cache.conn;
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI is required (use database name noirly-ledger)");
  }

  if (!cache.promise) {
    cache.promise = mongoose.connect(uri, {
      bufferCommands: false,
    });
  }

  cache.conn = await cache.promise;
  return cache.conn;
}

export async function withDb<T>(fn: () => Promise<T>): Promise<T> {
  await connectMongo();
  return fn();
}
