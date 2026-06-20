import urllib.request, urllib.parse

query = """
[out:json][timeout:90];
area["name"="Kerala"]->.searchArea;
(
  way["highway"="motorway"](area.searchArea);
  way["highway"="trunk"](area.searchArea);
  way["highway"="primary"](area.searchArea);
  way["highway"="secondary"](area.searchArea);
);
out geom;
"""

print("Downloading OSM Data for Kerala...")
req = urllib.request.Request(
    'http://overpass-api.de/api/interpreter', 
    data=urllib.parse.urlencode({'data': query}).encode(),
    headers={
        'User-Agent': 'SRSMS-Analytics/1.0',
        'Accept': '*/*'
    }
)
try:
    res = urllib.request.urlopen(req)
    with open('OSM_KERALA.json', 'wb') as f:
        f.write(res.read())
    print("Download complete!")
except urllib.error.HTTPError as e:
    print(f"HTTP Error: {e.code} {e.reason}")
    print(e.read().decode())
