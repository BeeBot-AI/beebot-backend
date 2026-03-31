import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

mongoose.connect(process.env.MONGO_URI).then(async () => {
    try {
        await mongoose.connection.collection('clients').dropIndex('clientId_1');
        console.log('Index clientId_1 dropped from clients collection');
    } catch (e) {
        console.log('Error dropping index:', e.message);
    }
    process.exit(0);
});
