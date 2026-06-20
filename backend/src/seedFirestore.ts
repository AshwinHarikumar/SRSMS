import { syncPostgresToFirestore } from './syncService';
import dotenv from 'dotenv';

dotenv.config();

const run = async () => {
    console.log('🚀 Standalone Seeder: Starting Firestore seeding...');
    const start = Date.now();
    try {
        const success = await syncPostgresToFirestore();
        if (success) {
            console.log(`✅ Standalone Seeder: Completed successfully in ${((Date.now() - start) / 1000).toFixed(1)}s!`);
            process.exit(0);
        } else {
            console.error('❌ Standalone Seeder: Completed with errors.');
            process.exit(1);
        }
    } catch (err) {
        console.error('❌ Standalone Seeder: Failed:', err);
        process.exit(1);
    }
};

run();
