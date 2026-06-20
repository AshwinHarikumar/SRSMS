import { query } from './db';
import * as fs from 'fs';
import * as path from 'path';

const exportDir = path.join(__dirname, '../../frontend/public/data');

// Ensure export directory exists
if (!fs.existsSync(exportDir)) {
    fs.mkdirSync(exportDir, { recursive: true });
}

const writeJson = (filename: string, data: any) => {
    fs.writeFileSync(path.join(exportDir, filename), JSON.stringify(data, null, 2));
    console.log(`💾 Exported: ${filename}`);
};

const run = async () => {
    console.log('🚀 Starting Static Data Exporter (PostgreSQL -> frontend/public/data)...');
    const start = Date.now();
    try {
        // 1. Districts
        console.log('Exporting districts...');
        const districtsRes = await query('SELECT id, name FROM districts ORDER BY name ASC');
        writeJson('districts.json', districtsRes.rows);

        // 2. AHP Profiles
        console.log('Exporting AHP Profiles...');
        const ahpProfilesRes = await query('SELECT id, profile_name, description, derived_weights, pairwise_matrix, consistency_ratio, is_consistent, is_active, created_at FROM ahp_profiles ORDER BY created_at DESC');
        const formattedAhp = ahpProfilesRes.rows.map((row: any) => ({
            ...row,
            pairwise_matrix: typeof row.pairwise_matrix === 'string' ? JSON.parse(row.pairwise_matrix) : row.pairwise_matrix,
            derived_weights: typeof row.derived_weights === 'string' ? JSON.parse(row.derived_weights) : row.derived_weights
        }));
        writeJson('ahp-profiles.json', { profiles: formattedAhp });

        const activeProfile = formattedAhp.find((p: any) => p.is_active) || {
            profile_name: 'Default (Hardcoded)',
            weights: {
                accident: 0.30, speed: 0.15, traffic: 0.10,
                infrastructure: 0.10, vru: 0.30, geometry: 0.05
            },
            consistency_ratio: null
        };
        writeJson('ahp-active.json', activeProfile);

        // 3. POIs
        console.log('Exporting POIs...');
        const poisRes = await query('SELECT id, name, type, ST_AsGeoJSON(geometry) as geometry FROM pois');
        const poiFeatures = poisRes.rows.map(row => ({
            type: "Feature",
            geometry: typeof row.geometry === 'string' ? JSON.parse(row.geometry) : row.geometry,
            properties: {
                id: row.id,
                name: row.name,
                type: row.type
            }
        }));
        writeJson('pois.json', { type: "FeatureCollection", features: poiFeatures });

        // 4. Accidents (ALL 37,982 accidents)
        console.log('Exporting ALL accidents...');
        const accidentsRes = await query(`
            SELECT a.id, a.severity, a.fatalities, a.injuries, a.date, a.vehicle_type, a.collision_type,
                   a.segment_id, r.district_id,
                   ST_AsGeoJSON(a.geometry)::json as geometry 
            FROM accidents a
            LEFT JOIN road_segments rs ON a.segment_id = rs.id
            LEFT JOIN roads r ON rs.road_id = r.id
            ORDER BY a.date DESC
        `);
        const accidentFeatures = accidentsRes.rows.map(row => ({
            type: "Feature",
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
        
        // Calculate overall summary
        const totalAcc = accidentFeatures.length;
        const fatalAcc = accidentFeatures.filter(f => f.properties.severity === 'Fatal').length;
        const seriousAcc = accidentFeatures.filter(f => f.properties.severity === 'Serious').length;
        const minorAcc = accidentFeatures.filter(f => f.properties.severity === 'Minor').length;
        const fatalitiesAcc = accidentFeatures.reduce((sum, f) => sum + (f.properties.fatalities || 0), 0);
        const injuriesAcc = accidentFeatures.reduce((sum, f) => sum + (f.properties.injuries || 0), 0);

        const overallSummary = {
            total: totalAcc,
            fatal: fatalAcc,
            serious: seriousAcc,
            minor: minorAcc,
            totalFatalities: fatalitiesAcc,
            totalInjuries: injuriesAcc
        };

        // Calculate district specific summaries
        const districtSummaries: Record<string, any> = {};
        for (const dist of districtsRes.rows) {
            const distFeatures = accidentFeatures.filter(f => f.properties.district_id === dist.id);
            districtSummaries[`district_${dist.id}`] = {
                total: distFeatures.length,
                fatal: distFeatures.filter(f => f.properties.severity === 'Fatal').length,
                serious: distFeatures.filter(f => f.properties.severity === 'Serious').length,
                minor: distFeatures.filter(f => f.properties.severity === 'Minor').length,
                totalFatalities: distFeatures.reduce((sum, f) => sum + (f.properties.fatalities || 0), 0),
                totalInjuries: distFeatures.reduce((sum, f) => sum + (f.properties.injuries || 0), 0)
            };
        }

        writeJson('accidents.json', { 
            type: "FeatureCollection", 
            features: accidentFeatures,
            summary: overallSummary,
            districtSummaries: districtSummaries
        });

        // 5. Road Segments (Top 2,500 segments)
        console.log('Exporting road segments...');
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
        const segmentFeatures = segmentsRes.rows.map(row => ({
            type: "Feature",
            geometry: typeof row.geometry === 'string' ? JSON.parse(row.geometry) : row.geometry,
            properties: {
                id: row.id,
                road_id: row.road_id,
                speed_limit: row.speed_limit,
                pi: row.composite_pi,
                category: row.priority_category,
                color: row.color_code || 'Gray',
                predicted_risk: row.predicted_risk || 0,
                scores: {
                    accident: row.accident_score,
                    speed: row.speed_score,
                    traffic: row.traffic_score,
                    infra: row.infrastructure_score,
                    weather: row.weather_score,
                    geometry: row.geometry_score
                },
                star_rating: row.star_rating,
                star_category: row.star_category,
                srs_score: row.srs_score,
                star_sub_scores: {
                    infrastructure: row.infrastructure_sub,
                    speed_management: row.speed_management_sub,
                    crash_history: row.crash_history_sub,
                    vru_protection: row.vru_protection_sub
                },
                vru_exposure_score: row.vru_exposure_score,
                vru_risk_category: row.vru_risk_category,
                is_black_spot: row.is_black_spot,
                blackspot_probability: row.blackspot_probability,
                bs_accident_count: row.bs_accident_count,
                bs_fatality_count: row.bs_fatality_count,
                traffic_volume: row.traffic_volume,
                speed_violations: row.violation_count,
                road_name: row.road_name,
                road_class: row.road_class,
                district_id: row.district_id,
                district_name: row.district_name
            }
        }));
        writeJson('segments.json', { type: "FeatureCollection", features: segmentFeatures });

        // 6. Blackspots
        console.log('Exporting blackspots...');
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
        const blackspotFeatures = blackspotsRes.rows
            .filter(row => row.geometry)
            .map(row => ({
                type: "Feature",
                geometry: typeof row.geometry === 'string' ? JSON.parse(row.geometry) : row.geometry,
                properties: {
                    id: row.id,
                    segment_id: row.segment_id,
                    buffer_radius_m: row.buffer_radius_m,
                    accident_count: row.accident_count,
                    fatality_count: row.fatality_count,
                    serious_injury_count: row.serious_injury_count,
                    is_black_spot: row.is_black_spot,
                    ml_predicted_probability: row.ml_predicted_probability,
                    ml_predicted_class: row.ml_predicted_class,
                    road_name: row.road_name,
                    road_class: row.road_class,
                    composite_pi: row.composite_pi,
                    priority_category: row.priority_category
                }
            }));
        writeJson('blackspots.json', { type: "FeatureCollection", features: blackspotFeatures });

        // 7. VRU Exposure
        console.log('Exporting VRU exposure...');
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
        const vruFeatures = vruRes.rows.map(row => ({
            type: "Feature",
            geometry: typeof row.geometry === 'string' ? JSON.parse(row.geometry) : row.geometry,
            properties: {
                segment_id: row.segment_id,
                school_proximity_count: row.school_proximity_count,
                hospital_proximity_count: row.hospital_proximity_count,
                poi_proximity_count: row.poi_proximity_count,
                pedestrian_volume_estimate: row.pedestrian_volume_estimate,
                two_wheeler_mix: row.two_wheeler_mix,
                sidewalk_present: row.sidewalk_present,
                crossing_present: row.crossing_present,
                vru_exposure_score: row.vru_exposure_score,
                vru_risk_category: row.vru_risk_category,
                road_name: row.road_name,
                road_class: row.road_class
            }
        }));
        writeJson('vru-exposure.json', { type: "FeatureCollection", features: vruFeatures });

        // 8. Star Ratings
        console.log('Exporting Star Ratings...');
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
        const starFeatures = starRatingsRes.rows.map(row => ({
            type: "Feature",
            geometry: typeof row.geometry === 'string' ? JSON.parse(row.geometry) : row.geometry,
            properties: {
                segment_id: row.segment_id,
                star_rating: row.star_rating,
                star_category: row.star_category,
                srs_score: row.srs_score,
                sub_scores: {
                    infrastructure: row.infrastructure_sub,
                    speed_management: row.speed_management_sub,
                    crash_history: row.crash_history_sub,
                    vru_protection: row.vru_protection_sub
                },
                road_name: row.road_name,
                road_class: row.road_class
            }
        }));
        writeJson('star-ratings.json', { type: "FeatureCollection", features: starFeatures });

        // 9. Star Rating Stats
        console.log('Exporting star rating stats...');
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
            ORDER BY avg_stars ASC
        `);
        writeJson('star-rating-stats.json', {
            distribution: starDistRes.rows,
            byRoadClass: starRoadClassRes.rows
        });

        // 10. Dashboard Stats
        console.log('Exporting dashboard stats...');
        const piStats = await query(`
            SELECT 
                COUNT(*)::int as total,
                COUNT(*) FILTER (WHERE pi.priority_category = 'Critical Risk')::int as critical,
                COUNT(*) FILTER (WHERE pi.priority_category = 'High Risk')::int as high,
                COUNT(*) FILTER (WHERE pi.priority_category = 'Moderate Risk')::int as moderate,
                COUNT(*) FILTER (WHERE pi.priority_category = 'Low Risk')::int as low
            FROM priority_indices pi
        `);
        const statsRow = piStats.rows[0] || { total: 0, critical: 0, high: 0, moderate: 0, low: 0 };

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

        const bsCountRes = await query(`
            SELECT COUNT(*)::int as count FROM black_spots WHERE is_black_spot = TRUE
        `);
        const avgStarRes = await query(`
            SELECT ROUND(AVG(star_rating)::numeric, 1) as avg_star FROM star_ratings
        `);
        const vruCountRes = await query(`
            SELECT COUNT(*)::int as count FROM vru_exposure WHERE vru_risk_category IN ('Critical VRU Risk', 'High VRU Risk')
        `);

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

        const weatherRes = await query(`
            SELECT temperature_2m, precipitation, visibility, wind_speed_10m, weather_code, overall_weather_risk_score 
            FROM weather_data ORDER BY timestamp DESC LIMIT 1
        `);

        // Compute district specific stats too
        const statsByDistrict: Record<string, any> = {};
        for (const dist of districtsRes.rows) {
            const piStatsDist = await query(`
                SELECT 
                    COUNT(*)::int as total,
                    COUNT(*) FILTER (WHERE pi.priority_category = 'Critical Risk')::int as critical,
                    COUNT(*) FILTER (WHERE pi.priority_category = 'High Risk')::int as high,
                    COUNT(*) FILTER (WHERE pi.priority_category = 'Moderate Risk')::int as moderate,
                    COUNT(*) FILTER (WHERE pi.priority_category = 'Low Risk')::int as low
                FROM priority_indices pi
                LEFT JOIN road_segments rs ON pi.segment_id = rs.id
                LEFT JOIN roads r ON rs.road_id = r.id
                WHERE r.district_id = $1
            `, [dist.id]);
            const distStatsRow = piStatsDist.rows[0] || { total: 0, critical: 0, high: 0, moderate: 0, low: 0 };

            const bsCountDist = await query(`
                SELECT COUNT(*)::int as count 
                FROM black_spots bs
                LEFT JOIN road_segments rs ON bs.segment_id = rs.id
                LEFT JOIN roads r ON rs.road_id = r.id
                WHERE bs.is_black_spot = TRUE AND r.district_id = $1
            `, [dist.id]);

            const avgStarDist = await query(`
                SELECT ROUND(AVG(sr.star_rating)::numeric, 1) as avg_star 
                FROM star_ratings sr
                LEFT JOIN road_segments rs ON sr.segment_id = rs.id
                LEFT JOIN roads r ON rs.road_id = r.id
                WHERE r.district_id = $1
            `, [dist.id]);

            const vruCountDist = await query(`
                SELECT COUNT(*)::int as count 
                FROM vru_exposure vru
                LEFT JOIN road_segments rs ON vru.segment_id = rs.id
                LEFT JOIN roads r ON rs.road_id = r.id
                WHERE vru.vru_risk_category IN ('Critical VRU Risk', 'High VRU Risk') AND r.district_id = $1
            `, [dist.id]);

            statsByDistrict[`stats_${dist.id}`] = {
                total_segments: distStatsRow.total || 0,
                critical: distStatsRow.critical || 0,
                high: distStatsRow.high || 0,
                moderate: distStatsRow.moderate || 0,
                low: distStatsRow.low || 0,
                black_spots: bsCountDist.rows[0]?.count || 0,
                avg_star_rating: avgStarDist.rows[0]?.avg_star || 0,
                vru_high_risk: vruCountDist.rows[0]?.count || 0,
                trends: trends,
                recommendations: recommendations,
                weather: weatherRes.rows[0] || null
            };
        }

        writeJson('stats.json', {
            overall: {
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
            },
            districts: statsByDistrict
        });

        // 11. Model Summary
        console.log('Exporting model summary stats...');
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
        writeJson('model-summary.json', {
            averageScores: modelAvgRes.rows[0] || {},
            riskDistribution: modelDistRes.rows
        });

        // 12. Categories Summary
        console.log('Exporting categories summary...');
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
        writeJson('categories-summary.json', {
            categories: catRes.rows
        });

        console.log(`✅ Static Data Exporter completed successfully in ${((Date.now() - start) / 1000).toFixed(1)}s!`);
        process.exit(0);
    } catch (err) {
        console.error('❌ Exporter failed:', err);
        process.exit(1);
    }
};

run();
