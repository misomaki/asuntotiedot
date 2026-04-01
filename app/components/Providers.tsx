"use client";

import { useEffect } from "react";
import posthog from "posthog-js";
import { PostHogProvider } from "posthog-js/react";
import { ThemeProvider } from "next-themes";
import { MapProvider } from "../contexts/MapContext";
import { AuthProvider } from "../contexts/AuthContext";
import PostHogPageView from "./PostHogPageView";
import type { ReactNode } from "react";

interface ProvidersProps {
  children: ReactNode;
}

export function Providers({ children }: ProvidersProps) {
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_POSTHOG_KEY) {
      posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
        api_host: "/ingest",
        ui_host: "https://eu.posthog.com",
        person_profiles: "identified_only",
        capture_pageview: false, // handled by PostHogPageView
        capture_pageleave: true,
      });
    }
  }, []);

  return (
    <PostHogProvider client={posthog}>
      <PostHogPageView />
      <ThemeProvider defaultTheme="dark" forcedTheme="dark" attribute="class">
        <AuthProvider>
          <MapProvider>{children}</MapProvider>
        </AuthProvider>
      </ThemeProvider>
    </PostHogProvider>
  );
}
