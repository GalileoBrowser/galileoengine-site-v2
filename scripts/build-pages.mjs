import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");
const outputRoot = path.join(projectRoot, "dist");
const repository = process.env.GITHUB_REPOSITORY || "GalileoBrowser/galileoengine-site-v2";
const discussionCategory = "announcements";

const publicFiles = [
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

async function loadJournalEntries() {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (!token) {
    console.warn("GitHub token not available; building the Journal empty state.");
    return [];
  }

  const [owner, name] = repository.split("/");
  const query = `
    query JournalEntries($owner: String!, $name: String!) {
      repository(owner: $owner, name: $name) {
        discussions(first: 24, orderBy: { field: CREATED_AT, direction: DESC }) {
          nodes {
            number
            title
            url
            bodyText
            createdAt
            category { name slug }
            author { login avatarUrl url }
            comments { totalCount }
            upvoteCount
          }
        }
      }
    }
  `;

  const response = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "galileoengine-pages-build",
    },
    body: JSON.stringify({ query, variables: { owner, name } }),
  });

  if (!response.ok) {
    throw new Error(`GitHub Discussions request failed with HTTP ${response.status}.`);
  }

  const payload = await response.json();
  if (payload.errors?.length) {
    throw new Error(`GitHub Discussions request failed: ${payload.errors[0].message}`);
  }

  return (payload.data?.repository?.discussions?.nodes ?? []).filter(
    (item) => item.category?.slug === discussionCategory,
  );
}

function renderEntry(item) {
  const author = item.author?.login || "GalileoEngine team";
  const avatar = item.author?.avatarUrl || "../assets/galileo-symbol.png";
  const replies = Number(item.comments?.totalCount || 0);
  const upvotes = Number(item.upvoteCount || 0);

  return `        <article class="journal-entry">
          <p class="journal-entry__meta"><span>${escapeHtml(formatDate(item.createdAt))}</span><span>Discussion #${escapeHtml(item.number)}</span></p>
          <div class="journal-entry__content">
            <span>${escapeHtml(item.category?.name || "Galileo Journal")}</span>
            <h3><a href="${escapeHtml(item.url)}">${escapeHtml(item.title)}</a></h3>
            <p class="journal-entry__excerpt">${escapeHtml(excerpt(item.bodyText))}</p>
            <a class="journal-entry__author" href="${escapeHtml(item.author?.url || item.url)}"><img src="${escapeHtml(avatar)}" alt="" width="26" height="26"><span>@${escapeHtml(author)}</span></a>
          </div>
          <div class="journal-entry__signals"><span>${replies} ${replies === 1 ? "reply" : "replies"}</span><span>${upvotes} ${upvotes === 1 ? "upvote" : "upvotes"}</span><a href="${escapeHtml(item.url)}">Read &amp; discuss <span aria-hidden="true">↗</span></a></div>
        </article>`;
}

function renderEmptyState() {
  return `        <article class="journal-entry journal-entry--empty">
          <p class="journal-entry__meta"><span>Journal is ready</span></p>
          <h3>The first public field note is being prepared.</h3>
          <p>Until it is published, the Discussions category remains the canonical place for GalileoEngine updates and community replies.</p>
          <a class="text-link" href="https://github.com/${repository}/discussions/categories/${discussionCategory}">Open Discussions <span aria-hidden="true">↗</span></a>
        </article>`;
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

  const entries = await loadJournalEntries();
  const journalPath = path.join(outputRoot, "journal", "index.html");
  const template = await readFile(journalPath, "utf8");
  const startMarker = "        <!-- JOURNAL_ENTRIES_START -->";
  const endMarker = "        <!-- JOURNAL_ENTRIES_END -->";
  const start = template.indexOf(startMarker);
  const end = template.indexOf(endMarker);
  if (start < 0 || end < 0 || end <= start) {
    throw new Error("Journal entry markers are missing or out of order.");
  }

  const rendered = entries.length ? entries.map(renderEntry).join("\n") : renderEmptyState();
  const output = `${template.slice(0, start)}${startMarker}\n${rendered}\n${template.slice(end)}`;
  await writeFile(journalPath, output, "utf8");

  console.log(`Built GitHub Pages artifact with ${entries.length} Journal entr${entries.length === 1 ? "y" : "ies"}.`);
}

await build();
