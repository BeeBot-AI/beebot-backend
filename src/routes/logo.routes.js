/**
 * Logo upload — POST /api/chatbot/logo
 *
 * Accepts: multipart/form-data  { logo: File }
 * Stores:  Cloudinary CDN URL in Chatbot.logoUrl
 *
 * Required env vars:
 *   CLOUDINARY_CLOUD_NAME
 *   CLOUDINARY_API_KEY
 *   CLOUDINARY_API_SECRET
 *
 * Install: npm install multer cloudinary
 */
import express   from 'express';
import multer    from 'multer';
import stream    from 'stream';
import { protect } from '../middleware/auth.middleware.js';
import Business  from '../models/Business.js';
import Chatbot   from '../models/Chatbot.js';

const router = express.Router();

const ALLOWED_TYPES = ['image/png', 'image/jpg', 'image/jpeg'];
const MAX_SIZE      = 200 * 1024; // 200 KB

const upload = multer({
    storage: multer.memoryStorage(),
    limits:  { fileSize: MAX_SIZE },
    fileFilter: (_req, file, cb) => {
        if (ALLOWED_TYPES.includes(file.mimetype)) cb(null, true);
        else cb(new Error('Only PNG/JPG images up to 200 KB are allowed'));
    },
});

router.post('/', protect, upload.single('logo'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });

        if (!process.env.CLOUDINARY_CLOUD_NAME) {
            return res.status(503).json({ success: false, message: 'Image storage not configured' });
        }

        const { v2: cloudinary } = await import('cloudinary');
        cloudinary.config({
            cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
            api_key:    process.env.CLOUDINARY_API_KEY,
            api_secret: process.env.CLOUDINARY_API_SECRET,
        });

        // Upload to Cloudinary via stream
        const secureUrl = await new Promise((resolve, reject) => {
            const uploadStream = cloudinary.uploader.upload_stream(
                { folder: 'beebot/logos', resource_type: 'image' },
                (err, result) => {
                    if (err) reject(err);
                    else resolve(result.secure_url);
                }
            );
            const bufferStream = new stream.PassThrough();
            bufferStream.end(req.file.buffer);
            bufferStream.pipe(uploadStream);
        });

        // Persist URL on the chatbot config
        const business = await Business.findOne({ userId: req.user._id });
        if (!business) return res.status(404).json({ success: false, message: 'Business not found' });

        await Chatbot.findOneAndUpdate(
            { businessId: business._id },
            { logoUrl: secureUrl },
            { upsert: true, new: true }
        );

        res.json({ success: true, logoUrl: secureUrl });
    } catch (err) {
        if (err.code === 'LIMIT_FILE_SIZE')
            return res.status(413).json({ success: false, message: 'File too large — max 200 KB' });
        console.error('[Logo upload]', err);
        res.status(500).json({ success: false, message: err.message || 'Upload failed' });
    }
});

export default router;
