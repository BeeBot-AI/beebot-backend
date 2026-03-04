import { Router } from 'express';
import axios from 'axios';
import Client from '../models/Client.js';
import config from '../config.js';

const router = Router();

router.post('/', async (req, res) => {
    try {
        const { query, clientId } = req.body;

        if (!query || !clientId) {
            return res.status(400).json({ error: 'Missing query or clientId' });
        }

        // Fetch bot config
        // Assuming clientId passed from frontend widget could be the mongo _id for simplicity
        let client;
        try {
            client = await Client.findById(clientId);
        } catch (e) {
            client = await Client.findOne({ userId: clientId }); // fallback
        }

        // Mock client config if DB isn't seeded yet
        if (!client) {
            client = {
                botConfig: {
                    companyName: "Test Company",
                    tone: "Friendly",
                    fallbackMessage: "I'm not sure."
                }
            };
        }

        // Call AI Service
        const response = await axios.post(`${config.PYTHON_SERVICE_URL}/api/chat`, {
            query,
            clientId,
            bot_config: client.botConfig || { tone: client.tone || "Professional" }
        });

        // Increment Usage Metric
        if (client._id) {
            await Client.findByIdAndUpdate(client._id, {
                $inc: { currentMonthUsage: 1 }
            });
        }

        res.json({ response: response.data.response });
    } catch (error) {
        console.error('Chat error:', error.message);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

export default router;
