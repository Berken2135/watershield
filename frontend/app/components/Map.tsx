"use client";

import * as maptilersdk from "@maptiler/sdk";
import "@maptiler/sdk/dist/maptiler-sdk.css";
import { useEffect, useRef } from "react";

const maptilerApiKey = process.env.NEXT_PUBLIC_MAPTILER_API_KEY?.trim();

export default function Map() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maptilersdk.Map | null>(null);

  useEffect(() => {
    if (!mapContainer.current || map.current || !maptilerApiKey) return;

    maptilersdk.config.apiKey = maptilerApiKey;

    map.current = new maptilersdk.Map({
      container: mapContainer.current,
      style: maptilersdk.MapStyle.STREETS,
      center: [17.0385, 51.1079],
      zoom: 12,
    });

    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, []);

  if (!maptilerApiKey) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-muted/40 text-center text-sm text-muted-foreground">
        Map is unavailable until NEXT_PUBLIC_MAPTILER_API_KEY is configured.
      </div>
    );
  }

  return <div ref={mapContainer} style={{ width: "100%", height: "100%" }} />;
}
