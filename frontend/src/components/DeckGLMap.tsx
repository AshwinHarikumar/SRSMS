import React, { useMemo } from 'react';
import DeckGL from '@deck.gl/react';
import { AmbientLight, PointLight, LightingEffect } from '@deck.gl/core';
import { HexagonLayer } from '@deck.gl/aggregation-layers';
import { TileLayer } from '@deck.gl/geo-layers';
import { BitmapLayer } from '@deck.gl/layers';

const ambientLight = new AmbientLight({
  color: [255, 255, 255],
  intensity: 1.0
});

const pointLight1 = new PointLight({
  color: [255, 255, 255],
  intensity: 2.0,
  position: [76.0, 10.5, 8000]
});

const pointLight2 = new PointLight({
  color: [255, 255, 255],
  intensity: 0.8,
  position: [76.5, 11.0, 8000]
});

const lightingEffect = new LightingEffect({ambientLight, pointLight1, pointLight2});

const INITIAL_VIEW_STATE = {
  longitude: 76.2711,
  latitude: 10.0505, // Shifted slightly for better angled view
  zoom: 9,
  pitch: 60, // Steeper pitch for better 3D effect
  bearing: 15
};

const material = {
  ambient: 0.64,
  diffuse: 0.6,
  shininess: 32,
  specularColor: [51, 51, 51] as [number, number, number]
};

export default function DeckGLMap({ geoData }: { geoData: any }) {
  // Extract first points from LineStrings to act as the aggregation centers
  const data = useMemo(() => {
    if (!geoData || !geoData.features) return [];
    return geoData.features.map((f: any) => {
      const coords = f.geometry.type === 'LineString' ? f.geometry.coordinates[0] : f.geometry.coordinates; 
      return {
        position: coords,
        risk: f.properties.predicted_risk || 0
      };
    }).filter((d: any) => d.position && d.position.length >= 2);
  }, [geoData]);

  // Base map tiles using CartoDB Positron
  const tileLayer = new TileLayer({
    id: 'tile-layer',
    data: 'https://c.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
    minZoom: 0,
    maxZoom: 19,
    tileSize: 256,
    renderSubLayers: (props: any) => {
      const {
        bbox: { west, south, east, north }
      } = props.tile;

      return new BitmapLayer(props, {
        data: undefined,
        image: props.data,
        bounds: [west, south, east, north]
      });
    }
  });

  // 3D Hexagon layer based on predicted risk
  const hexLayer = new HexagonLayer({
    id: 'hexagon-layer',
    data,
    pickable: true,
    extruded: true,
    radius: 400, // Smaller hexagons for higher resolution
    elevationScale: 300, // Exaggerate elevation significantly
    getPosition: (d: any) => d.position,
    getElevationWeight: (d: any) => d.risk,
    getColorWeight: (d: any) => d.risk,
    colorAggregation: 'MAX',
    elevationAggregation: 'MAX',
    material,
    colorRange: [
      [255, 237, 160], // Yellow
      [254, 178, 76],  // Light Orange
      [253, 141, 60],  // Orange
      [252, 78, 42],   // Red-Orange
      [227, 26, 28],   // Red
      [177, 0, 38]     // Dark Red (Highest Risk)
    ],
    transitions: {
      elevationScale: 1000
    }
  });

  return (
    <div className="absolute inset-0 z-0 bg-slate-900">
      <DeckGL
        initialViewState={INITIAL_VIEW_STATE}
        controller={true}
        effects={[lightingEffect]}
        layers={[tileLayer, hexLayer]}
        getTooltip={({object}) => object && `Max Predicted AI Risk: ${Math.round(object.elevationValue)}%`}
      />
    </div>
  );
}
