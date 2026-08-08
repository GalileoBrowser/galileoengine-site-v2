import type { MetadataRoute } from "next";
import { getPublishedPosts } from "@/lib/journal/queries";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const result = await getPublishedPosts();

  const staticRoutes = ["", "/platform.html", "/roadmap.html", "/galileo-browser.html", "/status.html", "/team.html", "/journal"];

  return [
    ...staticRoutes.map((route) => ({
      url: `${baseUrl}${route}`,
      lastModified: new Date(),
      changeFrequency: route === "/journal" ? ("weekly" as const) : ("monthly" as const),
      priority: route === "" ? 1 : 0.7,
    })),
    ...result.data.map((post) => ({
      url: `${baseUrl}/journal/${post.slug}`,
      lastModified: new Date(post.updatedAt),
      changeFrequency: "monthly" as const,
      priority: 0.65,
    })),
  ];
}
