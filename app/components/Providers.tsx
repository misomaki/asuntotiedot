"use client";

import { ThemeProvider } from "next-themes";
import { MapProvider } from "../contexts/MapContext";
import { AuthProvider } from "../contexts/AuthContext";
import type { ReactNode } from "react";

interface ProvidersProps {
  children: ReactNode;
}

export function Providers({ children }: ProvidersProps) {
  return (
    <ThemeProvider defaultTheme="dark" forcedTheme="dark" attribute="class">
      <AuthProvider>
        <MapProvider>{children}</MapProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
