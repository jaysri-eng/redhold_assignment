import type { Metadata } from "next";
import "./globals.css";
import { PostHogInit } from "@/components/PostHogInit";

export const metadata: Metadata = {
  title: "Diagrams.so · SEO Review Dashboard",
  description:
    "Human review queue for the Diagrams.so Gallery SEO Growth Loop. Approve or reject AI-generated architecture diagrams before anything goes live.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <PostHogInit />
        {children}
      </body>
    </html>
  );
}
