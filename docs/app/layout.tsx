import type { Metadata, Viewport } from "next";
import "./globals.css";

const title = "React Three Game - A game creation toolbox for the web";
const description = "A game creation toolbox for the web. Build with JavaScript, Three.js, WebGPU, and a visual scene editor, with React components that grow with your game.";

export const metadata: Metadata = {
  metadataBase: new URL("https://prnth.com/react-three-game"),
  title: {
    default: title,
    template: "%s | React Three Game"
  },
  description,
  keywords: ["game creation", "web games", "JavaScript", "Three.js", "React", "React Three Fiber", "WebGPU", "visual scene editor", "prefabs", "game development"],
  authors: [{ name: "prnthh" }],
  openGraph: {
    title,
    description,
    siteName: "React Three Game",
    type: "website",
    locale: "en_US",
    url: "https://prnth.com/react-three-game"
  },
  twitter: {
    card: "summary_large_image",
    title,
    description
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
