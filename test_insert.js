import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from './src/models/User.js';

dotenv.config();

mongoose.connect(process.env.MONGO_URI).then(async () => {
    try {
        const user = await User.create({
            name: "Test User 3",
            email: "test3@example.com",
            password: "testpassword"
        });
        console.log('User created:', user._id);
    } catch (e) {
        console.error('Error inserting:', e);
    }
    process.exit(0);
});
