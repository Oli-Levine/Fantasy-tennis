import type { MetadataRoute } from "next";

/** Web app manifest: lets phones install the app ("Add to Home Screen"). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Fantasy Tennis",
    short_name: "Fantasy Tennis",
    description: "Fantasy league for our BUCS tennis club.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f3f4f6",
    theme_color: "#d7192d",
    categories: ["sports", "games"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
