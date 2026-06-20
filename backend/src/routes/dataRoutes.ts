import { Router } from 'express';
import { query } from '../db';
import { syncPostgresToFirestore } from '../syncService';

const router = Router();

router.get('/segments', async (req, res) => {
    try {
        const riskFilter = req.query.risk as string;
        const districtId = req.query.districtId ? parseInt(req.query.districtId as string, 10) : null;
        
        let queryStr = `
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
        `;
        
        let params: any[] = [];
        let whereClauses: string[] = [];
        
        if (riskFilter) {
            params.push(riskFilter.split(','));
            whereClauses.push(`pi.color_code = ANY($${params.length})`);
        }
        if (districtId) {
            params.push(districtId);
            whereClauses.push(`rd.district_id = $${params.length}`);
        }
        
        if (whereClauses.length > 0) {
            queryStr += ` WHERE ` + whereClauses.join(' AND ');
        }
        
        queryStr += ` ORDER BY pi.composite_pi DESC NULLS LAST LIMIT 2500`;
 
        const result = await query(queryStr, params);
        
        const featureCollection = {
            type: "FeatureCollection",
            features: result.rows.map(row => ({
                type: "Feature",
                geometry: row.geometry,
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
            }))
        };
        res.json(featureCollection);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error' });
    }
});

router.get('/segments/:id/corrections', async (req, res) => {
    try {
        const segmentId = parseInt(req.params.id, 10);
        if (isNaN(segmentId)) {
            return res.status(400).json({ error: 'Invalid segment ID' });
        }

        const queryStr = `
            SELECT 
                rs.id, 
                rs.speed_limit, 
                pi.composite_pi,
                pi.priority_category,
                r.accident_score,
                r.speed_score,
                r.traffic_score,
                r.infrastructure_score,
                COALESCE(r.weather_score, 0) as weather_score,
                COALESCE(r.geometry_score, 0) as geometry_score,
                COALESCE(sr.star_rating, 0) as star_rating,
                COALESCE(vru.vru_exposure_score, 0) as vru_exposure_score,
                vru.vru_risk_category,
                COALESCE(bs.is_black_spot, false) as is_black_spot,
                bs.accident_count as bs_accident_count,
                bs.fatality_count as bs_fatality_count,
                COALESCE(td.traffic_volume, 0) as traffic_volume,
                COALESCE(sd.violation_count, 0) as violation_count,
                rd.name as road_name,
                rd.road_class
            FROM road_segments rs
            LEFT JOIN priority_indices pi ON rs.id = pi.segment_id
            LEFT JOIN risk_scores r ON rs.id = r.segment_id
            LEFT JOIN star_ratings sr ON rs.id = sr.segment_id
            LEFT JOIN vru_exposure vru ON rs.id = vru.segment_id
            LEFT JOIN black_spots bs ON rs.id = bs.segment_id
            LEFT JOIN traffic_data td ON rs.id = td.segment_id
            LEFT JOIN speed_data sd ON rs.id = sd.segment_id
            LEFT JOIN roads rd ON rs.road_id = rd.id
            WHERE rs.id = $1
        `;

        const result = await query(queryStr, [segmentId]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Segment not found' });
        }

        const segment = result.rows[0];
        const apiKey = process.env.GROQ_API_KEY;

        if (apiKey) {
            try {
                const prompt = `You are an expert traffic safety engineer analyzing road segment ID ${segment.id} (${segment.road_name || 'Unnamed Road'}).
Road Details:
- Road Class: ${segment.road_class || 'Unknown'}
- Speed Limit: ${segment.speed_limit} km/h
- Traffic Volume: ${segment.traffic_volume} vehicles/day
- Speed Violations: ${segment.violation_count} violations
- Priority Risk Level: ${segment.priority_category} (PI score: ${segment.composite_pi})
- Star Rating: ${segment.star_rating ? `${segment.star_rating} Stars` : 'Not Rated'}
- VRU Risk: ${segment.vru_risk_category || 'Low'} (Score: ${segment.vru_exposure_score})
- MoRTH Black Spot: ${segment.is_black_spot ? `Yes (${segment.bs_accident_count} accidents, ${segment.bs_fatality_count} deaths)` : 'No'}

Risk Components (Scores out of 100):
- Crash History Score: ${segment.accident_score || 0}
- Speeding Score: ${segment.speed_score || 0}
- Infrastructure Deficit: ${segment.infrastructure_score || 0}
- Weather Risk: ${segment.weather_score}
- Geometry Risk: ${segment.geometry_score}

Generate exactly 3 specific, highly-actionable road safety corrections/engineering solutions to reduce risk on this segment.
Format your output as a JSON object with a single key "corrections", containing an array of 3 objects. Each object must have these exact keys:
- "category": Short category (e.g., "Speed Calming", "Pedestrian Infrastructure", "Lighting & Visibility", "Intersection Control", "Road Geometry")
- "action": Precise, professional safety correction to implement
- "impact": Expected safety impact (e.g., "High", "Medium", "Low")
- "cost": Relative cost (e.g., "Low", "Medium", "High")

Ensure the JSON output is strictly valid and matches the requested schema.`;

                const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${apiKey}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        model: 'llama-3.3-70b-versatile',
                        messages: [
                            { role: 'user', content: prompt }
                        ],
                        response_format: { type: 'json_object' }
                    })
                });

                if (groqRes.ok) {
                    const groqData = await groqRes.json();
                    const contentStr = groqData.choices?.[0]?.message?.content;
                    if (contentStr) {
                        const parsed = JSON.parse(contentStr);
                        if (parsed.corrections && Array.isArray(parsed.corrections)) {
                            return res.json({ corrections: parsed.corrections, source: 'groq' });
                        }
                    }
                } else {
                    console.error('Groq API error response:', await groqRes.text());
                }
            } catch (groqErr) {
                console.error('Failed calling Groq API, falling back to rule-based logic:', groqErr);
            }
        }

        // Rule-Based Fallback logic
        const corrections: any[] = [];
        
        if (segment.is_black_spot || (segment.accident_score && segment.accident_score > 50)) {
            corrections.push({
                category: 'Enforcement & Warning',
                action: 'Install speed enforcement cameras, dynamic speed feedback indicators, and high-visibility warning signs alerting drivers of the high-accident zone.',
                impact: 'High',
                cost: 'Low'
            });
        }
        if ((segment.speed_score && segment.speed_score > 50) || (segment.speed_limit && segment.speed_limit > 60)) {
            corrections.push({
                category: 'Speed Calming',
                action: 'Implement traffic calming interventions such as rumble strips, speed humps, and optical speed bars to reduce average speeds.',
                impact: 'High',
                cost: 'Medium'
            });
        }
        if ((segment.vru_exposure_score && segment.vru_exposure_score > 30) || (segment.infrastructure_score && segment.infrastructure_score > 40)) {
            corrections.push({
                category: 'Pedestrian Infrastructure',
                action: 'Construct raised pedestrian crossings with high-visibility zebra markings, install pedestrian refuge islands, and build continuous walkways/sidewalks.',
                impact: 'High',
                cost: 'Medium'
            });
        }
        if (segment.geometry_score && segment.geometry_score > 40) {
            corrections.push({
                category: 'Road Alignment',
                action: 'Improve road banking (superelevation) on sharp horizontal curves, apply high-friction surface treatment (HFST), and clear sightline obstructions.',
                impact: 'High',
                cost: 'High'
            });
        }

        // Fill in defaults if we have fewer than 3 corrections
        if (corrections.length < 3) {
            corrections.push({
                category: 'Lighting & Delineation',
                action: 'Install high-efficiency LED street lighting and place reflective road studs (cat\'s eyes) to enhance night-time visibility and lane discipline.',
                impact: 'Medium',
                cost: 'Low'
            });
        }
        if (corrections.length < 3) {
            corrections.push({
                category: 'Road Markings',
                action: 'Repaint thermoplastic center line and edge line markings to clearly demarcate lanes, and install retroreflective road signages.',
                impact: 'Medium',
                cost: 'Low'
            });
        }

        const finalCorrections = corrections.slice(0, 3);
        res.json({ corrections: finalCorrections, source: 'fallback' });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error' });
    }
});

router.get('/accidents', async (req, res) => {
    try {
        const districtId = req.query.districtId ? parseInt(req.query.districtId as string, 10) : null;
        
        let featuresQuery = `
            SELECT a.id, a.severity, a.fatalities, a.injuries, a.date, a.vehicle_type, a.collision_type,
                   ST_AsGeoJSON(a.geometry)::json as geometry 
            FROM accidents a
        `;
        let summaryQuery = `
            SELECT 
                COUNT(*)::int as total,
                COUNT(*) FILTER (WHERE severity = 'Fatal')::int as fatal,
                COUNT(*) FILTER (WHERE severity = 'Serious')::int as serious,
                COUNT(*) FILTER (WHERE severity = 'Minor')::int as minor,
                COALESCE(SUM(fatalities), 0)::int as fatalities,
                COALESCE(SUM(injuries), 0)::int as injuries
            FROM accidents a
        `;
        
        const params: any[] = [];
        if (districtId) {
            featuresQuery += `
                JOIN road_segments rs ON a.segment_id = rs.id
                JOIN roads r ON rs.road_id = r.id
                WHERE r.district_id = $1
            `;
            summaryQuery += `
                JOIN road_segments rs ON a.segment_id = rs.id
                JOIN roads r ON rs.road_id = r.id
                WHERE r.district_id = $1
            `;
            params.push(districtId);
        }
        
        featuresQuery += ` ORDER BY a.date DESC LIMIT 1000`;
        
        const [featuresResult, summaryResult] = await Promise.all([
            query(featuresQuery, params),
            query(summaryQuery, params)
        ]);
        
        const summary = summaryResult.rows[0] || { total: 0, fatal: 0, serious: 0, minor: 0, fatalities: 0, injuries: 0 };
        
        const featureCollection = {
            type: "FeatureCollection",
            features: featuresResult.rows.map(row => ({
                type: "Feature",
                geometry: row.geometry,
                properties: {
                    id: row.id,
                    severity: row.severity,
                    fatalities: row.fatalities,
                    injuries: row.injuries,
                    date: row.date,
                    vehicle_type: row.vehicle_type,
                    collision_type: row.collision_type
                }
            })),
            summary: {
                total: summary.total,
                fatal: summary.fatal,
                serious: summary.serious,
                minor: summary.minor,
                totalFatalities: summary.fatalities,
                totalInjuries: summary.injuries
            }
        };
        res.json(featureCollection);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error' });
    }
});

router.get('/districts', async (req, res) => {
    try {
        const result = await query(`
            SELECT id, name 
            FROM districts
            ORDER BY name ASC
        `);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error' });
    }
});

router.get('/export/rankings', async (req, res) => {
    try {
        const result = await query(`
            SELECT 
                rs.id as segment_id, 
                r.name as road_name, 
                pi.composite_pi as priority_index, 
                pi.priority_category as risk_level,
                rec.recommended_action as top_recommendation
            FROM priority_indices pi
            JOIN road_segments rs ON pi.segment_id = rs.id
            LEFT JOIN roads r ON rs.road_id = r.id
            LEFT JOIN (
                SELECT DISTINCT ON (segment_id) segment_id, recommended_action 
                FROM recommendations 
                ORDER BY segment_id, ai_confidence DESC
            ) rec ON pi.segment_id = rec.segment_id
            ORDER BY pi.composite_pi DESC
        `);

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="srsms_priority_rankings.csv"');
        
        let csv = 'Segment ID,Road Name,Priority Index,Risk Level,Top Recommendation\n';
        result.rows.forEach(row => {
            csv += `${row.segment_id},"${row.road_name || ''}",${row.priority_index},${row.risk_level},"${row.top_recommendation || 'None'}"\n`;
        });
        
        res.send(csv);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error' });
    }
});

router.get('/stats', async (req, res) => {
    try {
        const districtId = req.query.districtId ? parseInt(req.query.districtId as string, 10) : null;
        
        let piQuery = `
            SELECT 
                COUNT(*)::int as total,
                COUNT(*) FILTER (WHERE pi.priority_category = 'Critical Risk')::int as critical,
                COUNT(*) FILTER (WHERE pi.priority_category = 'High Risk')::int as high,
                COUNT(*) FILTER (WHERE pi.priority_category = 'Moderate Risk')::int as moderate,
                COUNT(*) FILTER (WHERE pi.priority_category = 'Low Risk')::int as low
            FROM priority_indices pi
            LEFT JOIN road_segments rs ON pi.segment_id = rs.id
            LEFT JOIN roads r ON rs.road_id = r.id
        `;
        
        let recsQuery = `
            SELECT rec.segment_id, rec.category as title, rec.recommended_action as action, 
                   CONCAT((rec.ai_confidence * 100)::int, '%') as conf,
                   r.name as road_name
            FROM recommendations rec
            LEFT JOIN road_segments rs ON rec.segment_id = rs.id
            LEFT JOIN roads r ON rs.road_id = r.id
        `;
        
        let bsQuery = `
            SELECT COUNT(*)::int as count 
            FROM black_spots bs
            LEFT JOIN road_segments rs ON bs.segment_id = rs.id
            LEFT JOIN roads r ON rs.road_id = r.id
            WHERE bs.is_black_spot = TRUE
        `;
        
        let starQuery = `
            SELECT ROUND(AVG(sr.star_rating)::numeric, 1) as avg_star 
            FROM star_ratings sr
            LEFT JOIN road_segments rs ON sr.segment_id = rs.id
            LEFT JOIN roads r ON rs.road_id = r.id
        `;
        
        let vruQuery = `
            SELECT COUNT(*)::int as count 
            FROM vru_exposure vru
            LEFT JOIN road_segments rs ON vru.segment_id = rs.id
            LEFT JOIN roads r ON rs.road_id = r.id
            WHERE vru.vru_risk_category IN ('Critical VRU Risk', 'High VRU Risk')
        `;
        
        let trendsQuery = `
            SELECT 
                TO_CHAR(a.date, 'Mon') as name,
                COUNT(*) FILTER (WHERE a.severity = 'Fatal')::int as fatal,
                COUNT(*) FILTER (WHERE a.severity = 'Serious')::int as serious,
                DATE_TRUNC('month', a.date) as month_date
            FROM accidents a
            LEFT JOIN road_segments rs ON a.segment_id = rs.id
            LEFT JOIN roads r ON rs.road_id = r.id
        `;
        
        const params: any[] = [];
        if (districtId) {
            params.push(districtId);
            piQuery += ` WHERE r.district_id = $1`;
            recsQuery += ` WHERE r.district_id = $1`;
            bsQuery += ` AND r.district_id = $1`;
            starQuery += ` WHERE r.district_id = $1`;
            vruQuery += ` AND r.district_id = $1`;
            trendsQuery += ` WHERE r.district_id = $1`;
        }
        
        recsQuery += ` ORDER BY rec.ai_confidence DESC LIMIT 4`;
        trendsQuery += ` GROUP BY TO_CHAR(a.date, 'Mon'), DATE_TRUNC('month', a.date) ORDER BY month_date`;
        
        const [result, recs, bsResult, starResult, vruResult, weatherResult, trendsResult] = await Promise.all([
            query(piQuery, params),
            query(recsQuery, params),
            query(bsQuery, params),
            query(starQuery, params),
            query(vruQuery, params),
            query(`SELECT temperature_2m, precipitation, visibility, wind_speed_10m, weather_code, overall_weather_risk_score FROM weather_data ORDER BY timestamp DESC LIMIT 1`),
            query(trendsQuery, params)
        ]);

        let trends = trendsResult.rows;
        if (trends.length === 0) {
            trends = [
                { name: 'Jan', fatal: 12, serious: 25 },
                { name: 'Feb', fatal: 15, serious: 30 },
                { name: 'Mar', fatal: 10, serious: 20 },
                { name: 'Apr', fatal: 8,  serious: 15 },
            ];
        }

        res.json({
            total_segments: result.rows[0].total || 0,
            critical: result.rows[0].critical || 0,
            high: result.rows[0].high || 0,
            moderate: result.rows[0].moderate || 0,
            low: result.rows[0].low || 0,
            black_spots: bsResult.rows[0]?.count || 0,
            avg_star_rating: starResult.rows[0]?.avg_star || 0,
            vru_high_risk: vruResult.rows[0]?.count || 0,
            trends: trends,
            recommendations: recs.rows.map(r => ({ 
                ...r, 
                loc: `${r.road_name || 'Unnamed Road'} (ID: ${r.segment_id})` 
            })),
            weather: weatherResult.rows[0] || null
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch stats' });
    }
});

router.get('/pois', async (req, res) => {
    try {
        const result = await query(`
            SELECT id, name, type, ST_AsGeoJSON(geometry) as geometry
            FROM pois
        `);
        const features = result.rows.map(row => ({
            type: "Feature",
            geometry: JSON.parse(row.geometry),
            properties: {
                id: row.id,
                name: row.name,
                type: row.type
            }
        }));
        res.json({ type: "FeatureCollection", features });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch POIs' });
    }
});

router.get('/segments/by-category', async (req, res) => {
    try {
        const districtId = req.query.districtId ? parseInt(req.query.districtId as string, 10) : null;
        
        let queryStr = `
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
        `;
        
        const params: any[] = [];
        if (districtId) {
            params.push(districtId);
            queryStr += ` WHERE r.district_id = $1`;
        }
        
        queryStr += `
            GROUP BY 
                CASE 
                    WHEN r.road_class IN ('Trunk', 'Trunk_link', 'Motorway', 'Motorway_link') THEN 'Highway'
                    WHEN r.road_class IN ('Primary', 'Primary_link') THEN 'Arterial'
                    ELSE 'Local'
                END
            ORDER BY avg_pi DESC NULLS LAST
        `;

        const result = await query(queryStr, params);
        res.json({ categories: result.rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch categories' });
    }
});

router.get('/models/summary', async (req, res) => {
    try {
        const avgScores = await query(`
            SELECT 
                ROUND(AVG(accident_score)::numeric, 1) as avg_accident,
                ROUND(AVG(speed_score)::numeric, 1) as avg_speed,
                ROUND(AVG(traffic_score)::numeric, 1) as avg_traffic,
                ROUND(AVG(infrastructure_score)::numeric, 1) as avg_infra,
                ROUND(AVG(predicted_risk)::numeric, 1) as avg_predicted
            FROM risk_scores
        `);

        const distribution = await query(`
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

        res.json({
            averageScores: avgScores.rows[0] || {},
            riskDistribution: distribution.rows
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch model summary' });
    }
});

// ──────────────────────────────────────────
// BLACK SPOT ENDPOINTS
// ──────────────────────────────────────────

router.get('/blackspots', async (req, res) => {
    try {
        const result = await query(`
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
                bs.analysis_period_start,
                bs.analysis_period_end,
                r.name as road_name,
                rd.road_class,
                pi.composite_pi,
                pi.priority_category
            FROM black_spots bs
            LEFT JOIN road_segments rs ON bs.segment_id = rs.id
            LEFT JOIN roads r ON rs.road_id = r.id
            LEFT JOIN roads rd ON rs.road_id = rd.id
            LEFT JOIN priority_indices pi ON bs.segment_id = pi.segment_id
            ORDER BY bs.accident_count DESC, bs.fatality_count DESC
        `);

        const featureCollection = {
            type: "FeatureCollection",
            features: result.rows
                .filter(row => row.geometry)
                .map(row => ({
                    type: "Feature",
                    geometry: row.geometry,
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
                }))
        };
        res.json(featureCollection);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch black spots' });
    }
});

// ──────────────────────────────────────────
// VRU EXPOSURE ENDPOINTS
// ──────────────────────────────────────────

router.get('/vru-exposure', async (req, res) => {
    try {
        const result = await query(`
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
            ORDER BY vru.vru_exposure_score DESC
        `);

        const featureCollection = {
            type: "FeatureCollection",
            features: result.rows.map(row => ({
                type: "Feature",
                geometry: row.geometry,
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
            }))
        };
        res.json(featureCollection);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch VRU exposure data' });
    }
});

// ──────────────────────────────────────────
// STAR RATING ENDPOINTS
// ──────────────────────────────────────────

router.get('/star-ratings', async (req, res) => {
    try {
        const result = await query(`
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
            ORDER BY sr.star_rating ASC, sr.srs_score ASC
        `);

        const featureCollection = {
            type: "FeatureCollection",
            features: result.rows.map(row => ({
                type: "Feature",
                geometry: row.geometry,
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
            }))
        };
        res.json(featureCollection);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch star ratings' });
    }
});

router.get('/star-ratings/stats', async (req, res) => {
    try {
        const distribution = await query(`
            SELECT star_rating, star_category, COUNT(*) as count,
                   ROUND(AVG(srs_score)::numeric, 1) as avg_srs
            FROM star_ratings
            GROUP BY star_rating, star_category
            ORDER BY star_rating
        `);

        const byRoadClass = await query(`
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

        res.json({
            distribution: distribution.rows,
            byRoadClass: byRoadClass.rows
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch star rating stats' });
    }
});

// ──────────────────────────────────────────
// AHP ENDPOINTS
// ──────────────────────────────────────────

router.get('/ahp/active', async (req, res) => {
    try {
        const result = await query(`
            SELECT id, profile_name, description, pairwise_matrix, derived_weights, 
                   consistency_ratio, is_consistent, created_at
            FROM ahp_profiles 
            WHERE is_active = TRUE 
            LIMIT 1
        `);

        if (result.rows.length === 0) {
            return res.json({
                profile_name: 'Default (Hardcoded)',
                weights: {
                    accident: 0.30, speed: 0.15, traffic: 0.10,
                    infrastructure: 0.10, vru: 0.30, geometry: 0.05
                },
                consistency_ratio: null
            });
        }

        const profile = result.rows[0];
        res.json({
            id: profile.id,
            profile_name: profile.profile_name,
            description: profile.description,
            pairwise_matrix: profile.pairwise_matrix,
            weights: profile.derived_weights,
            consistency_ratio: profile.consistency_ratio,
            is_consistent: profile.is_consistent,
            created_at: profile.created_at
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch active AHP profile' });
    }
});

router.get('/ahp/profiles', async (req, res) => {
    try {
        const result = await query(`
            SELECT id, profile_name, description, derived_weights, 
                   consistency_ratio, is_consistent, is_active, created_at
            FROM ahp_profiles 
            ORDER BY created_at DESC
        `);
        res.json({ profiles: result.rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch AHP profiles' });
    }
});

router.post('/ahp/profiles', async (req, res) => {
    try {
        const { profile_name, description, derived_weights, pairwise_matrix, consistency_ratio, is_consistent, activate } = req.body;

        if (activate) {
            await query(`UPDATE ahp_profiles SET is_active = FALSE WHERE is_active = TRUE`);
        }

        const result = await query(`
            INSERT INTO ahp_profiles (profile_name, description, pairwise_matrix, derived_weights, consistency_ratio, is_consistent, is_active)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            ON CONFLICT (profile_name) DO UPDATE SET
                description = EXCLUDED.description,
                pairwise_matrix = EXCLUDED.pairwise_matrix,
                derived_weights = EXCLUDED.derived_weights,
                consistency_ratio = EXCLUDED.consistency_ratio,
                is_consistent = EXCLUDED.is_consistent,
                is_active = EXCLUDED.is_active,
                created_at = CURRENT_TIMESTAMP
            RETURNING *
        `, [profile_name, description, JSON.stringify(pairwise_matrix), JSON.stringify(derived_weights), consistency_ratio, is_consistent, activate || false]);

        res.json({ status: 'success', profile: result.rows[0] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to save AHP profile' });
    }
});

router.post('/sync', async (req, res) => {
    try {
        const success = await syncPostgresToFirestore();
        if (success) {
            res.json({ status: 'success', message: 'Synchronization successful' });
        } else {
            res.status(500).json({ error: 'Sync failed, check server logs' });
        }
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
