import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: "https://animatch-two.vercel.app", lastModified: new Date() }];
}
