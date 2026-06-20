import express from 'express';
import cors from 'cors';
import compression from 'compression';
import dotenv from 'dotenv';
import authRoutes from './routes/authRoutes';
import dataRoutes from './routes/dataRoutes';
import { syncPostgresToFirestore } from './syncService';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Compress all responses — critical for large GeoJSON payloads (~7MB → ~700KB)
app.use(compression());
app.use(cors());
app.use(express.json());

// Basic health check
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', message: 'SRSMS Backend is running' });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/data', dataRoutes);

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);

    // Trigger auto-sync in the background after 5 seconds to ensure DB is up
    setTimeout(async () => {
        try {
            console.log('🤖 Auto-sync: Checking databases for synchronization...');
            await syncPostgresToFirestore();
        } catch (err) {
            console.error('🤖 Auto-sync: Failed to sync on startup:', err);
        }
    }, 5000);
});
