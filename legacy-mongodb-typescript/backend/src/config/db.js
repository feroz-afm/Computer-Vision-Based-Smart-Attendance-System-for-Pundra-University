const mongoose = require('mongoose');

const connectDB = async () => {
  const rawURI = process.env.MONGO_URI || '';

  // ── Sanity checks (no credentials are printed) ──────────────────────────
  if (!rawURI) {
    console.error('[MongoDB] MONGO_URI is not set. Check your .env file.');
    console.warn('[MongoDB] Falling back to local: mongodb://127.0.0.1:27017/pub_attendeye');
  }

  // Detect the common "MONGO_URI=MONGO_URI=..." double-key mistake
  if (rawURI.startsWith('MONGO_URI=')) {
    console.error('[MongoDB] ❌ Config error: MONGO_URI value starts with "MONGO_URI=". Your .env file has a duplicate key.');
    console.error('[MongoDB]    Fix: Open .env and change  MONGO_URI=MONGO_URI=mongodb+srv://...  to  MONGO_URI=mongodb+srv://...');
    process.exit(1); // Stop server — connection will definitely fail
  }

  // Detect missing scheme
  if (rawURI && !rawURI.startsWith('mongodb://') && !rawURI.startsWith('mongodb+srv://')) {
    console.error('[MongoDB] ❌ Config error: MONGO_URI does not start with mongodb:// or mongodb+srv://');
    process.exit(1);
  }

  const mongoURI = rawURI || 'mongodb://127.0.0.1:27017/pub_attendeye';
  // ────────────────────────────────────────────────────────────────────────

  try {
    const conn = await mongoose.connect(mongoURI, {
      serverSelectionTimeoutMS: 8000,
    });
    console.log(`[MongoDB] ✅ Connected: ${conn.connection.host}`);
    return conn;
  } catch (error) {
    // Provide targeted hints without exposing credentials
    if (error.message.includes('bad auth') || error.message.includes('Authentication failed')) {
      console.error('[MongoDB] ❌ Authentication failed. Check these in your .env MONGO_URI:');
      console.error('   1. Username is correct (matches Atlas database user).');
      console.error('   2. Password special chars are percent-encoded  (@ → %40  : → %3A  / → %2F  % → %25).');
      console.error('   3. The database name in the URI is correct.');
      console.error('   4. The Atlas user has "readWriteAnyDatabase" or specific DB role.');
    } else if (error.message.includes('ENOTFOUND') || error.message.includes('ETIMEDOUT')) {
      console.error('[MongoDB] ❌ Network error — cannot reach Atlas cluster. Check:');
      console.error('   1. Your cluster hostname in MONGO_URI is correct.');
      console.error('   2. Your IP is whitelisted in Atlas → Network Access.');
      console.error('   3. Your internet connection is working.');
    } else {
      console.error(`[MongoDB] ❌ Connection error: ${error.message}`);
    }
    console.warn('[MongoDB] Server will continue — database operations will fail until fixed.');
    return null;
  }
};

module.exports = connectDB;
