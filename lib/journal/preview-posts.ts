import type { JournalPost } from "@/lib/journal/types";

const sharedAuthor = {
  displayName: "GalileoEngine team",
  bio: "Engineering notes from the team building GalileoEngine and Galileo Browser.",
};

export const previewPosts: JournalPost[] = [
  {
    id: "preview-lineage",
    title: "Why the engine lineage stays visible",
    slug: "why-the-engine-lineage-stays-visible",
    excerpt:
      "GalileoEngine is derived from Servo. Keeping that relationship explicit makes technical ownership and project claims easier to understand.",
    bodyMarkdown: `## A boundary worth stating

Servo provides the upstream web-engine foundation. GalileoEngine develops the integration, compatibility work, browser-facing capabilities, and qualification needed by Galileo Browser.

Those layers are related, but they are not interchangeable names. Stating the boundary helps contributors understand where a change belongs and helps readers distinguish upstream capability from work completed in this project.

## What the team owns

- integration around the inherited engine;
- the desktop browser surface and user experience;
- focused compatibility and reliability work;
- release gates and public communication.

The journal will use the same rule as the rest of the project: describe retained evidence precisely and keep unfinished work visible.`,
    category: "Engine notes",
    coverPath: null,
    coverUrl: null,
    status: "published",
    publishedAt: "2026-08-08T09:00:00.000Z",
    createdAt: "2026-08-08T09:00:00.000Z",
    updatedAt: "2026-08-08T09:00:00.000Z",
    readingMinutes: 2,
    author: sharedAuthor,
  },
  {
    id: "preview-evidence",
    title: "What counts as progress evidence",
    slug: "what-counts-as-progress-evidence",
    excerpt:
      "A passing focused check is useful, but it does not automatically become a broad browser-readiness claim.",
    bodyMarkdown: `## Evidence before percentage

Browser development has many workstreams and no honest single denominator during the research stage. A percentage would look precise while hiding what was actually measured.

GalileoEngine therefore records narrow results with their limits attached. A build result, a focused browser journey, and a compatibility probe answer different questions.

## The public rule

Every update should explain:

1. what was exercised;
2. in which environment;
3. what passed or failed;
4. what the result does **not** establish;
5. which gate comes next.

This makes progress slower to summarise, but much easier to trust.`,
    category: "Development updates",
    coverPath: null,
    coverUrl: null,
    status: "published",
    publishedAt: "2026-08-06T09:00:00.000Z",
    createdAt: "2026-08-06T09:00:00.000Z",
    updatedAt: "2026-08-06T09:00:00.000Z",
    readingMinutes: 2,
    author: sharedAuthor,
  },
  {
    id: "preview-release-gates",
    title: "Designing a release gate for Galileo Browser",
    slug: "designing-a-release-gate-for-galileo-browser",
    excerpt:
      "A public browser build needs more than a successful compilation. The path to release is a chain of measured gates.",
    bodyMarkdown: `## The build is the beginning

A reproducible build answers an important question, but users need a complete product boundary: installation, updates, recovery, privacy, accessibility, and dependable everyday journeys.

The current roadmap separates those concerns into gates so that later claims inherit evidence instead of replacing it.

## A qualified path

- establish a reproducible baseline;
- retain focused evidence for core journeys;
- broaden compatibility and hardening;
- qualify packaging and update behaviour;
- release a scoped public alpha only after its entry criteria pass.

The journal will document movement through those gates without presenting planned work as completed work.`,
    category: "Galileo Browser",
    coverPath: null,
    coverUrl: null,
    status: "published",
    publishedAt: "2026-08-04T09:00:00.000Z",
    createdAt: "2026-08-04T09:00:00.000Z",
    updatedAt: "2026-08-04T09:00:00.000Z",
    readingMinutes: 2,
    author: sharedAuthor,
  },
];
