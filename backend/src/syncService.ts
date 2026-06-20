import * as admin from 'firebase-admin';
import { query } from './db';
import * as fs from 'fs';
import * as path from 'path';

let firestore: admin.firestore.Firestore | null = null;

export const initFirestore = (): admin.firestore.Firestore | null => {
    if (firestore) return firestore;

    try {
        const backendDir = path.join(__dirname, '..');
        let serviceAccountPath = path.join(backendDir, 'serviceAccountKey.json');
        
        if (!fs.existsSync(serviceAccountPath)) {
            // Find any JSON file in the backend directory that looks like a credentials file
            const files = fs.readdirSync(backendDir);
            const keyFile = files.find(f => f.endsWith('.json') && (f.includes('firebase-adminsdk') || f.startsWith('srsms-')));
            if (keyFile) {
                serviceAccountPath = path.join(backendDir, keyFile);
                console.log(`🔍 Auto-detected credentials file: ${keyFile}`);
            }
        }

        if (fs.existsSync(serviceAccountPath)) {
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccountPath)
            });
            console.log(`🔥 Firebase Admin initialized via ${path.basename(serviceAccountPath)}`);
            firestore = admin.firestore();
        } else if (process.env.FIREBASE_PROJECT_ID) {
            admin.initializeApp({
                credential: admin.credential.cert({
                    projectId: process.env.FIREBASE_PROJECT_ID,
                    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
                })
            });
            console.log('🔥 Firebase Admin initialized via environment variables');
            firestore = admin.firestore();
        } else {
            console.warn('⚠️ Firebase credentials not found. Sync service will not run.');
        }
    } catch (err) {
        console.error('❌ Failed to initialize Firebase Admin:', err);
    }
    return firestore;
};

// Helper to delete all documents in a collection in batches
const deleteCollection = async (db: admin.firestore.Firestore, collectionPath: string, batchSize: number = 100) => {
    const collectionRef = db.collection(collectionPath);
    const queryRef = collectionRef.orderBy('__name__').limit(batchSize);

    return new Promise((resolve, reject) => {
        deleteQueryBatch(db, queryRef, resolve).catch(reject);
    });
};

const deleteQueryBatch = async (db: admin.firestore.Firestore, queryRef: admin.firestore.Query, resolve: (value?: any) => void) => {
    const snapshot = await queryRef.get();

    const batchSize = snapshot.size;
    if (batchSize === 0) {
        // When there are no documents left, we are done
        resolve();
        return;
    }

    // Delete documents in a batch
    const batch = db.batch();
    snapshot.docs.forEach((doc) => {
        batch.delete(doc.ref);
    });
    await batch.commit();

    // Recurse on the next batch
    process.nextTick(() => {
        deleteQueryBatch(db, queryRef, resolve);
    });
};

// Helper to write documents individually in parallel with a concurrency limit of 20 to avoid GRPC/batch commitment hangs
const batchWrite = async (db: admin.firestore.Firestore, collectionPath: string, items: any[], getId: (item: any) => string) => {
    console.log(`Writing ${items.length} documents individually to Firestore collection: ${collectionPath}`);
    const concurrencyLimit = 25;
    const itemsCopy = [...items];
    let completedCount = 0;
    
    const processQueue = async () => {
        while (itemsCopy.length > 0) {
            const item = itemsCopy.shift();
            if (!item) break;
            const docRef = db.collection(collectionPath).doc(getId(item));
            await docRef.set(item);
            completedCount++;
            
            if (completedCount % 100 === 0 || completedCount === items.length) {
                console.log(`  Progress: ${completedCount}/${items.length} documents written to ${collectionPath}`);
            }
        }
    };

    const workers = Array(concurrencyLimit).fill(null).map(() => processQueue());
    await Promise.all(workers);
    console.log(`✅ Completed writing ${items.length} documents to ${collectionPath}`);
};

export const syncPostgresToFirestore = async (): Promise<boolean> => {
    const db = initFirestore();
    if (!db) {
        console.error('❌ Cannot sync: Firestore is not initialized.');
        return false;
    }

    console.log('🔄 Starting synchronization from PostgreSQL to Firebase Firestore...');

    try {
        // 1. Sync Districts
        console.log('Fetching districts...');
        const districtsRes = await query('SELECT id, name FROM districts ORDER BY name ASC');
        await deleteCollection(db, 'districts');
        await batchWrite(db, 'districts', districtsRes.rows, (item) => String(item.id));

        // 2. Sync AHP Profiles
        console.log('Fetching AHP profiles...');
        const ahpProfilesRes = await query('SELECT id, profile_name, description, derived_weights, pairwise_matrix, consistency_ratio, is_consistent, is_active, created_at FROM ahp_profiles ORDER BY created_at DESC');
        const formattedAhp = ahpProfilesRes.rows.map((row: any) => ({
            ...row,
            pairwise_matrix: typeof row.pairwise_matrix === 'string' ? row.pairwise_matrix : JSON.stringify(row.pairwise_matrix),
            derived_weights: typeof row.derived_weights === 'string' ? row.derived_weights : JSON.stringify(row.derived_weights)
        }));
        await deleteCollection(db, 'ahp_profiles');
        await batchWrite(db, 'ahp_profiles', formattedAhp, (item) => String(item.id));

        // Sync Active AHP Profile separately for easy access
        const activeProfile = formattedAhp.find((p: any) => p.is_active);
        if (activeProfile) {
            await db.collection('ahp_profiles_meta').doc('active').set(activeProfile);
        } else {
            // Write default AHP profile if none active
            await db.collection('ahp_profiles_meta').doc('active').set({
                profile_name: 'Default (Hardcoded)',
                derived_weights: {
                    accident: 0.30, speed: 0.15, traffic: 0.10,
                    infrastructure: 0.10, vru: 0.30, geometry: 0.05
                },
                consistency_ratio: null
            });
        }

        // 3. Sync POIs
        console.log('Fetching POIs...');
        const poisRes = await query('SELECT id, name, type, ST_AsGeoJSON(geometry) as geometry FROM pois');
        const formattedPois = poisRes.rows.map(row => ({
            id: row.id,
            name: row.name,
            type: row.type,
            geometry: typeof row.geometry === 'string' ? row.geometry : JSON.stringify(row.geometry)
        }));
        await deleteCollection(db, 'pois');
        await batchWrite(db, 'pois', formattedPois, (item) => String(item.id));

        // 4. Sync Accidents (All data via chunked documents)
        console.log('Fetching all accidents...');
        const accidentsRes = await query(`
            SELECT a.id, a.severity, a.fatalities, a.injuries, a.date, a.vehicle_type, a.collision_type,
                   a.segment_id, r.district_id,
                   ST_AsGeoJSON(a.geometry)::json as geometry 
            FROM accidents a
            LEFT JOIN road_segments rs ON a.segment_id = rs.id
            LEFT JOIN roads r ON rs.road_id = r.id
            ORDER BY a.date DESC
        `);
        const formattedAccidents = accidentsRes.rows.map(row => ({
            type: 'Feature',
            geometry: typeof row.geometry === 'string' ? JSON.parse(row.geometry) : row.geometry,
            properties: {
                id: row.id,
                severity: row.severity,
                fatalities: row.fatalities,
                injuries: row.injuries,
                date: row.date,
                vehicle_type: row.vehicle_type,
                collision_type: row.collision_type,
                district_id: row.district_id
            }
        }));

        console.log(`Cleaning up old individual accidents collection...`);
        await deleteCollection(db, 'accidents');

        const chunks = [];
        const chunkSize = 3000;
        for (let i = 0; i < formattedAccidents.length; i += chunkSize) {
            chunks.push(formattedAccidents.slice(i, i + chunkSize));
        }

        console.log(`Writing ${formattedAccidents.length} accidents in ${chunks.length} chunks to Firestore...`);
        await deleteCollection(db, 'accidents_chunks');
        for (let idx = 0; idx < chunks.length; idx++) {
            await db.collection('accidents_chunks').doc(`chunk_${idx}`).set({
                features: chunks[idx]
            });
            console.log(`  Uploaded accident chunk ${idx + 1}/${chunks.length} (${chunks[idx].length} features)`);
        }

        // Fetch and Sync Accidents Summary
        const summaryRes = await query(`
            SELECT 
                COUNT(*)::int as total,
                COUNT(*) FILTER (WHERE severity = 'Fatal')::int as fatal,
                COUNT(*) FILTER (WHERE severity = 'Serious')::int as serious,
                COUNT(*) FILTER (WHERE severity = 'Minor')::int as minor,
                COALESCE(SUM(fatalities), 0)::int as fatalities,
                COALESCE(SUM(injuries), 0)::int as injuries
            FROM accidents
        `);
        const summary = summaryRes.rows[0] || { total: 0, fatal: 0, serious: 0, minor: 0, fatalities: 0, injuries: 0 };
        await db.collection('accidents_meta').doc('summary').set({
            total: summary.total,
            fatal: summary.fatal,
            serious: summary.serious,
            minor: summary.minor,
            totalFatalities: summary.fatalities,
            totalInjuries: summary.injuries
        });

        // Fetch and Sync Accidents Summary per District
        for (const district of districtsRes.rows) {
            const distSummaryRes = await query(`
                SELECT 
                    COUNT(*)::int as total,
                    COUNT(*) FILTER (WHERE severity = 'Fatal')::int as fatal,
                    COUNT(*) FILTER (WHERE severity = 'Serious')::int as serious,
                    COUNT(*) FILTER (WHERE severity = 'Minor')::int as minor,
                    COALESCE(SUM(fatalities), 0)::int as fatalities,
                    COALESCE(SUM(injuries), 0)::int as injuries
                FROM accidents a
                JOIN road_segments rs ON a.segment_id = rs.id
                JOIN roads r ON rs.road_id = r.id
                WHERE r.district_id = $1
            `, [district.id]);
            const distSummary = distSummaryRes.rows[0] || { total: 0, fatal: 0, serious: 0, minor: 0, fatalities: 0, injuries: 0 };
            await db.collection('accidents_meta').doc(`district_${district.id}`).set({
                total: distSummary.total,
                fatal: distSummary.fatal,
                serious: distSummary.serious,
                minor: distSummary.minor,
                totalFatalities: distSummary.fatalities,
                totalInjuries: distSummary.injuries
            });
        }

        // 5. Sync Road Segments (Limit 2500)
        console.log('Fetching segments...');
        const segmentsRes = await query(`
            SELECT 
                rs.id, 
                rs.road_id, 
                rs.speed_limit, 
                ST_AsGeoJSON(rs.geometry)::json as geometry,
                pi.composite_pi,
                pi.priority_category,
                pi.color_code,
                r.accident_score,
                r.speed_score,
                r.traffic_score,
                r.infrastructure_score,
                r.predicted_risk,
                COALESCE(r.weather_score, 0) as weather_score,
                COALESCE(r.geometry_score, 0) as geometry_score,
                COALESCE(sr.star_rating, 0) as star_rating,
                sr.star_category,
                sr.srs_score,
                sr.infrastructure_sub,
                sr.speed_management_sub,
                sr.crash_history_sub,
                sr.vru_protection_sub,
                COALESCE(vru.vru_exposure_score, 0) as vru_exposure_score,
                vru.vru_risk_category,
                COALESCE(bs.is_black_spot, false) as is_black_spot,
                COALESCE(bs.ml_predicted_probability, 0) as blackspot_probability,
                bs.accident_count as bs_accident_count,
                bs.fatality_count as bs_fatality_count,
                COALESCE(td.traffic_volume, 0) as traffic_volume,
                COALESCE(sd.violation_count, 0) as violation_count,
                rd.name as road_name,
                rd.road_class as road_class,
                rd.district_id,
                d.name as district_name
            FROM road_segments rs
            LEFT JOIN priority_indices pi ON rs.id = pi.segment_id
            LEFT JOIN risk_scores r ON rs.id = r.segment_id
            LEFT JOIN star_ratings sr ON rs.id = sr.segment_id
            LEFT JOIN vru_exposure vru ON rs.id = vru.segment_id
            LEFT JOIN black_spots bs ON rs.id = bs.segment_id
            LEFT JOIN traffic_data td ON rs.id = td.segment_id
            LEFT JOIN speed_data sd ON rs.id = sd.segment_id
            LEFT JOIN roads rd ON rs.road_id = rd.id
            LEFT JOIN districts d ON rd.district_id = d.id
            ORDER BY pi.composite_pi DESC NULLS LAST
            LIMIT 2500
        `);
        
        const formattedSegments = segmentsRes.rows.map(row => ({
            ...row,
            geometry: typeof row.geometry === 'string' ? row.geometry : JSON.stringify(row.geometry)
        }));
        await deleteCollection(db, 'segments');
        await batchWrite(db, 'segments', formattedSegments, (item) => String(item.id));

        // 6. Sync Blackspots
        console.log('Fetching blackspots...');
        const blackspotsRes = await query(`
            SELECT 
                bs.segment_id as id,
                bs.segment_id,
                ST_AsGeoJSON(bs.cluster_centroid)::json as geometry,
                bs.buffer_radius_m,
                bs.accident_count,
                bs.fatality_count,
                bs.serious_injury_count,
                bs.is_black_spot,
                bs.ml_predicted_probability,
                bs.ml_predicted_class,
                r.name as road_name,
                rd.road_class,
                pi.composite_pi,
                pi.priority_category
            FROM black_spots bs
            LEFT JOIN road_segments rs ON bs.segment_id = rs.id
            LEFT JOIN roads r ON rs.road_id = r.id
            LEFT JOIN roads rd ON rs.road_id = rd.id
            LEFT JOIN priority_indices pi ON bs.segment_id = pi.segment_id
            ORDER BY bs.accident_count DESC LIMIT 1000
        `);
        const formattedBlackspots = blackspotsRes.rows
            .filter(row => row.geometry)
            .map(row => ({
                ...row,
                geometry: typeof row.geometry === 'string' ? row.geometry : JSON.stringify(row.geometry)
            }));
        await deleteCollection(db, 'blackspots');
        await batchWrite(db, 'blackspots', formattedBlackspots, (item) => String(item.id));

        // 7. Sync VRU Exposure
        console.log('Fetching VRU exposure...');
        const vruRes = await query(`
            SELECT 
                vru.segment_id,
                ST_AsGeoJSON(rs.geometry)::json as geometry,
                vru.school_proximity_count,
                vru.hospital_proximity_count,
                vru.poi_proximity_count,
                vru.pedestrian_volume_estimate,
                vru.two_wheeler_mix,
                vru.sidewalk_present,
                vru.crossing_present,
                vru.vru_exposure_score,
                vru.vru_risk_category,
                r.name as road_name,
                rd.road_class
            FROM vru_exposure vru
            JOIN road_segments rs ON vru.segment_id = rs.id
            LEFT JOIN roads r ON rs.road_id = r.id
            LEFT JOIN roads rd ON rs.road_id = rd.id
            ORDER BY vru.vru_exposure_score DESC LIMIT 1000
        `);
        const formattedVru = vruRes.rows.map(row => ({
            ...row,
            geometry: typeof row.geometry === 'string' ? row.geometry : JSON.stringify(row.geometry)
        }));
        await deleteCollection(db, 'vru_exposure');
        await batchWrite(db, 'vru_exposure', formattedVru, (item) => String(item.segment_id));

        // 8. Sync Star Ratings
        console.log('Fetching star ratings...');
        const starRatingsRes = await query(`
            SELECT 
                sr.segment_id,
                ST_AsGeoJSON(rs.geometry)::json as geometry,
                sr.star_rating,
                sr.star_category,
                sr.infrastructure_sub,
                sr.speed_management_sub,
                sr.crash_history_sub,
                sr.vru_protection_sub,
                sr.srs_score,
                r.name as road_name,
                rd.road_class
            FROM star_ratings sr
            JOIN road_segments rs ON sr.segment_id = rs.id
            LEFT JOIN roads r ON rs.road_id = r.id
            LEFT JOIN roads rd ON rs.road_id = rd.id
            ORDER BY sr.star_rating ASC, sr.srs_score ASC LIMIT 1000
        `);
        const formattedStar = starRatingsRes.rows.map(row => ({
            ...row,
            geometry: typeof row.geometry === 'string' ? row.geometry : JSON.stringify(row.geometry)
        }));
        await deleteCollection(db, 'star_ratings');
        await batchWrite(db, 'star_ratings', formattedStar, (item) => String(item.segment_id));

        // Fetch and Sync Star Ratings Stats
        console.log('Fetching star rating stats...');
        const starDistRes = await query(`
            SELECT star_rating, star_category, COUNT(*) as count,
                   ROUND(AVG(srs_score)::numeric, 1) as avg_srs
            FROM star_ratings
            GROUP BY star_rating, star_category
            ORDER BY star_rating
        `);
        const starRoadClassRes = await query(`
            SELECT 
                rd.road_class,
                ROUND(AVG(sr.star_rating)::numeric, 1) as avg_stars,
                ROUND(AVG(sr.srs_score)::numeric, 1) as avg_srs,
                COUNT(*) as segment_count
            FROM star_ratings sr
            JOIN road_segments rs ON sr.segment_id = rs.id
            LEFT JOIN roads rd ON rs.road_id = rd.id
            GROUP BY rd.road_class
        `);
        await db.collection('star_ratings_meta').doc('stats').set({
            distribution: starDistRes.rows,
            byRoadClass: starRoadClassRes.rows
        });

        // 9. Sync Overall Stats (Dashboard stats)
        console.log('Fetching overall dashboard stats...');
        
        // Count priority distribution
        const piStats = await query(`
            SELECT 
                COUNT(*)::int as total,
                COUNT(*) FILTER (WHERE pi.priority_category = 'Critical Risk')::int as critical,
                COUNT(*) FILTER (WHERE pi.priority_category = 'High Risk')::int as high,
                COUNT(*) FILTER (WHERE pi.priority_category = 'Moderate Risk')::int as moderate,
                COUNT(*) FILTER (WHERE pi.priority_category = 'Low Risk')::int as low
            FROM priority_indices pi
            LEFT JOIN road_segments rs ON pi.segment_id = rs.id
            LEFT JOIN roads r ON rs.road_id = r.id
        `);
        const statsRow = piStats.rows[0] || { total: 0, critical: 0, high: 0, moderate: 0, low: 0 };

        // Fetch top recommendations
        const recsRes = await query(`
            SELECT rec.segment_id, rec.category as title, rec.recommended_action as action, 
                   CONCAT((rec.ai_confidence * 100)::int, '%') as conf,
                   r.name as road_name
            FROM recommendations rec
            LEFT JOIN road_segments rs ON rec.segment_id = rs.id
            LEFT JOIN roads r ON rs.road_id = r.id
            ORDER BY rec.ai_confidence DESC LIMIT 4
        `);
        const recommendations = recsRes.rows.map(r => ({ 
            ...r, 
            loc: `${r.road_name || 'Unnamed Road'} (ID: ${r.segment_id})` 
        }));

        // Fetch blackspots count
        const bsCountRes = await query(`
            SELECT COUNT(*)::int as count FROM black_spots WHERE is_black_spot = TRUE
        `);
        
        // Fetch avg star rating
        const avgStarRes = await query(`
            SELECT ROUND(AVG(star_rating)::numeric, 1) as avg_star FROM star_ratings
        `);

        // Fetch vru risk count
        const vruCountRes = await query(`
            SELECT COUNT(*)::int as count FROM vru_exposure WHERE vru_risk_category IN ('Critical VRU Risk', 'High VRU Risk')
        `);

        // Fetch trends
        const trendsRes = await query(`
            SELECT 
                TO_CHAR(a.date, 'Mon') as name,
                COUNT(*) FILTER (WHERE a.severity = 'Fatal')::int as fatal,
                COUNT(*) FILTER (WHERE a.severity = 'Serious')::int as serious,
                DATE_TRUNC('month', a.date) as month_date
            FROM accidents a
            GROUP BY TO_CHAR(a.date, 'Mon'), DATE_TRUNC('month', a.date)
            ORDER BY month_date
        `);
        let trends = trendsRes.rows;
        if (trends.length === 0) {
            trends = [
                { name: 'Jan', fatal: 12, serious: 25 },
                { name: 'Feb', fatal: 15, serious: 30 },
                { name: 'Mar', fatal: 10, serious: 20 },
                { name: 'Apr', fatal: 8,  serious: 15 },
            ];
        }

        // Fetch latest weather
        const weatherRes = await query(`
            SELECT temperature_2m, precipitation, visibility, wind_speed_10m, weather_code, overall_weather_risk_score 
            FROM weather_data ORDER BY timestamp DESC LIMIT 1
        `);

        await db.collection('stats_meta').doc('dashboard').set({
            total_segments: statsRow.total || 0,
            critical: statsRow.critical || 0,
            high: statsRow.high || 0,
            moderate: statsRow.moderate || 0,
            low: statsRow.low || 0,
            black_spots: bsCountRes.rows[0]?.count || 0,
            avg_star_rating: avgStarRes.rows[0]?.avg_star || 0,
            vru_high_risk: vruCountRes.rows[0]?.count || 0,
            trends: trends,
            recommendations: recommendations,
            weather: weatherRes.rows[0] || null
        });

        // 10. Sync Model Summary
        console.log('Fetching model summary stats...');
        const modelAvgRes = await query(`
            SELECT 
                ROUND(AVG(accident_score)::numeric, 1) as avg_accident,
                ROUND(AVG(speed_score)::numeric, 1) as avg_speed,
                ROUND(AVG(traffic_score)::numeric, 1) as avg_traffic,
                ROUND(AVG(infrastructure_score)::numeric, 1) as avg_infra,
                ROUND(AVG(predicted_risk)::numeric, 1) as avg_predicted
            FROM risk_scores
        `);
        const modelDistRes = await query(`
            SELECT 
                CASE 
                    WHEN predicted_risk < 10 THEN '0-10'
                    WHEN predicted_risk < 20 THEN '10-20'
                    WHEN predicted_risk < 30 THEN '20-30'
                    WHEN predicted_risk < 40 THEN '30-40'
                    WHEN predicted_risk < 50 THEN '40-50'
                    WHEN predicted_risk < 60 THEN '50-60'
                    WHEN predicted_risk < 70 THEN '60-70'
                    WHEN predicted_risk < 80 THEN '70-80'
                    WHEN predicted_risk < 90 THEN '80-90'
                    ELSE '90-100'
                END as range,
                COUNT(*) as count
            FROM risk_scores
            WHERE predicted_risk IS NOT NULL
            GROUP BY range
            ORDER BY range
        `);
        await db.collection('models_meta').doc('summary').set({
            averageScores: modelAvgRes.rows[0] || {},
            riskDistribution: modelDistRes.rows
        });

        // 11. Sync Categories Summary
        console.log('Fetching road categories summary...');
        const catRes = await query(`
            SELECT 
                CASE 
                    WHEN r.road_class IN ('Trunk', 'Trunk_link', 'Motorway', 'Motorway_link') THEN 'Highway'
                    WHEN r.road_class IN ('Primary', 'Primary_link') THEN 'Arterial'
                    ELSE 'Local'
                END as road_class,
                COUNT(rs.id)::int as segment_count,
                ROUND(AVG(pi.composite_pi)::numeric, 1)::float as avg_pi,
                MAX(pi.composite_pi)::float as max_pi,
                COUNT(*) FILTER (WHERE pi.priority_category = 'Critical Risk')::int as critical_count,
                COUNT(*) FILTER (WHERE pi.priority_category = 'High Risk')::int as high_count,
                COUNT(*) FILTER (WHERE pi.priority_category = 'Moderate Risk')::int as moderate_count,
                COUNT(*) FILTER (WHERE pi.priority_category = 'Low Risk')::int as low_count
            FROM road_segments rs
            LEFT JOIN roads r ON rs.road_id = r.id
            LEFT JOIN priority_indices pi ON rs.id = pi.segment_id
            GROUP BY 
                CASE 
                    WHEN r.road_class IN ('Trunk', 'Trunk_link', 'Motorway', 'Motorway_link') THEN 'Highway'
                    WHEN r.road_class IN ('Primary', 'Primary_link') THEN 'Arterial'
                    ELSE 'Local'
                END
        `);
        await db.collection('categories_meta').doc('summary').set({
            categories: catRes.rows
        });

        console.log('✅ Synchronization from PostgreSQL to Firebase Firestore complete!');
        return true;
    } catch (err) {
        console.error('❌ Error during synchronization:', err);
        return false;
    }
};
