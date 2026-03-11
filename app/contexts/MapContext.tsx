"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";

/** Viewport state for the map camera */
interface MapViewport {
  longitude: number;
  latitude: number;
  zoom: number;
  bearing: number;
  pitch: number;
}

/** Currently selected area information */
interface SelectedArea {
  id: string;
  areaCode: string;
  name: string;
}

/** Selected building ID (for building detail panel) */

/** Active filter state */
interface MapFilters {
  year: number;
  propertyType: "kerrostalo" | "rivitalo" | "omakotitalo";
  priceRange: [number, number];
}

/** Shape of the MapContext value */
interface MapContextValue {
  viewport: MapViewport;
  setViewport: (viewport: MapViewport) => void;
  selectedArea: SelectedArea | null;
  setSelectedArea: (area: SelectedArea | null) => void;
  comparedArea: SelectedArea | null;
  setComparedArea: (area: SelectedArea | null) => void;
  isCompareMode: boolean;
  setIsCompareMode: (mode: boolean) => void;
  filters: MapFilters;
  setFilters: (filters: MapFilters) => void;
  updateFilter: <K extends keyof MapFilters>(
    key: K,
    value: MapFilters[K]
  ) => void;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
  isSidebarOpen: boolean;
  setIsSidebarOpen: (open: boolean) => void;
  selectedBuilding: string | null;
  setSelectedBuilding: (id: string | null) => void;
}

const defaultViewport: MapViewport = {
  longitude: 24.9384,
  latitude: 60.1699,
  zoom: 10,
  bearing: 0,
  pitch: 0,
};

const defaultFilters: MapFilters = {
  year: 2024,
  propertyType: "kerrostalo",
  priceRange: [0, 10000],
};

const MapContext = createContext<MapContextValue | undefined>(undefined);

interface MapProviderProps {
  children: ReactNode;
}

export function MapProvider({ children }: MapProviderProps) {
  const [viewport, setViewport] = useState<MapViewport>(defaultViewport);
  const [selectedArea, setSelectedArea] = useState<SelectedArea | null>(null);
  const [comparedArea, setComparedArea] = useState<SelectedArea | null>(null);
  const [isCompareMode, setIsCompareMode] = useState(false);
  const [filters, setFilters] = useState<MapFilters>(defaultFilters);
  const [isLoading, setIsLoading] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [selectedBuilding, setSelectedBuilding] = useState<string | null>(null);

  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        // Skip if user has already panned/zoomed the map
        setViewport((prev) => {
          const isDefault =
            prev.longitude === defaultViewport.longitude &&
            prev.latitude === defaultViewport.latitude;
          if (!isDefault) return prev;
          return {
            ...prev,
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            zoom: 14,
          };
        });
      },
      () => {},
      { enableHighAccuracy: false, timeout: 5000 }
    );
  }, []);

  const updateFilter = useCallback(
    <K extends keyof MapFilters>(key: K, value: MapFilters[K]) => {
      setFilters((prev) => ({ ...prev, [key]: value }));
    },
    []
  );

  const value: MapContextValue = {
    viewport,
    setViewport,
    selectedArea,
    setSelectedArea,
    comparedArea,
    setComparedArea,
    isCompareMode,
    setIsCompareMode,
    filters,
    setFilters,
    updateFilter,
    isLoading,
    setIsLoading,
    isSidebarOpen,
    setIsSidebarOpen,
    selectedBuilding,
    setSelectedBuilding,
  };

  return <MapContext.Provider value={value}>{children}</MapContext.Provider>;
}

export function useMapContext(): MapContextValue {
  const context = useContext(MapContext);
  if (context === undefined) {
    throw new Error("useMapContext must be used within a MapProvider");
  }
  return context;
}
