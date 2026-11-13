import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
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
  title: "NeetCode Tracker",
  description: "Spaced-repetition review for the NeetCode 250",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <nav className="mx-auto flex w-full max-w-2xl gap-4 px-4 pt-4 text-sm">
          <Link href="/" className="font-medium underline-offset-2 hover:underline">
            Problems
          </Link>
          <Link href="/today" className="font-medium underline-offset-2 hover:underline">
            Today
          </Link>
        </nav>
        {children}
      </body>
    </html>
  );
}
