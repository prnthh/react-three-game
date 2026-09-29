import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://prnth.com/react-three-game"),
  title: {
    default: "React Three Game - Rendering and Scene Authoring",
    template: "%s | React Three Game"
  },
  description: "WebGPU rendering and scene authoring with React Three Fiber, reusable GameObject components, a visual editor and an API for agents.",
  keywords: ["react", "three.js", "3d", "rendering", "webgpu", "scene editor", "prefab", "game development"],
  authors: [{ name: "prnthh" }],
  openGraph: {
    title: "React Three Game - Rendering and Scene Authoring",
    description: "WebGPU rendering, React Three Fiber composition, and visual and agent scene authoring.",
    siteName: "React Three Game",
    type: "website",
    locale: "en_US",
    url: "https://prnth.com/react-three-game"
  },
  twitter: {
    card: "summary_large_image",
    title: "React Three Game - Rendering and Scene Authoring",
    description: "WebGPU rendering, React Three Fiber composition, and visual and agent scene authoring."
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
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
