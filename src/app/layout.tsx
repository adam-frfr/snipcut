import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "OpusClip Clone — #1 AI Video Repurposing & Viral Shorts Platform",
  description: "Turn 1 long video into 10 viral clips with AI Curation, Virality Score™, Dynamic Captions, and Active Speaker Auto-Reframe.",
  icons: {
    icon: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} min-h-screen bg-[#08090E] text-[#F4F4F7] antialiased selection:bg-purple-600 selection:text-white`}
      >
        {children}
      </body>
    </html>
  );
}
