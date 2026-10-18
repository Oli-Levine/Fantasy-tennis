import type { Metadata, Viewport } from "next";
import "@fontsource-variable/inter";
import "@fontsource/poppins/500.css";
import "@fontsource/poppins/600.css";
import "@fontsource/poppins/700.css";
import "./globals.css";
import { CourtBackground } from "@/components/app/court-background";
import { Toaster } from "@/components/ui/sonner";

export const metadata: Metadata = {
  title: {
    default: "Fantasy Tennis",
    template: "%s · Fantasy Tennis",
  },
  description: "Fantasy league for our BUCS tennis club.",
  appleWebApp: { capable: true, title: "Fantasy Tennis", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0f1d4a",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-GB" className="h-full">
      <body className="min-h-full">
        <CourtBackground />
        {children}
        <Toaster />
      </body>
    </html>
  );
}
