import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

async function testMongoDBConnection(): Promise<void> {
  const timeout = setTimeout(() => {
    console.error('❌ Connection timeout after 10 seconds');
    console.error('Possible issues:');
    console.error('  - Network/firewall blocking MongoDB Atlas');
    console.error('  - Invalid credentials');
    console.error('  - IP address not whitelisted in MongoDB Atlas');
    console.error('  - MongoDB URI incorrect');
    process.exit(1);
  }, 10000);

  try {
    console.log('🔄 Attempting to connect to MongoDB...');
    console.log(`📍 URI: ${process.env.MONGO_URI?.replace(/\/\/([^:]+):([^@]+)@/, '//$1:****@')}`);

    await mongoose.connect(process.env.MONGO_URI || '', {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 10000,
    });

    clearTimeout(timeout);

    console.log('✅ Successfully connected to MongoDB!');
    console.log(`📊 Database: ${mongoose.connection.db?.databaseName}`);
    console.log(`🖥️  Host: ${mongoose.connection.host}`);
    console.log(`🔌 Port: ${mongoose.connection.port}`);
    console.log(`📡 Ready state: ${mongoose.connection.readyState} (1 = connected)`);

    // Test une opération simple
    const collections = mongoose.connection.db
      ? await mongoose.connection.db.listCollections().toArray()
      : [];
    console.log(`📚 Collections found: ${collections.length}`);
    if (collections.length > 0) {
      console.log('   Collections:', collections.map(c => c.name).join(', '));
    }

    await mongoose.connection.close();
    console.log('👋 Connection closed successfully');
    process.exit(0);
  } catch (error) {
    console.error('❌ MongoDB connection failed:');
    console.error(error);
    process.exit(1);
  } finally {
    // Nettoyer les données de test si elles existent
    try {
      const testCollections = mongoose.connection.db
        ? await mongoose.connection.db.listCollections({ name: /test/i }).toArray()
        : [];

      for (const collection of testCollections) {
        await mongoose.connection.db?.dropCollection(collection.name);
        console.log(`🗑️  Cleaned test collection: ${collection.name}`);
      }
    } catch (cleanupError) {
      console.error('⚠️  Error during cleanup:', cleanupError);
    }
  }
}

testMongoDBConnection();
