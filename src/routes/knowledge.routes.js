import { Router } from 'express';
import multer from 'multer';
import axios from 'axios';
import FormData from 'form-data';
import { v4 as uuidv4 } from 'uuid';
import KnowledgeSource from '../models/KnowledgeSource.js';
import Business from '../models/Business.js';
import { protect } from '../middleware/auth.middleware.js';
import config from '../config.js';

const router = Router();

// Store files in memory so we can forward the binary to the AI service
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB hard limit at multer level
});

const ALLOWED_MIMETYPES = new Set([
    'application/pdf',
    'text/plain',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

const ALLOWED_EXTENSIONS = new Set(['.pdf', '.txt', '.docx']);

// ---------------------------------------------------------------------------
// Helper: trigger text/FAQ embedding asynchronously
// ---------------------------------------------------------------------------
async function embedText(knowledgeId, businessId, sourceId, text, source) {
    try {
        await KnowledgeSource.findByIdAndUpdate(knowledgeId, { embedding_status: 'processing' });

        const result = await axios.post(`${config.PYTHON_SERVICE_URL}/api/knowledge/process`, {
            business_id: businessId.toString(),
            text,
            source,
            source_id: sourceId,
        }, { timeout: 60000 });

        // We DO NOT mark it as 'done' here anymore. 
        // Python Celery worker is handling it asynchronously.
        // The worker (or polling) will update this status later.
    } catch (err) {
        console.error('[embedText] Error:', err.message);
        await KnowledgeSource.findByIdAndUpdate(knowledgeId, { embedding_status: 'failed' });
    }
}

// ---------------------------------------------------------------------------
// Helper: trigger URL scraping + embedding asynchronously
// ---------------------------------------------------------------------------
async function embedUrl(knowledgeId, businessId, sourceId, url) {
    try {
        await KnowledgeSource.findByIdAndUpdate(knowledgeId, { embedding_status: 'processing' });

        const result = await axios.post(`${config.PYTHON_SERVICE_URL}/api/knowledge/url`, {
            business_id: businessId.toString(),
            url,
            source_id: sourceId,
        }, { timeout: 60000 });

        // Do not mark 'done' - Celery handles it.
        // We can optionally update the content string though.
        await KnowledgeSource.findByIdAndUpdate(knowledgeId, {
            content: `Website: ${url} (Indexing...)`,
        });
    } catch (err) {
        console.error('[embedUrl] Error:', err.message);
        await KnowledgeSource.findByIdAndUpdate(knowledgeId, { embedding_status: 'failed' });
    }
}

// ---------------------------------------------------------------------------
// Helper: upload binary file to AI service for parsing + embedding
// ---------------------------------------------------------------------------
async function embedFile(knowledgeId, businessId, sourceId, fileBuffer, filename, mimetype) {
    try {
        await KnowledgeSource.findByIdAndUpdate(knowledgeId, { embedding_status: 'processing' });

        const form = new FormData();
        form.append('file', fileBuffer, { filename, contentType: mimetype });
        form.append('business_id', businessId.toString());
        form.append('source_id', sourceId);

        const result = await axios.post(
            `${config.PYTHON_SERVICE_URL}/api/knowledge/upload-file`,
            form,
            { headers: form.getHeaders(), timeout: 60000 }
        );

        // Do not mark 'done'. Celery worker handles it.
    } catch (err) {
        console.error('[embedFile] Error:', err.response?.data?.detail || err.message);
        await KnowledgeSource.findByIdAndUpdate(knowledgeId, { embedding_status: 'failed' });
    }
}


// ---------------------------------------------------------------------------
// POST /api/knowledge/text  — plain text or FAQ
// ---------------------------------------------------------------------------
router.post('/text', protect, async (req, res) => {
    try {
        const business = await Business.findOne({ userId: req.user._id });
        if (!business) return res.status(404).json({ success: false, message: 'Business not found' });

        const { content, title, source_type } = req.body;
        if (!content || !content.trim()) {
            return res.status(400).json({ success: false, message: 'Content is required' });
        }

        const sourceId = uuidv4();
        const entry = await KnowledgeSource.create({
            businessId: business._id,
            source_type: source_type || 'text',
            title: title || 'Text Entry',
            content: content.substring(0, 300),
            source_id: sourceId,
        });

        // Fire-and-forget embedding
        embedText(entry._id, business._id, sourceId, content, source_type || 'text');

        res.status(201).json({ success: true, entry });
    } catch (error) {
        console.error('[POST /knowledge/text]', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});


// ---------------------------------------------------------------------------
// POST /api/knowledge/url  — web page scraping
// ---------------------------------------------------------------------------
router.post('/url', protect, async (req, res) => {
    try {
        const business = await Business.findOne({ userId: req.user._id });
        if (!business) return res.status(404).json({ success: false, message: 'Business not found' });

        const { url } = req.body;
        if (!url || !url.trim()) {
            return res.status(400).json({ success: false, message: 'URL is required' });
        }

        // Basic URL format check
        try { new URL(url); } catch { return res.status(400).json({ success: false, message: 'Invalid URL format' }); }

        const sourceId = uuidv4();
        const entry = await KnowledgeSource.create({
            businessId: business._id,
            source_type: 'url',
            title: url,
            content: url,
            source_id: sourceId,
        });

        embedUrl(entry._id, business._id, sourceId, url);

        res.status(201).json({ success: true, entry });
    } catch (error) {
        console.error('[POST /knowledge/url]', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});


// ---------------------------------------------------------------------------
// POST /api/knowledge/upload  — binary file (PDF / DOCX / TXT)
// ---------------------------------------------------------------------------
router.post('/upload', protect, upload.single('file'), async (req, res) => {
    try {
        const business = await Business.findOne({ userId: req.user._id });
        if (!business) return res.status(404).json({ success: false, message: 'Business not found' });

        if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });

        const { originalname, buffer, mimetype, size } = req.file;

        // Validate file extension
        const ext = originalname.slice(originalname.lastIndexOf('.')).toLowerCase();
        if (!ALLOWED_EXTENSIONS.has(ext)) {
            return res.status(400).json({
                success: false,
                message: `Unsupported file type. Allowed: PDF, TXT, DOCX.`,
            });
        }

        const sourceId = uuidv4();
        const entry = await KnowledgeSource.create({
            businessId: business._id,
            source_type: 'document',
            title: originalname,
            content: `Document: ${originalname}`,
            source_id: sourceId,
            file_size: size,
            file_type: ext.replace('.', ''),
        });

        // Fire-and-forget: send binary to AI service for real PDF/DOCX parsing
        embedFile(entry._id, business._id, sourceId, buffer, originalname, mimetype);

        res.status(201).json({ success: true, entry });
    } catch (error) {
        console.error('[POST /knowledge/upload]', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});


// ---------------------------------------------------------------------------
// GET /api/knowledge  — list all sources
// ---------------------------------------------------------------------------
router.get('/', protect, async (req, res) => {
    try {
        const business = await Business.findOne({ userId: req.user._id });
        if (!business) return res.status(404).json({ success: false, message: 'Business not found' });

        const sources = await KnowledgeSource.find({ businessId: business._id }).sort({ created_at: -1 });
        res.status(200).json({ success: true, sources });
    } catch (error) {
        console.error('[GET /knowledge]', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});


// ---------------------------------------------------------------------------
// GET /api/knowledge/:id/status  — lightweight status polling
// ---------------------------------------------------------------------------
router.get('/:id/status', protect, async (req, res) => {
    try {
        const business = await Business.findOne({ userId: req.user._id });
        if (!business) return res.status(404).json({ success: false, message: 'Business not found' });

        const source = await KnowledgeSource.findOne({
            _id: req.params.id,
            businessId: business._id,
        }).select('embedding_status chunks_added');

        if (!source) return res.status(404).json({ success: false, message: 'Not found' });

        res.status(200).json({
            success: true,
            embedding_status: source.embedding_status,
            chunks_added: source.chunks_added,
        });
    } catch (error) {
        console.error('[GET /knowledge/:id/status]', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});


// ---------------------------------------------------------------------------
// DELETE /api/knowledge/:id  — delete source + Pinecone vectors
// ---------------------------------------------------------------------------
router.delete('/:id', protect, async (req, res) => {
    try {
        const business = await Business.findOne({ userId: req.user._id });
        if (!business) return res.status(404).json({ success: false, message: 'Business not found' });

        const source = await KnowledgeSource.findOneAndDelete({
            _id: req.params.id,
            businessId: business._id,
        });

        if (!source) return res.status(404).json({ success: false, message: 'Knowledge source not found' });

        // Asynchronously clean up Pinecone vectors (non-blocking)
        if (source.source_id) {
            axios.delete(`${config.PYTHON_SERVICE_URL}/api/knowledge/vectors`, {
                data: { business_id: business._id.toString(), source_id: source.source_id },
            }).catch(err => console.error('[Pinecone delete]', err.message));
        }

        res.status(200).json({ success: true, message: 'Knowledge source deleted' });
    } catch (error) {
        console.error('[DELETE /knowledge/:id]', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ---------------------------------------------------------------------------
// POST /api/knowledge/webhook/status  — INTERNAL endpoint for Celery Worker
// ---------------------------------------------------------------------------
router.post('/webhook/status', async (req, res) => {
    try {
        const { source_id, status, chunks_added } = req.body;

        if (!source_id || !status) {
            return res.status(400).json({ success: false, message: 'Missing parameters' });
        }

        const source = await KnowledgeSource.findOneAndUpdate(
            { source_id: source_id },
            {
                embedding_status: status,
                chunks_added: chunks_added || 0
            },
            { new: true }
        );

        if (!source) {
            return res.status(404).json({ success: false, message: 'Source not found for given source_id' });
        }

        res.status(200).json({ success: true, message: 'Status updated' });
    } catch (error) {
        console.error('[POST /knowledge/webhook/status]', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

export default router;
