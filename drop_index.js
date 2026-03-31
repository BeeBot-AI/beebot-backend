import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

mongoose.connect(process.env.MONGO_URI).then(async () => {
    try {
        await mongoose.connection.collection('users').dropIndex('googleId_1');
        console.log('Index dropped');
    } catch (e) {
        console.log('Error or index not found:', e.message);
    }
    process.exit(0);
});
