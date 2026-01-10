import type { Metadata, Viewport } from "next";
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
  metadataBase: new URL("https://prnth.com/react-three-game"),
  title: {
    default: "React Three Game - AI-Native 3D Engine",
    template: "%s | React Three Game"
  },
  description: "The first 3D game engine designed for AI-native development. Everything is JSON-serializable prefabs that AI agents can generate, modify, and compose without writing imperative code.",
  keywords: ["react", "three.js", "3d", "game engine", "webgpu", "ai", "prefab", "game development"],
  authors: [{ name: "prnthh" }],
  openGraph: {
    title: "React Three Game - AI-Native 3D Engine",
    description: "WebGPU based 3D game engine designed for AI-native development",
    siteName: "React Three Game",
    type: "website",
    locale: "en_US",
    url: "https://prnth.com/react-three-game"
  },
  twitter: {
    card: "summary_large_image",
    title: "React Three Game - AI-Native 3D Engine",
    description: "WebGPU based 3D game engine designed for AI-native development"
  },
  robots: {
    index: true,
    follow: true,
    "max-image-preview": "large",
    "max-snippet": -1,
    "max-video-preview": -1,
    googleBot: "index, follow"
  },
  applicationName: "React Three Game",
  appleWebApp: {
    title: "React Three Game",
    statusBarStyle: "default",
    capable: true
  },
  icons: {
    icon: [
      {
        url: "/favicon.ico",
        type: "image/x-icon"
      }
    ],
    shortcut: [
      {
        url: "/favicon.ico",
        type: "image/x-icon"
      }
    ]
  }
};

export const viewport: Viewport = {
  width: "device-width",
  viewportFit: "cover",
  initialScale: 1.0,
  maximumScale: 1.0,
  userScalable: false,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
