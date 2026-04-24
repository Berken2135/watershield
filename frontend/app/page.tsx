"use client";

import dynamic from "next/dynamic";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Droplets } from "lucide-react";

const Map = dynamic(() => import("./components/Map"), { ssr: false });

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Droplets className="h-6 w-6 text-blue-500" />
            <span className="text-xl font-semibold tracking-tight">WaterShield</span>
          </div>
          <nav className="hidden md:flex items-center gap-6 text-sm text-muted-foreground">
            <a href="#" className="hover:text-foreground transition-colors">Dashboard</a>
            <a href="#" className="hover:text-foreground transition-colors">Reports</a>
            <a href="#" className="hover:text-foreground transition-colors">Alerts</a>
          </nav>
          <Button variant="outline" size="sm">Sign In</Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex flex-col flex-1">
        {/* Search Section */}
        <section className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-10">
          <div className="mb-6">
            <h1 className="text-3xl font-bold tracking-tight mb-1">Water Quality Monitor</h1>
            <p className="text-muted-foreground">Search for a location to view water quality data.</p>
          </div>
          <div className="flex gap-2 max-w-xl">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Search by city, region, or coordinates..."
                type="search"
              />
            </div>
            <Button>Search</Button>
          </div>
        </section>

        {/* Map Section */}
        <section className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 pb-10">
          <div className="rounded-xl border overflow-hidden h-[500px] w-full">
            <Map />
          </div>
        </section>
      </main>
    </div>
  );
}
