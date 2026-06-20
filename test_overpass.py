import requests
q = '[out:json][timeout:30][bbox:8.1,74.8,12.8,77.5];(way["highway"~"motorway|trunk|primary|secondary"];);out geom;'
headers = {'User-Agent': 'SRSMSMapApp/1.0 (contact@srsms.gov)'}
r = requests.post('https://overpass-api.de/api/interpreter', data={'data': q}, headers=headers)
print(r.status_code)
print(r.text[:500])
