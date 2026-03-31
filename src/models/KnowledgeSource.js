import mongoose from 'mongoose';

const knowledgeSourceSchema = new mongoose.Schema({
    businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', required: true },
    source_type: { type: String, enum: ['faq', 'text', 'url', 'document'], required: true },
    title: { type: String, default: '' },
    content: { type: String, required: true },
    source_id: { type: String, default: '' },   // UUID echoed to Pinecone for deletion
    file_size: { type: Number, default: 0 },    // bytes (documents only)
    file_type: { type: String, default: '' },   // e.g. 'pdf', 'docx', 'txt'
    embedding_status: { type: String, enum: ['pending', 'processing', 'done', 'failed'], default: 'pending' },
    chunks_added: { type: Number, default: 0 },
    created_at: { type: Date, default: Date.now }
});

export default mongoose.model('KnowledgeSource', knowledgeSourceSchema);
