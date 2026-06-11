"use client";

import { useEffect } from "react";
import posthog from "posthog-js";

/**
 * Initialises PostHog once on the client.
 * Renders nothing — mount this in the root layout.
 * Silently no-ops if NEXT_PUBLIC_POSTHOG_KEY is not set.
 */
export function PostHogInit() {
  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    if (!key) return;
    try {
      posthog.init(key, {
        api_host:         process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com",
        capture_pageview: true,
        capture_pageleave: true,
      });
    } catch {
      // Silent fallback — analytics must never break the UI
    }
  }, []);

  return null;
}
