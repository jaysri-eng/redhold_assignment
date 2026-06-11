"use client";

import { formatQueueTimestamp } from "@/lib/format-date";
import { useMounted } from "@/hooks/use-mounted";

interface Props {
  iso: string;
  style?: React.CSSProperties;
}

/** Renders a timestamp only after mount to avoid SSR/client timezone mismatches. */
export default function ClientTimestamp({ iso, style }: Props) {
  const mounted = useMounted();

  return (
    <span style={style} suppressHydrationWarning>
      {mounted ? formatQueueTimestamp(iso) : "—"}
    </span>
  );
}
