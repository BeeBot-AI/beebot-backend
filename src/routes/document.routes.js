import { Router } from 'express';
import multer from 'multer';
import axios from 'axios';
import config from '../config.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.post('/upload', upload.single('file'), async (req, res) => {
    try {
        const { clientId } = req.body;
        if (!req.file || !clientId) {
            return res.status(400).json({ error: 'Missing file or clientId' });
        }

        // In a real scenario, extract text from req.file.buffer using pdf-parse
        // For now, mock extracted text
        const extractedText = `Mock text content extracted from ${req.file.originalname}`;

        const response = await axios.post(`${config.PYTHON_SERVICE_URL}/api/documents/process`, {
            client_id: clientId,
            text: extractedText,
            source: req.file.originalname
        });

        res.json(response.data);
    } catch (error) {
        console.error('Upload error:', error.message);
        res.status(500).json({ error: 'Document processing failed' });
    }
});

export default router;
