import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

mongoose.connect(process.env.MONGO_URI).then(async () => {
    try {
        const clientIndexes = await mongoose.connection.collection('clients').indexes();
        console.log('Current clients indexes:', JSON.stringify(clientIndexes, null, 2));

        // Try to drop all non-_id indexes to clean slate
        for (const idx of clientIndexes) {
            if (idx.name !== '_id_') {
                try {
                    await mongoose.connection.collection('clients').dropIndex(idx.name);
                    console.log(`Dropped index: ${idx.name}`);
                } catch (e) {
                    console.log(`Could not drop ${idx.name}: ${e.message}`);
                }
            }
        }

        const userIndexes = await mongoose.connection.collection('users').indexes();
        console.log('Current users indexes:', JSON.stringify(userIndexes, null, 2));
    } catch (e) {
        console.error('Error:', e.message);
    }
    process.exit(0);
});
