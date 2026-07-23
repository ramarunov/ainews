import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Providers } from "../providers";
import "../globals.css";

// Own root layout (see app/(public)/layout.tsx's matching comment) - the
// admin dashboard's UI is English regardless of the reader-facing site's
// language, so it needs its own <html lang> rather than inheriting
// whatever the public site declares.
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "BeritaBot CMS",
  description: "AI Native News CMS — Editorial Dashboard for BeritaBot.com",
  robots: { index: false, follow: false },
};

export default function DashboardRootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
