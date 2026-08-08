import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");
const targetRoot = path.join(projectRoot, "public", "legacy");
const currentProductionBase = "https://silviu3369.github.io/galileoengine-site";
const configuredSiteBase = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "");

const legacyFiles = [
  ".nojekyll",
  "404.html",
  "About.dc.html",
  "Build.dc.html",
  "Contribute.dc.html",
  "galileo-browser.html",
  "galileo.css",
  "Goals.dc.html",
  "Home.dc.html",
  "index.html",
  "platform.html",
  "products.html",
  "roadmap.html",
  "robots.txt",
  "site.js",
  "sitemap.xml",
  "Status.dc.html",
  "status.html",
  "support.html",
  "team-loren.png",
  "team-manuel.png",
  "team-silviu.png",
  "Team.dc.html",
  "team.html",
];

await rm(targetRoot, { recursive: true, force: true });
await mkdir(targetRoot, { recursive: true });

for (const file of legacyFiles) {
  const destination = path.join(targetRoot, file);
  await cp(path.join(projectRoot, file), destination);

  if (configuredSiteBase && file.endsWith(".html")) {
    const html = await readFile(destination, "utf8");
    await writeFile(
      destination,
      html.replaceAll(currentProductionBase, configuredSiteBase),
      "utf8",
    );
  }
}

await cp(path.join(projectRoot, "assets"), path.join(targetRoot, "assets"), {
  recursive: true,
});

const canonicalMessage = configuredSiteBase
  ? ` Canonical URLs target ${configuredSiteBase}.`
  : "";
console.log(`Synced ${legacyFiles.length} legacy files and assets.${canonicalMessage}`);
