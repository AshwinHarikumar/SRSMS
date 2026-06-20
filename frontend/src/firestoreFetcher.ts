import { db } from './firebase';
import { collection, getDocs, getDoc, doc, setDoc, updateDoc } from 'firebase/firestore';

// Helper to construct a standard browser JSON Response
const makeJsonResponse = (data: any) => {
  const text = JSON.stringify(data);
  const encoder = new TextEncoder();
  const uint8Array = encoder.encode(text);
  
  return new Response(uint8Array, {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': uint8Array.length.toString()
    }
  });
};

export const firestoreFetcher = async (url: string, init?: RequestInit): Promise<Response> => {
  // Parse the URL
  const parsedUrl = new URL(url, window.location.origin);
  const pathname = parsedUrl.pathname;
  const searchParams = parsedUrl.searchParams;

  console.log(`📡 Firestore Fetch Interceptor: [${init?.method || 'GET'}] ${pathname}`);

  try {
    // 1. Districts
    if (pathname.endsWith('/api/data/districts')) {
      const res = await fetch('/data/districts.json');
      const districts = await res.json();
      return makeJsonResponse(districts);
    }

    // 2. Road Segments
    if (pathname.endsWith('/api/data/segments')) {
      const res = await fetch('/data/segments.json');
      const data = await res.json();
      let features = data.features || [];

      // Filter by district
      const districtId = searchParams.get('districtId');
      if (districtId && districtId !== 'All') {
        features = features.filter((f: any) => String(f.properties.district_id) === districtId);
      }

      // Filter by risk category colors (e.g. Red,Orange)
      const risk = searchParams.get('risk');
      if (risk) {
        const riskColors = risk.split(',');
        features = features.filter((f: any) => riskColors.includes(f.properties.color));
      }

      return makeJsonResponse({ type: 'FeatureCollection', features });
    }

    // 3. Accidents (Renders ALL 37,982 records)
    if (pathname.endsWith('/api/data/accidents')) {
      const res = await fetch('/data/accidents.json');
      const data = await res.json();
      let features = data.features || [];
      let summary = data.summary;

      // Filter by district if selected
      const districtId = searchParams.get('districtId');
      if (districtId && districtId !== 'All') {
        features = features.filter((f: any) => String(f.properties.district_id) === districtId);
        summary = data.districtSummaries[`district_${districtId}`] || summary;
      }

      return makeJsonResponse({ type: 'FeatureCollection', features, summary });
    }

    // 4. POIs
    if (pathname.endsWith('/api/data/pois')) {
      const res = await fetch('/data/pois.json');
      const data = await res.json();
      return makeJsonResponse(data);
    }

    // 5. Blackspots
    if (pathname.endsWith('/api/data/blackspots')) {
      const res = await fetch('/data/blackspots.json');
      const data = await res.json();
      return makeJsonResponse(data);
    }

    // 6. VRU Exposure
    if (pathname.endsWith('/api/data/vru-exposure')) {
      const res = await fetch('/data/vru-exposure.json');
      const data = await res.json();
      return makeJsonResponse(data);
    }

    // 7. Star Ratings
    if (pathname.endsWith('/api/data/star-ratings')) {
      const res = await fetch('/data/star-ratings.json');
      const data = await res.json();
      return makeJsonResponse(data);
    }

    // 8. Stats (Dashboard Stats)
    if (pathname.endsWith('/api/data/stats')) {
      const res = await fetch('/data/stats.json');
      const data = await res.json();
      const districtId = searchParams.get('districtId');
      if (districtId && districtId !== 'All') {
        return makeJsonResponse(data.districts[`stats_${districtId}`] || data.overall);
      }
      return makeJsonResponse(data.overall);
    }

    // 9. Star Ratings Stats
    if (pathname.endsWith('/api/data/star-ratings/stats')) {
      const res = await fetch('/data/star-rating-stats.json');
      const data = await res.json();
      return makeJsonResponse(data);
    }

    // 10. Model Summary
    if (pathname.endsWith('/api/data/models/summary')) {
      const res = await fetch('/data/model-summary.json');
      const data = await res.json();
      return makeJsonResponse(data);
    }

    // 11. Segments By Category
    if (pathname.endsWith('/api/data/segments/by-category')) {
      const res = await fetch('/data/categories-summary.json');
      const data = await res.json();
      return makeJsonResponse(data);
    }

    // 12. Active AHP Profile (Dynamic from Firestore with Static Fallback)
    if (pathname.endsWith('/api/data/ahp/active')) {
      try {
        const docSnap = await getDoc(doc(db, 'ahp_profiles_meta', 'active'));
        if (docSnap.exists()) {
          const data = docSnap.data();
          return makeJsonResponse({
            ...data,
            pairwise_matrix: typeof data.pairwise_matrix === 'string' ? JSON.parse(data.pairwise_matrix) : data.pairwise_matrix,
            derived_weights: typeof data.derived_weights === 'string' ? JSON.parse(data.derived_weights) : data.derived_weights
          });
        }
      } catch (e) {
        console.warn('Could not fetch active AHP from Firestore, using static config:', e);
      }
      const res = await fetch('/data/ahp-active.json');
      const data = await res.json();
      return makeJsonResponse(data);
    }

    // 13. AHP Profiles list (Dynamic from Firestore with Static Fallback)
    if (pathname.endsWith('/api/data/ahp/profiles') && init?.method !== 'POST') {
      try {
        const snap = await getDocs(collection(db, 'ahp_profiles'));
        if (!snap.empty) {
          const profiles = snap.docs.map(d => {
            const data = d.data();
            return {
              ...data,
              pairwise_matrix: typeof data.pairwise_matrix === 'string' ? JSON.parse(data.pairwise_matrix) : data.pairwise_matrix,
              derived_weights: typeof data.derived_weights === 'string' ? JSON.parse(data.derived_weights) : data.derived_weights
            };
          });
          return makeJsonResponse({ profiles });
        }
      } catch (e) {
        console.warn('Could not fetch AHP profiles from Firestore, using static config:', e);
      }
      const res = await fetch('/data/ahp-profiles.json');
      const data = await res.json();
      return makeJsonResponse(data);
    }

    // 14. AHP Profiles Save (POSTs to Firestore)
    if (pathname.endsWith('/api/data/ahp/profiles') && init?.method === 'POST') {
      const body = JSON.parse(init.body as string);
      const { profile_name, description, derived_weights, pairwise_matrix, consistency_ratio, is_consistent, activate } = body;
      const id = profile_name.replace(/\s+/g, '_').toLowerCase();
 
      const newProfile = {
        id,
        profile_name,
        description,
        pairwise_matrix: JSON.stringify(pairwise_matrix),
        derived_weights: JSON.stringify(derived_weights),
        consistency_ratio,
        is_consistent,
        is_active: activate || false,
        created_at: new Date().toISOString()
      };
 
      // Write to Firestore AHP collection
      await setDoc(doc(db, 'ahp_profiles', id), newProfile);
 
      // Handle activate toggle (deactivate previous active ones)
      if (activate) {
        const snap = await getDocs(collection(db, 'ahp_profiles'));
        for (const docRef of snap.docs) {
          if (docRef.id !== id && docRef.data().is_active) {
            await updateDoc(docRef.ref, { is_active: false });
          }
        }
        await setDoc(doc(db, 'ahp_profiles_meta', 'active'), newProfile);
      }
 
      return makeJsonResponse({
        status: 'success',
        profile: {
          ...newProfile,
          pairwise_matrix,
          derived_weights
        }
      });
    }

    // 15. Export Priority Rankings CSV
    if (pathname.endsWith('/api/data/export/rankings')) {
      const res = await fetch('/data/segments.json');
      const data = await res.json();
      const features = data.features || [];

      let csv = 'Segment ID,Road Name,Priority Index,Risk Level,Top Recommendation\n';
      features.forEach((f: any) => {
        const properties = f.properties;
        csv += `${properties.id},"${properties.road_name || ''}",${properties.pi},${properties.category},"None"\n`;
      });

      const encoder = new TextEncoder();
      const uint8Array = encoder.encode(csv);
      
      return new Response(uint8Array, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': 'attachment; filename="srsms_priority_rankings.csv"'
        }
      });
    }
 
    // 16. Segment Corrections (Uses Client-Side Groq API or Fallback)
    const segmentCorrectionsMatch = pathname.match(/\/api\/data\/segments\/(\d+)\/corrections$/);
    if (segmentCorrectionsMatch) {
      const segmentId = parseInt(segmentCorrectionsMatch[1], 10);
      const res = await fetch('/data/segments.json');
      const data = await res.json();
      const features = data.features || [];
      const segmentFeature = features.find((f: any) => f.properties.id === segmentId);
      if (!segmentFeature) {
        return new Response(JSON.stringify({ error: 'Segment not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const segment = segmentFeature.properties;
      const apiKey = import.meta.env.VITE_GROQ_API_KEY || localStorage.getItem('groq_api_key');

      if (apiKey) {
        try {
          const prompt = `You are an expert traffic safety engineer analyzing road segment ID ${segment.id} (${segment.road_name || 'Unnamed Road'}).
Road Details:
- Road Class: ${segment.road_class || 'Unknown'}
- Speed Limit: ${segment.speed_limit} km/h
- Traffic Volume: ${segment.traffic_volume || 0} vehicles/day
- Speed Violations: ${segment.speed_violations || 0} violations
- Priority Risk Level: ${segment.category} (PI score: ${segment.pi})
- Star Rating: ${segment.star_rating ? `${segment.star_rating} Stars` : 'Not Rated'}
- VRU Risk: ${segment.vru_risk_category || 'Low'} (Score: ${segment.vru_exposure_score || 0})
- MoRTH Black Spot: ${segment.is_black_spot ? `Yes (${segment.bs_accident_count} accidents, ${segment.bs_fatality_count} deaths)` : 'No'}

Risk Components (Scores out of 100):
- Crash History Score: ${segment.scores?.accident || 0}
- Speeding Score: ${segment.scores?.speed || 0}
- Infrastructure Deficit: ${segment.scores?.infra || 0}
- Weather Risk: ${segment.scores?.weather || 0}
- Geometry Risk: ${segment.scores?.geometry || 0}

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
                return makeJsonResponse({ corrections: parsed.corrections, source: 'groq' });
              }
            }
          } else {
            console.error('Groq client API error response:', await groqRes.text());
          }
        } catch (groqErr) {
          console.error('Failed calling Groq client API, falling back to rule-based logic:', groqErr);
        }
      }

      // Rule-Based Fallback logic
      const corrections: any[] = [];
      
      if (segment.is_black_spot || (segment.scores?.accident && segment.scores.accident > 50)) {
        corrections.push({
          category: 'Enforcement & Warning',
          action: 'Install speed enforcement cameras, dynamic speed feedback indicators, and high-visibility warning signs alerting drivers of the high-accident zone.',
          impact: 'High',
          cost: 'Low'
        });
      }
      if ((segment.scores?.speed && segment.scores.speed > 50) || (segment.speed_limit && segment.speed_limit > 60)) {
        corrections.push({
          category: 'Speed Calming',
          action: 'Implement traffic calming interventions such as rumble strips, speed humps, and optical speed bars to reduce average speeds.',
          impact: 'High',
          cost: 'Medium'
        });
      }
      if ((segment.vru_exposure_score && segment.vru_exposure_score > 30) || (segment.scores?.infra && segment.scores.infra > 40)) {
        corrections.push({
          category: 'Pedestrian Infrastructure',
          action: 'Construct raised pedestrian crossings with high-visibility zebra markings, install pedestrian refuge islands, and build continuous walkways/sidewalks.',
          impact: 'High',
          cost: 'Medium'
        });
      }
      if (segment.scores?.geometry && segment.scores.geometry > 40) {
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
      return makeJsonResponse({ corrections: finalCorrections, source: 'fallback' });
    }
 
    // Default error for unhandled endpoints
    return new Response(JSON.stringify({ error: `Not implemented client-side: ${pathname}` }), {
      status: 501,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err: any) {
    console.error(`❌ Firestore Fetch Error for ${pathname}:`, err);
    return new Response(JSON.stringify({ error: err.message || 'Firestore query failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
