import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");
const outputRoot = path.join(projectRoot, "dist");

const cleanPages = [
  { source: "platform.html", route: "platform", title: "Engine" },
  { source: "roadmap.html", route: "roadmap", title: "Roadmap" },
  { source: "galileo-browser.html", route: "galileo-browser", title: "Galileo Browser" },
  { source: "status.html", route: "status", title: "Project status" },
  { source: "team.html", route: "team", title: "Team" },
  { source: "support.html", route: "support", title: "About" },
  { source: "contact.html", route: "contact", title: "Contact" },
  { source: "newsletter.html", route: "newsletter", title: "Newsletter" },
];

const publicFiles = [
  ".nojekyll",
  "404.html",
  "About.dc.html",
  "Build.dc.html",
  "Contribute.dc.html",
  "CNAME",
  "evidence-chart.js",
  "galileo.css",
  "Goals.dc.html",
  "Home.dc.html",
  "index.html",
  "products.html",
  "robots.txt",
  "site.js",
  "sitemap.xml",
  "Status.dc.html",
  "team-loren.png",
  "team-manuel.png",
  "team-silviu.png",
  "Team.dc.html",
];

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function excerpt(value, maximum = 250) {
  const normalised = String(value ?? "").replace(/\s+/g, " ").trim();
  if (normalised.length <= maximum) return normalised;
  return `${normalised.slice(0, maximum).replace(/\s+\S*$/, "")}…`;
}

function formatDate(value) {
  return new Intl.DateTimeFormat("en", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

function renderLegacyPageRedirect({ route, title }) {
  const destination = `/${route}/`;
  const canonical = `https://galileobrowser.com${destination}`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex">
  <noscript><meta http-equiv="refresh" content="0; url=${destination}"></noscript>
  <link rel="canonical" href="${canonical}">
  <title>${escapeHtml(title)} moved — GalileoEngine</title>
  <script>const target = new URL(${JSON.stringify(destination)}, window.location.origin); target.search = window.location.search; target.hash = window.location.hash; window.location.replace(target);</script>
</head>
<body>
  <main>
    <h1>${escapeHtml(title)} has moved.</h1>
    <p>Continue to <a href="${destination}">${escapeHtml(canonical)}</a>.</p>
  </main>
</body>
</html>
`;
}

async function build() {
  await rm(outputRoot, { recursive: true, force: true });
  await mkdir(outputRoot, { recursive: true });

  for (const file of publicFiles) {
    await cp(path.join(projectRoot, file), path.join(outputRoot, file));
  }
  await cp(path.join(projectRoot, "assets"), path.join(outputRoot, "assets"), {
    recursive: true,
  });
  await cp(path.join(projectRoot, "journal"), path.join(outputRoot, "journal"), {
    recursive: true,
  });
  await cp(path.join(projectRoot, "newsletter"), path.join(outputRoot, "newsletter"), {
    recursive: true,
  });
  await cp(path.join(projectRoot, "data"), path.join(outputRoot, "data"), {
    recursive: true,
  });

  for (const page of cleanPages) {
    const routeDirectory = path.join(outputRoot, page.route);
    const source = await readFile(path.join(projectRoot, page.source), "utf8");
    await mkdir(routeDirectory, { recursive: true });
    await writeFile(path.join(routeDirectory, "index.html"), source, "utf8");
    await writeFile(path.join(outputRoot, page.source), renderLegacyPageRedirect(page), "utf8");
  }

  console.log(
    `Built GitHub Pages artifact with ${cleanPages.length} clean routes.`,
  );
}

await build();
