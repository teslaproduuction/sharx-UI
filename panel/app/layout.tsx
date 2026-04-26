import type { Metadata } from "next";
import { Fira_Mono, Montserrat, Sacramento, Unbounded } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { themeInitScript } from "@/lib/theme-provider";

const montserrat = Montserrat({
  variable: "--font-mont",
  subsets: ["latin", "cyrillic"],
  display: "swap",
});

const unbounded = Unbounded({
  variable: "--font-unbounded",
  subsets: ["latin", "cyrillic"],
  display: "swap",
});

const firaMono = Fira_Mono({
  variable: "--font-fira",
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500", "700"],
  display: "swap",
});

const sacramento = Sacramento({
  variable: "--font-sacramento",
  subsets: ["latin", "latin-ext"],
  weight: "400",
  display: "swap",
});

export const metadata: Metadata = {
  title: "SharX",
  description: "SharX panel",
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      data-theme="dark"
      data-panel-theme="web"
      suppressHydrationWarning
    >
      <head>
        <meta name="theme-color" content="#05060a" />
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body
        className={`${montserrat.variable} ${unbounded.variable} ${firaMono.variable} ${sacramento.variable} antialiased`}
        style={{ fontFamily: "var(--font-sans)" }}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
