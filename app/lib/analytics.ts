import posthog from "posthog-js";

// --- Map interaction events ---

export function trackBuildingClick(props: {
  buildingId: string;
  price: number | null;
  constructionYear: number | null;
  address: string | null;
}) {
  posthog.capture("building_clicked", props);
}

export function trackAreaClick(props: {
  areaCode: string;
  areaName: string;
  municipality: string | null;
}) {
  posthog.capture("area_clicked", props);
}

export function trackCityClick(props: {
  cityName: string;
}) {
  posthog.capture("city_clicked", props);
}

export function trackAddressClick(props: {
  label: string;
}) {
  posthog.capture("address_clicked", props);
}

export function trackSearch(props: {
  query: string;
  areaResults: number;
  addressResults: number;
  cityResults: number;
}) {
  posthog.capture("search_performed", props);
}

export function trackFilterChange(props: {
  filterType: "year" | "propertyType";
  value: string | number;
}) {
  posthog.capture("filter_changed", props);
}

// Debounced zoom tracking — call freely, fires at most once per 2s
let _zoomTimer: ReturnType<typeof setTimeout> | null = null;
export function trackZoomLevel(zoom: number, lat: number, lng: number) {
  if (_zoomTimer) clearTimeout(_zoomTimer);
  _zoomTimer = setTimeout(() => {
    posthog.capture("zoom_changed", {
      zoomLevel: Math.round(zoom * 10) / 10,
      centerLat: Math.round(lat * 1000) / 1000,
      centerLng: Math.round(lng * 1000) / 1000,
    });
  }, 2000);
}

// --- Engagement events ---

export function trackSidebarOpen(panelType: "stats" | "building" | "comparison") {
  posthog.capture("sidebar_opened", { panelType });
}

export function trackAreaComparison(props: {
  area1: string;
  area2: string;
}) {
  posthog.capture("area_compared", props);
}

export function trackFaqAccordion(props: {
  question: string;
  opened: boolean;
}) {
  posthog.capture("faq_accordion_toggled", props);
}

// --- Future: conversion events ---

export function trackSignup(props: {
  method: string;
}) {
  posthog.capture("user_signed_up", props);
}

export function trackPaywallHit(props: {
  feature: string;
  currentPlan: string | null;
}) {
  posthog.capture("paywall_hit", props);
}
