import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    background_color: "#f4d000",
    description:
      "Criticable is a perception experiment where users submit their own photos and receive structured judgments about what those images project.",
    display: "standalone",
    icons: [
      {
        sizes: "any",
        src: "/icon.svg",
        type: "image/svg+xml",
      },
      {
        sizes: "180x180",
        src: "/apple-icon",
        type: "image/png",
      },
    ],
    lang: "es",
    name: "Criticable",
    short_name: "Criticable",
    start_url: "/",
    theme_color: "#f4d000",
  };
}
