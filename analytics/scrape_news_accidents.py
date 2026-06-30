import os
import urllib.request
import xml.etree.ElementTree as ET
import json
import hashlib
import psycopg2
from datetime import datetime
import random
import time

def fetch_news():
    url = 'https://news.google.com/rss/search?q=kerala+road+accident&hl=en-IN&gl=IN&ceid=IN:en'
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    res = urllib.request.urlopen(req)
    tree = ET.fromstring(res.read())
    
    items = []
    for item in tree.findall('.//item')[:15]: # Limit to 15 recent items
        title = item.find('title').text if item.find('title') is not None else ''
        description = item.find('description').text if item.find('description') is not None else ''
        link = item.find('link').text if item.find('link') is not None else ''
        pubDate = item.find('pubDate').text if item.find('pubDate') is not None else ''
        items.append({'title': title, 'description': description, 'link': link, 'pubDate': pubDate})
    return items

def extract_details_with_gemini(item):
    api_key_env = os.environ.get('GEMINI_API_KEY')
    if not api_key_env:
        print("No GEMINI_API_KEY found, skipping LLM extraction.")
        return None
        
    api_keys = [k.strip() for k in api_key_env.split(',') if k.strip()]
    if not api_keys:
        return None
    api_key = random.choice(api_keys)
        
    prompt = f"""You are an expert data extractor reading news about road accidents in Kerala, India.
Read the following news title and description:
Title: {item['title']}
Description: {item['description']}

Extract the exact location where the accident happened (e.g. City, Town, or Junction name). Provide ONLY the most specific place name mentioned, nothing else. If none is mentioned, return "Unknown".
Also extract:
- Severity (choose from: Fatal, Serious, Minor)
- Fatalities (integer)
- Injuries (integer)
- Vehicle Type (e.g. Bus, Car, Motorcycle, Truck, Unknown)
- Collision Type (e.g. Head-on, Rear-end, Pedestrian, Unknown)

Respond EXACTLY in this JSON format:
{{
  "location": "Place Name",
  "severity": "Fatal",
  "fatalities": 0,
  "injuries": 0,
  "vehicle_type": "Car",
  "collision_type": "Head-on"
}}
Ensure the JSON is strictly valid."""

    try:
        req = urllib.request.Request(
            f'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={api_key}',
            data=json.dumps({
                "contents": [{"parts": [{"text": prompt}]}],
                "generationConfig": {"temperature": 0.1, "responseMimeType": "application/json"}
            }).encode('utf-8'),
            headers={'Content-Type': 'application/json'},
            method='POST'
        )
        with urllib.request.urlopen(req) as response:
            result = json.loads(response.read().decode('utf-8'))
            text = result.get('candidates', [{}])[0].get('content', {}).get('parts', [{}])[0].get('text', '')
            if text:
                text = text.replace('```json', '').replace('```', '').strip()
                return json.loads(text)
    except Exception as e:
        print(f"Gemini API error: {e}")
    return None

def geocode_location(location_name):
    if location_name == "Unknown":
        return None
        
    # Append Kerala for better accuracy
    query = urllib.parse.quote(f"{location_name}, Kerala, India")
    url = f"https://nominatim.openstreetmap.org/search?q={query}&format=json&limit=1"
    
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'SRSMS_Script/1.0'})
        res = urllib.request.urlopen(req)
        data = json.loads(res.read().decode('utf-8'))
        if data and len(data) > 0:
            return float(data[0]['lat']), float(data[0]['lon'])
    except Exception as e:
        print(f"Geocoding error for {location_name}: {e}")
        
    return None

def main():
    print("Starting Accident News Scraper...")
    db_url = os.environ.get('DATABASE_URL', 'postgresql://srsms_user:srsms_password@db:5432/srsms')
    
    try:
        conn = psycopg2.connect(db_url)
        cursor = conn.cursor()
    except Exception as e:
        print(f"Failed to connect to database: {e}")
        return

    items = fetch_news()
    print(f"Fetched {len(items)} news items.")
    
    for item in items:
        # Generate a unique accident_id from the link
        accident_id = "news_" + hashlib.md5(item['link'].encode('utf-8')).hexdigest()[:15]
        
        # Check if already exists
        cursor.execute("SELECT id FROM accidents WHERE accident_id = %s", (accident_id,))
        if cursor.fetchone():
            continue # Already processed
            
        print(f"\nProcessing: {item['title']}")
        details = extract_details_with_gemini(item)
        
        if not details:
            print("Failed to extract details, skipping.")
            time.sleep(4)
            continue
            
        print(f"Extracted: {details}")
        
        lat, lon = None, None
        coords = geocode_location(details.get('location', 'Unknown'))
        
        if coords:
            lat, lon = coords
            print(f"Geocoded {details['location']} -> {lat}, {lon}")
        else:
            print(f"Geocoding failed for {details['location']}. Using random mockup location in Kerala.")
            # Random location roughly within Kerala bounds
            lat = 8.5 + random.random() * 4.0 # Roughly 8.5 to 12.5 N
            lon = 75.0 + random.random() * 2.5 # Roughly 75.0 to 77.5 E
            
        # Insert into database
        # Convert date
        try:
            from email.utils import parsedate_to_datetime
            dt = parsedate_to_datetime(item['pubDate'])
            date_str = dt.strftime('%Y-%m-%d')
            time_str = dt.strftime('%H:%M:%S')
        except:
            date_str = datetime.now().strftime('%Y-%m-%d')
            time_str = datetime.now().strftime('%H:%M:%S')

        try:
            query = """
                INSERT INTO accidents 
                (accident_id, date, time, severity, fatalities, injuries, vehicle_type, collision_type, geometry)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, ST_SetSRID(ST_MakePoint(%s, %s), 4326))
            """
            cursor.execute(query, (
                accident_id, date_str, time_str, 
                details.get('severity', 'Minor'), 
                details.get('fatalities', 0), 
                details.get('injuries', 0),
                details.get('vehicle_type', 'Unknown'),
                details.get('collision_type', 'Unknown'),
                lon, lat # ST_MakePoint takes (lon, lat)
            ))
            conn.commit()
            print("Successfully inserted into database.")
        except Exception as e:
            conn.rollback()
            print(f"Database insertion failed: {e}")
            
        # Be nice to APIs and avoid Gemini's strict 15 Requests/Min limits
        time.sleep(6)

    cursor.close()
    conn.close()
    print("\nScraping complete.")

if __name__ == "__main__":
    main()
