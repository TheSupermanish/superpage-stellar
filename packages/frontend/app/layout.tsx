import type { Metadata } from "next";
import { Space_Grotesk, JetBrains_Mono, Sora } from "next/font/google";
import { Providers } from "@/components/providers";
import { ErrorBoundary } from "@/components/error-boundary";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-sans",
  subsets: ["latin"],
});

const sora = Sora({
  variable: "--font-display",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SuperPage - Monetize Anything with Crypto on Base",
  description:
    "Paywall your APIs, files, articles, and stores with USDC on Base. AI-agent ready payments powered by HTTP 402.",
  metadataBase: new URL("https://superpa.ge"),
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    url: "https://superpa.ge",
    title: "SuperPage - Monetize Anything with Crypto on Base",
    description:
      "Paywall your APIs, files, articles, and stores with USDC on Base. AI-agent ready payments powered by HTTP 402.",
    siteName: "SuperPage",
  },
  twitter: {
    card: "summary_large_image",
    title: "SuperPage - Monetize Anything with Crypto on Base",
    description:
      "Paywall your APIs, files, articles, and stores with USDC on Base. AI-agent ready payments powered by HTTP 402.",
  },
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
  manifest: "/manifest.json",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200"
          rel="stylesheet"
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "Organization",
              name: "SuperPage",
              url: "https://superpa.ge",
              logo: "https://superpa.ge/logo.png",
              description:
                "Paywall your APIs, files, articles, and stores with USDC on Base. AI-agent ready payments powered by HTTP 402.",
              sameAs: [],
            }),
          }}
        />
      </head>
      <body
        className={`${spaceGrotesk.variable} ${sora.variable} ${jetbrainsMono.variable} font-sans antialiased bg-background text-foreground`}
      >
        <ErrorBoundary>
          <Providers>{children}</Providers>
        </ErrorBoundary>
      </body>
    </html>
  );
}
