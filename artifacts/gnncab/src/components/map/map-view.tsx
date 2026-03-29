import React, { useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Fix default icon issue in Leaflet with React
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

const customDriverIcon = new L.Icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png", // In a real app, use a car icon
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  shadowSize: [41, 41],
  className: "hue-rotate-180" // Quick CSS hack to make marker amber colored
});

interface MapViewProps {
  center: [number, number];
  zoom?: number;
  markers?: Array<{
    id: string;
    lat: number;
    lng: number;
    title?: string;
    description?: string;
    isDriver?: boolean;
  }>;
  className?: string;
  onMapClick?: (lat: number, lng: number) => void;
}

function MapEvents({ onMapClick }: { onMapClick?: (lat: number, lng: number) => void }) {
  const map = useMap();
  useEffect(() => {
    if (!onMapClick) return;
    map.on("click", (e) => {
      onMapClick(e.latlng.lat, e.latlng.lng);
    });
    return () => {
      map.off("click");
    };
  }, [map, onMapClick]);
  return null;
}

export function MapView({ center, zoom = 13, markers = [], className, onMapClick }: MapViewProps) {
  return (
    <div className={`overflow-hidden rounded-2xl border border-border shadow-lg ${className}`}>
      <MapContainer center={center} zoom={zoom} style={{ height: "100%", width: "100%" }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" // Dark theme maps
        />
        <MapEvents onMapClick={onMapClick} />
        {markers.map((marker) => (
          <Marker 
            key={marker.id} 
            position={[marker.lat, marker.lng]}
            icon={marker.isDriver ? customDriverIcon : L.Icon.Default}
          >
            {(marker.title || marker.description) && (
              <Popup>
                <div className="font-sans">
                  {marker.title && <div className="font-bold text-lg mb-1 text-primary">{marker.title}</div>}
                  {marker.description && <div className="text-sm text-muted-foreground">{marker.description}</div>}
                </div>
              </Popup>
            )}
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
