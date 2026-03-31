import express from 'express';
import { register, login, logout, getMe, googleAuth, updateProfile } from '../controllers/auth.controller.js';
import { protect } from '../middleware/auth.middleware.js';

const router = express.Router();

router.post('/register', register);
router.post('/login', login);
router.post('/logout', logout);
router.post('/google', googleAuth);
router.get('/me', protect, getMe);
router.put('/profile', protect, updateProfile);

export default router;
