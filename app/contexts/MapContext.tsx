"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
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

/** Fly-to function for smooth animated camera transitions */
type FlyToFn = (opts: { longitude: number; latitude: number; zoom: number }) => void;

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
  flyTo: FlyToFn;
  setFlyTo: (fn: FlyToFn) => void;
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

const STORAGE_KEY = "neliot-viewport";

/** Parse viewport + filters from URL hash, e.g. #lat=60.17&lng=24.94&z=12&y=2024&t=kerrostalo */
function parseHash(): { viewport?: Partial<MapViewport>; filters?: Partial<MapFilters> } {
  if (typeof window === "undefined") return {};
  const hash = window.location.hash.slice(1);
  if (!hash) return {};
  const params = new URLSearchParams(hash);
  const result: { viewport?: Partial<MapViewport>; filters?: Partial<MapFilters> } = {};

  const lat = parseFloat(params.get("lat") ?? "");
  const lng = parseFloat(params.get("lng") ?? "");
  const z = parseFloat(params.get("z") ?? "");
  if (!isNaN(lat) && !isNaN(lng) && !isNaN(z)) {
    result.viewport = { latitude: lat, longitude: lng, zoom: z };
  }

  const y = parseInt(params.get("y") ?? "");
  if (!isNaN(y) && y >= 2009 && y <= 2030) {
    result.filters = { year: y };
  }

  const t = params.get("t");
  if (t === "kerrostalo" || t === "rivitalo" || t === "omakotitalo") {
    result.filters = { ...result.filters, propertyType: t };
  }

  return result;
}

/** Read saved viewport from localStorage */
function loadSavedViewport(): MapViewport | null {
  if (typeof window === "undefined") return null;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return null;
    const parsed = JSON.parse(saved);
    if (typeof parsed.latitude === "number" && typeof parsed.longitude === "number" && typeof parsed.zoom === "number") {
      return { ...defaultViewport, ...parsed };
    }
  } catch { /* ignore */ }
  return null;
}

/** Save viewport to localStorage (debounced externally) */
function saveViewport(vp: MapViewport) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      latitude: vp.latitude,
      longitude: vp.longitude,
      zoom: vp.zoom,
    }));
  } catch { /* ignore */ }
}

const MapContext = createContext<MapContextValue | undefined>(undefined);

interface MapProviderProps {
  children: ReactNode;
}

export function MapProvider({ children }: MapProviderProps) {
  // Parse hash once, share across both initialisers
  const initHash = useRef(parseHash());
  const initSaved = useRef(loadSavedViewport());

  const hadInitialPosition = useRef(false);

  const [viewport, setViewportRaw] = useState<MapViewport>(() => {
    const hash = initHash.current;
    if (hash.viewport) { hadInitialPosition.current = true; return { ...defaultViewport, ...hash.viewport }; }
    const saved = initSaved.current;
    if (saved) { hadInitialPosition.current = true; return saved; }
    return defaultViewport;
  });
  const [selectedArea, setSelectedArea] = useState<SelectedArea | null>(null);
  const [comparedArea, setComparedArea] = useState<SelectedArea | null>(null);
  const [isCompareMode, setIsCompareMode] = useState(false);
  const [filters, setFilters] = useState<MapFilters>(() => {
    return { ...defaultFilters, ...initHash.current.filters };
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [selectedBuilding, setSelectedBuilding] = useState<string | null>(null);
  const flyToRef = useRef<FlyToFn>(() => {});
  const flyToRegistered = useRef(false);
  const flyTo: FlyToFn = useCallback((opts) => {
    if (flyToRegistered.current) {
      flyToRef.current(opts);
    } else {
      // Fallback: directly set viewport when map flyTo isn't registered yet
      setViewportRaw((vp) => ({ ...vp, latitude: opts.latitude, longitude: opts.longitude, zoom: opts.zoom }));
    }
  }, []);
  const setFlyTo = useCallback((fn: FlyToFn) => { flyToRef.current = fn; flyToRegistered.current = true; }, []);

  // Wrap setViewport to also persist to localStorage + URL hash (both debounced)
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const setViewport = useCallback((vp: MapViewport) => {
    setViewportRaw(vp);

    // Debounce both localStorage + URL hash writes to avoid blocking during pan/zoom
    if (persistTimer.current) clearTimeout(persistTimer.current);
    persistTimer.current = setTimeout(() => {
      saveViewport(vp);
      const params = new URLSearchParams();
      params.set("lat", vp.latitude.toFixed(4));
      params.set("lng", vp.longitude.toFixed(4));
      params.set("z", vp.zoom.toFixed(1));
      const f = filtersRef.current;
      params.set("y", f.year.toString());
      params.set("t", f.propertyType);
      window.history.replaceState(null, "", `#${params.toString()}`);
    }, 500);
  }, []);

  // Keep a ref to filters for hash updates
  const filtersRef = useRef(filters);
  useEffect(() => { filtersRef.current = filters; }, [filters]);

  // Geolocation fallback — only if no hash/localStorage provided initial position
  useEffect(() => {
    if (hadInitialPosition.current) return;
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setViewport({
          ...defaultViewport,
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          zoom: 14,
        });
      },
      () => {},
      { enableHighAccuracy: false, timeout: 5000 }
    );
  }, [setViewport]);

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
    flyTo,
    setFlyTo,
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
