"use client";

import { useEffect, useState } from "react";

/** True after the component has mounted on the client (safe for localStorage, dates, etc.). */
export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}
