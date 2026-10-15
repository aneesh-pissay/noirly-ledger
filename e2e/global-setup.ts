import mongoose from "mongoose";
import { E2E_MONGODB_URI } from "./env";

/**
 * Empties the e2e database so every run starts from nothing. Collections are
 * emptied rather than dropped: a reused server built its indexes at startup
 * and would not recreate them.
 */
export default async function globalSetup() {
  if (!/noirly-ledger-e2e/.test(E2E_MONGODB_URI)) {
    throw new Error(`Refusing to wipe a non-e2e database: ${E2E_MONGODB_URI}`);
  }
  const connection = await mongoose
    .createConnection(E2E_MONGODB_URI, { serverSelectionTimeoutMS: 5000 })
    .asPromise();
  for (const collection of await connection.db!.collections()) {
    await collection.deleteMany({});
  }
  await connection.close();
}
