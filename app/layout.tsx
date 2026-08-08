import type { Metadata, Viewport } from "next";
import { DM_Mono, Manrope } from "next/font/google";
import { AppFooter } from "@/components/app-footer";
import { AppHeader } from "@/components/app-header";
import "./globals.css";

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
  display: "swap",
});

const dmMono = DM_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
  display: "swap",
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Galileo Journal — GalileoEngine",
    template: "%s — Galileo Journal",
  },
  description:
    "Engineering notes, measured progress, and product updates from the GalileoEngine team.",
  openGraph: {
    type: "website",
    siteName: "GalileoEngine",
  },
};

export const viewport: Viewport = {
  themeColor: "#f4f8f5",
};

const themeBootstrap = `
  try {
    var theme = localStorage.getItem("galileo-color-theme") === "dark" ? "dark" : "light";
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    var themeMeta = document.querySelector('meta[name="theme-color"]');
    if (themeMeta) themeMeta.setAttribute("content", theme === "light" ? "#f4f8f5" : "#0d2b25");
  } catch (_) {
    document.documentElement.dataset.theme = "light";
  }
`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-theme="light" data-scroll-behavior="smooth" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body className={`${manrope.variable} ${dmMono.variable}`}>
        <a className="app-skip-link" href="#main-content">
          Skip to content
        </a>
        <AppHeader />
        {children}
        <AppFooter />
      </body>
    </html>
  );
}
