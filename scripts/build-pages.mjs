import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");
const outputRoot = path.join(projectRoot, "dist");
const siteOrigin = "https://galileobrowser.com";
const discussionRepository = "GalileoBrowser/galileoengine-site-v2";
const discussionCategory = "Announcements";
const discussionCategorySlug = "announcements";
const discussionCache = path.join(projectRoot, "data", "newsletter-discussions.json");
const newsletterPermalinks = new Map([
  [1, "what-we-are-building"],
]);

const cleanPages = [
  { source: "platform.html", route: "platform", title: "Engine" },
  { source: "roadmap.html", route: "roadmap", title: "Roadmap" },
  { source: "galileo-browser.html", route: "galileo-browser", title: "Galileo Browser" },
  { source: "about.html", route: "about", title: "About" },
  { source: "contact.html", route: "contact", title: "Contact" },
  { source: "team.html", route: "team", title: "Team" },
  { source: "github.html", route: "github", title: "GitHub" },
  { source: "get-involved.html", route: "get-involved", title: "Get involved" },
  { source: "contributing.html", route: "contributing", title: "Contributing" },
  { source: "newsletter.html", route: "newsletter", title: "Newsletter" },
];

const routeRedirects = [
  { route: "status", destination: "/roadmap/#current-status", title: "Status", legacySource: "status.html" },
  { route: "support", destination: "/get-involved/", title: "Get involved", legacySource: "support.html" },
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

const authorProfiles = {
  Silviu3369: { name: "Ionel Silviu Ghimpau", avatar: "/team-silviu.png" },
  lolren: { name: "Loren Bufanu", avatar: "/team-loren.png" },
  ionaselmd: { name: "Manuel Ionasel", avatar: "/team-manuel.png" },
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDate(value) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

function readingTime(value) {
  const words = String(value ?? "").trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 220));
}

function excerptFrom(value) {
  const lines = String(value ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const candidate = lines.find((line) => line.length >= 90) ?? lines[0] ?? "Project update from the Galileo team.";
  if (candidate.length <= 220) return candidate;
  const shortened = candidate.slice(0, 217).replace(/\s+\S*$/, "");
  return `${shortened}…`;
}

function publicDiscussionRoute(discussion) {
  const slug = newsletterPermalinks.get(discussion.number) ?? `update-${discussion.number}`;
  return `/newsletter/${slug}/`;
}

function authorFor(discussion) {
  const login = discussion.author?.login || "GalileoBrowser";
  const known = authorProfiles[login];
  return {
    login,
    name: known?.name ?? login,
    avatar: known?.avatar ?? discussion.author?.avatarUrl ?? "/assets/galileo-symbol.png",
    url: discussion.author?.url ?? `https://github.com/${encodeURIComponent(login)}`,
  };
}

function normalizeDiscussion(raw) {
  const number = Number(raw.number);
  const bodyHtml = String(raw.bodyHTML ?? raw.bodyHtml ?? "").trim().replaceAll("Galileo Journal", "Galileo Newsletter").replaceAll("this Journal", "this Newsletter").replaceAll("This Journal", "This Newsletter");
  const bodyText = String(raw.bodyText ?? "").trim().replaceAll("Galileo Journal", "Galileo Newsletter").replaceAll("this Journal", "this Newsletter").replaceAll("This Journal", "This Newsletter");
  const createdAt = String(raw.createdAt ?? "");
  if (!Number.isInteger(number) || number < 1) throw new Error("Newsletter discussion has an invalid number.");
  if (!String(raw.title ?? "").trim()) throw new Error(`Discussion #${number} has no title.`);
  if (!bodyHtml || !bodyText) throw new Error(`Discussion #${number} has no publishable body.`);
  if (!Number.isFinite(Date.parse(createdAt))) throw new Error(`Discussion #${number} has an invalid creation date.`);
  return {
    number,
    title: number === 1
      ? "What we are building — and how we will report progress"
      : String(raw.title).trim().replace(/^Galileo Journal:/, "Galileo Newsletter:"),
    url: String(raw.url),
    createdAt,
    updatedAt: String(raw.updatedAt || createdAt),
    bodyHtml,
    bodyText,
    author: raw.author || null,
  };
}

async function fetchDiscussions(token) {
  const [owner, name] = discussionRepository.split("/");
  const query = `query NewsletterDiscussions($owner: String!, $name: String!) {
    repository(owner: $owner, name: $name) {
      discussions(first: 100, orderBy: { field: CREATED_AT, direction: DESC }) {
        nodes {
          number
          title
          url
          createdAt
          updatedAt
          bodyHTML
          bodyText
          category { slug }
          author { login avatarUrl url }
        }
      }
    }
  }`;
  const response = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "galileoengine-site-v2",
    },
    body: JSON.stringify({ query, variables: { owner, name } }),
  });
  if (!response.ok) throw new Error(`GitHub Discussions request failed with HTTP ${response.status}.`);
  const payload = await response.json();
  if (payload.errors?.length) throw new Error(`GitHub Discussions query failed: ${payload.errors[0].message}`);
  const nodes = payload.data?.repository?.discussions?.nodes;
  if (!Array.isArray(nodes)) throw new Error("GitHub Discussions returned an unexpected response.");
  return nodes
    .filter((item) => item.category?.slug === discussionCategorySlug)
    .map(normalizeDiscussion);
}

async function loadDiscussions() {
  const token = process.env.GITHUB_TOKEN?.trim();
  if (token) {
    return { source: "GitHub Discussions", discussions: await fetchDiscussions(token) };
  }
  const cached = JSON.parse(await readFile(discussionCache, "utf8"));
  return {
    source: "checked-in discussion snapshot",
    discussions: (cached.discussions ?? []).map(normalizeDiscussion),
  };
}

function renderRedirectPage({ destination, title }) {
  const canonical = new URL(destination, siteOrigin).href;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex">
  <noscript><meta http-equiv="refresh" content="0; url=${destination}"></noscript>
  <link rel="canonical" href="${canonical}">
  <title>${escapeHtml(title)} moved — Galileo Browser</title>
  <script>const target = new URL(${JSON.stringify(destination)}, window.location.origin); target.search = window.location.search; if (window.location.hash) target.hash = window.location.hash; window.location.replace(target);</script>
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

function renderDiscussionCard(discussion) {
  const author = authorFor(discussion);
  const route = publicDiscussionRoute(discussion);
  return `<article class="journal-entry journal-entry--discussion"><p class="journal-entry__meta"><span>${escapeHtml(formatDate(discussion.createdAt))}</span><span>Update ${discussion.number.toString().padStart(3, "0")}</span></p><div class="journal-entry__content"><span>Project update</span><h3><a href="${route}">${escapeHtml(discussion.title)}</a></h3><p class="journal-entry__excerpt">${escapeHtml(excerptFrom(discussion.bodyText))}</p><a class="journal-entry__author" href="${escapeHtml(author.url)}" target="_blank" rel="noopener"><img src="${escapeHtml(author.avatar)}" alt="" width="25" height="25"><span>${escapeHtml(author.name)}</span></a></div><div class="journal-entry__signals"><span>${readingTime(discussion.bodyText)} min read</span><a href="${route}">Read the update <span aria-hidden="true">→</span></a></div></article>`;
}

function renderNewsletterIndex(source, discussions) {
  const entries = discussions.length
    ? discussions.map(renderDiscussionCard).join("\n")
    : '<article class="journal-entry journal-entry--empty"><p class="eyebrow">Project updates</p><h3>No public updates yet.</h3><p class="journal-entry__excerpt">The team will publish here when there is something concrete to report.</p></article>';
  return source.replace("<!-- newsletter-discussion-posts -->", entries);
}

function renderSitemap(source, discussions) {
  const entries = discussions.map((discussion) => {
    const route = `${siteOrigin}${publicDiscussionRoute(discussion)}`;
    const lastModified = new Date(discussion.updatedAt).toISOString().slice(0, 10);
    return `  <url><loc>${route}</loc><lastmod>${lastModified}</lastmod></url>`;
  });
  return source.replace("</urlset>", `${entries.length ? `${entries.join("\n")}\n` : ""}</urlset>`);
}

function renderDiscussionPage(discussion, giscusEnabled) {
  const author = authorFor(discussion);
  const date = formatDate(discussion.createdAt);
  const excerpt = excerptFrom(discussion.bodyText);
  const canonicalPath = publicDiscussionRoute(discussion);
  const canonical = `${siteOrigin}${canonicalPath}`;
  const title = escapeHtml(discussion.title);
  const discussionUrl = escapeHtml(discussion.url);
  const minutes = readingTime(discussion.bodyText);
  const commentsProvider = giscusEnabled ? "giscus" : "github-link";
  const embeddedComments = giscusEnabled
    ? `<div class="giscus" data-giscus-comments></div>
          <script src="https://giscus.app/client.js" data-repo="${discussionRepository}" data-repo-id="R_kgDOTyjo4g" data-category="${discussionCategory}" data-category-id="DIC_kwDOTyjo4s4DC9Tu" data-mapping="number" data-term="${discussion.number}" data-strict="1" data-reactions-enabled="1" data-emit-metadata="0" data-input-position="top" data-theme="light" data-lang="en" data-loading="lazy" crossorigin="anonymous" async></script>
    <noscript><p>JavaScript is required for embedded comments. <a href="${discussionUrl}">Open the post on GitHub</a>.</p></noscript>`
    : '<p class="comments-notice">Read the replies or add your own in the public GitHub thread.</p>';

  return `<!doctype html>
<html lang="en" data-theme="light">
<head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title} — Galileo Newsletter</title>
  <meta name="description" content="${escapeHtml(excerpt)}">
  <meta name="theme-color" content="#f4f8f5">
  <link rel="icon" type="image/png" href="/assets/galileo-symbol.png">
  <link rel="apple-touch-icon" href="/assets/galileo-symbol.png">
  <link rel="canonical" href="${canonical}"><meta property="og:title" content="${title}"><meta property="og:description" content="${escapeHtml(excerpt)}"><meta property="og:url" content="${canonical}"><meta property="og:type" content="article"><meta property="article:published_time" content="${escapeHtml(discussion.createdAt)}"><meta property="article:author" content="${escapeHtml(author.name)}"><meta property="og:image" content="${siteOrigin}/assets/galileo-symbol.png"><meta name="twitter:card" content="summary_large_image">
  <link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Manrope:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/galileo.css?v=20260823d"><script src="/site.js?v=20260823d" defer></script>
</head>
<body data-page="post">
  <a class="skip-link" href="#main-content">Skip to content</a>
  <header class="site-header"><div class="site-header__inner"><a class="site-brand" href="/" aria-label="Galileo home"><img src="/assets/galileo-symbol.png" alt="" width="52" height="52"><span class="site-brand__name">Galileo<span>Browser</span></span></a><nav class="site-nav" id="primary-navigation" aria-label="Primary navigation"><div class="site-nav__group" data-nav-group><button class="site-nav__trigger" id="nav-get-involved-trigger" type="button" aria-expanded="false" aria-controls="nav-get-involved-menu">Get involved <span class="site-nav__chevron" aria-hidden="true"></span></button><div class="site-nav__menu" id="nav-get-involved-menu" aria-labelledby="nav-get-involved-trigger"><a href="/get-involved/">Overview <small>Ways to help</small></a><a href="/contributing/">Contributing <small>Code + tests</small></a></div></div><div class="site-nav__group" data-nav-group><button class="site-nav__trigger" id="nav-engine-trigger" type="button" aria-expanded="false" aria-controls="nav-engine-menu">Engine <span class="site-nav__chevron" aria-hidden="true"></span></button><div class="site-nav__menu" id="nav-engine-menu" aria-labelledby="nav-engine-trigger"><a href="/platform/">Galileo Engine <small>Foundation</small></a><a href="/galileo-browser/">Galileo Browser <small>Product</small></a><a href="/roadmap/">Roadmap <small>Progress</small></a></div></div><a class="site-nav__link" href="/newsletter/" aria-current="page">Newsletter</a><div class="site-nav__group" data-nav-group><button class="site-nav__trigger" id="nav-about-trigger" type="button" aria-expanded="false" aria-controls="nav-about-menu">About <span class="site-nav__chevron" aria-hidden="true"></span></button><div class="site-nav__menu" id="nav-about-menu" aria-labelledby="nav-about-trigger"><a href="/about/">About Galileo <small>Project</small></a><a href="/contact/">Contact <small>Reach us</small></a><a href="/team/">Team <small>People</small></a><a href="/github/">GitHub <small>Public work</small></a></div></div></nav><div class="theme-switch" role="group" aria-label="Color theme"><button type="button" data-theme-choice="light" aria-pressed="true">Light</button><button type="button" data-theme-choice="dark" aria-pressed="false">Dark</button></div><button class="menu-toggle" type="button" aria-label="Open navigation" aria-controls="primary-navigation" aria-expanded="false"><span class="menu-toggle__icon"></span></button></div></header>
  <main id="main-content">
    <section class="page-hero"><div class="page-hero__inner"><p class="eyebrow">Galileo Newsletter / Update ${discussion.number}</p><h1>${title}</h1><p class="page-hero__lead">${escapeHtml(excerpt)}</p></div><img class="page-hero__mark" src="/assets/galileo-symbol.png" alt="GalileoEngine symbol" width="1254" height="1254"></section>
    <section class="page-section">
      <article class="post post--discussion">
      <p class="post__byline"><strong><a href="${escapeHtml(author.url)}" target="_blank" rel="noopener">${escapeHtml(author.name)}</a></strong><span>${escapeHtml(date)}</span><span>${minutes} min read</span><a href="${discussionUrl}" target="_blank" rel="noopener">Source on GitHub ↗</a></p>
        <div class="post__body">${discussion.bodyHtml}</div>
        <section class="post-comments" data-comments-provider="${commentsProvider}" aria-labelledby="comments-title">
        <div class="post-comments__heading"><div><p class="eyebrow">Comments</p><h2 id="comments-title">Questions, context, and replies.</h2></div><p>Comments are stored with the public GitHub post. Sign in with GitHub to reply, or open the source directly.</p></div>
          ${embeddedComments}
        <p class="comments-fallback"><a class="button button--ghost" href="${discussionUrl}" target="_blank" rel="noopener">Open comments on GitHub <span aria-hidden="true">↗</span></a></p>
        </section>
        <p class="post__back"><a class="text-link" href="/newsletter/">← Back to the newsletter</a></p>
      </article>
    </section>
  </main>
  <footer class="site-footer"><div class="site-footer__inner"><a class="site-footer__brand" href="/"><img src="/assets/galileo-symbol.png" alt="" width="42" height="42"><span>Galileo<span>Browser</span></span></a><p class="site-footer__note">The newsletter keeps the project’s reasoning close to the source.</p><div class="site-footer__links"><a href="/get-involved/">Get involved</a><a href="/contributing/">Contributing</a><a href="/platform/">Galileo Engine</a><a href="/galileo-browser/">Galileo Browser</a><a href="/roadmap/">Roadmap</a><a href="/newsletter/">Newsletter</a><a href="/about/">About</a><a href="/contact/">Contact</a><a href="/team/">Team</a><a href="/github/">GitHub</a></div><p class="site-footer__meta">Galileo / newsletter / 2026</p></div></footer>
</body>
</html>
`;
}

async function build() {
  await rm(outputRoot, { recursive: true, force: true });
  await mkdir(outputRoot, { recursive: true });

  const newsletter = await loadDiscussions();
  const giscusEnabled = process.env.GISCUS_ENABLED === "true";

  for (const file of publicFiles) {
    await cp(path.join(projectRoot, file), path.join(outputRoot, file));
  }
  await cp(path.join(projectRoot, "assets"), path.join(outputRoot, "assets"), { recursive: true });
  await rm(path.join(outputRoot, "assets", "human-ai-handoff.png"), { force: true });
  await rm(path.join(outputRoot, "assets", "ai-acceleration.png"), { force: true });
  await cp(path.join(projectRoot, "journal"), path.join(outputRoot, "journal"), { recursive: true });
  await cp(path.join(projectRoot, "newsletter"), path.join(outputRoot, "newsletter"), { recursive: true });
  await cp(path.join(projectRoot, "data"), path.join(outputRoot, "data"), { recursive: true });

  for (const page of cleanPages) {
    const routeDirectory = path.join(outputRoot, page.route);
    const rawSource = await readFile(path.join(projectRoot, page.source), "utf8");
    const source = page.source === "newsletter.html"
      ? renderNewsletterIndex(rawSource, newsletter.discussions)
      : rawSource;
    await mkdir(routeDirectory, { recursive: true });
    await writeFile(path.join(routeDirectory, "index.html"), source, "utf8");
    await writeFile(
      path.join(outputRoot, page.source),
      renderRedirectPage({ destination: `/${page.route}/`, title: page.title }),
      "utf8",
    );
  }

  for (const redirect of routeRedirects) {
    const redirectPage = renderRedirectPage(redirect);
    const routeDirectory = path.join(outputRoot, redirect.route);
    await mkdir(routeDirectory, { recursive: true });
    await writeFile(path.join(routeDirectory, "index.html"), redirectPage, "utf8");
    await writeFile(path.join(outputRoot, redirect.legacySource), redirectPage, "utf8");
  }

  for (const discussion of newsletter.discussions) {
    const publicRoute = publicDiscussionRoute(discussion);
    const routeDirectory = path.join(outputRoot, ...publicRoute.split("/").filter(Boolean));
    await mkdir(routeDirectory, { recursive: true });
    await writeFile(path.join(routeDirectory, "index.html"), renderDiscussionPage(discussion, giscusEnabled), "utf8");

    const legacyDirectory = path.join(outputRoot, "newsletter", "discussions", String(discussion.number));
    await mkdir(legacyDirectory, { recursive: true });
    await writeFile(
      path.join(legacyDirectory, "index.html"),
      renderRedirectPage({ destination: publicRoute, title: discussion.title }),
      "utf8",
    );
  }

  const sitemap = await readFile(path.join(projectRoot, "sitemap.xml"), "utf8");
  await writeFile(path.join(outputRoot, "sitemap.xml"), renderSitemap(sitemap, newsletter.discussions), "utf8");

  await writeFile(
    path.join(outputRoot, "data", "newsletter-discussions.json"),
    `${JSON.stringify({
      source: { repository: discussionRepository, category: discussionCategory },
      fetchedAt: new Date().toISOString(),
      discussions: newsletter.discussions,
    }, null, 2)}\n`,
    "utf8",
  );

  console.log(
    `Built GitHub Pages artifact with ${cleanPages.length} clean routes and ${newsletter.discussions.length} discussion post(s) from ${newsletter.source}; comments: ${giscusEnabled ? "embedded giscus" : "GitHub link fallback"}.`,
  );
}

await build();
