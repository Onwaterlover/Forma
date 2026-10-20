import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  const name = process.env.NEXT_PUBLIC_APP_NAME || "Forma";
  return {
    name,
    short_name: name,
    description: "Training and nutrition, without the busywork.",
    start_url: "/",
    display: "standalone",
    background_color: "#f4f2ed",
    theme_color: "#3b6a58",
    lang: "pl",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
