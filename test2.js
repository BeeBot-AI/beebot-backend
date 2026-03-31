import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { register } from './src/controllers/auth.controller.js';

dotenv.config();

mongoose.connect(process.env.MONGO_URI).then(async () => {
    const req = {
        body: {
            name: "Test User 4",
            email: "test4@example.com",
            password: "testpassword"
        }
    };
    const res = {
        status: (code) => {
            console.log('Status set to:', code);
            return {
                json: (data) => console.log('JSON returned:', JSON.stringify(data))
            };
        },
        cookie: (name, val, options) => {
            console.log('Cookie set:', name, val);
        }
    };

    await register(req, res);
    process.exit(0);
});
