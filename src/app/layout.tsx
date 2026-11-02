import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-jakarta",
});

export const metadata: Metadata = {
  title: "OpusClip — AI Video Repurposing & Viral Shorts",
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
    <html lang="en">
      <body
        className={`${jakarta.className} min-h-screen bg-[#F8F7F4] text-black antialiased selection:bg-[#FFC700] selection:text-black`}
      >
        {children}
      </body>
    </html>
  );
}
