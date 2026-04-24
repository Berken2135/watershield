"use client";

import dynamic from "next/dynamic";

const Map = dynamic(() => import("./components/Map"), { ssr: false });

export default function Home() {
  return (
    <div style={{ width: "50vw", height: "60vh" }}>
      <Map />
    </div>
  );
}
