"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState, useTransition } from "react";
import { savePost, type StudioActionResult } from "@/app/studio/actions";
import { MarkdownContent } from "@/components/markdown-content";
import { normaliseSlug } from "@/lib/journal/content";
import type { JournalPost, MemberRole } from "@/lib/journal/types";

const categories = [
  "Engine notes",
  "Development updates",
  "Galileo Browser",
  "Release notes",
  "Research",
  "Community",
];

const emptyResult: StudioActionResult = { ok: false, message: "" };

export function EditorForm({ post, role }: { post?: JournalPost | null; role: MemberRole }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [title, setTitle] = useState(post?.title ?? "");
  const [slug, setSlug] = useState(post?.slug ?? "");
  const [slugEdited, setSlugEdited] = useState(Boolean(post?.slug));
  const [excerpt, setExcerpt] = useState(post?.excerpt ?? "");
  const [category, setCategory] = useState(post?.category ?? categories[0]);
  const [bodyMarkdown, setBodyMarkdown] = useState(post?.bodyMarkdown ?? "## Start with the evidence\n\nDescribe what changed, where it was verified, and what remains outside the claim.");
  const [result, setResult] = useState<StudioActionResult>(emptyResult);

  const previewTitle = useMemo(() => title.trim() || "Untitled field note", [title]);

  function updateTitle(value: string) {
    setTitle(value);
    if (!slugEdited) setSlug(normaliseSlug(value));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nativeEvent = event.nativeEvent as SubmitEvent;
    const submitter = nativeEvent.submitter as HTMLButtonElement | null;
    const intent = submitter?.value || "save";
    const formData = new FormData(event.currentTarget);
    formData.set("intent", intent);

    setResult(emptyResult);
    startTransition(async () => {
      const actionResult = await savePost(formData);
      setResult(actionResult);
      if (actionResult.ok && actionResult.postId && !post?.id) {
        router.replace(`/studio/${actionResult.postId}`);
      } else if (actionResult.ok) {
        router.refresh();
      }
    });
  }

  return (
    <div className="editor-layout">
      <form className="editor-panel editor-form" onSubmit={submit}>
        <input type="hidden" name="id" value={post?.id ?? ""} />

        <div className="form-field">
          <label htmlFor="title">Title</label>
          <input
            id="title"
            name="title"
            value={title}
            onChange={(event) => updateTitle(event.target.value)}
            minLength={5}
            maxLength={140}
            required
          />
        </div>

        <div className="editor-grid">
          <div className="form-field">
            <label htmlFor="slug">Article URL</label>
            <input
              id="slug"
              name="slug"
              value={slug}
              onChange={(event) => {
                setSlugEdited(true);
                setSlug(normaliseSlug(event.target.value));
              }}
              minLength={3}
              maxLength={80}
              pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
              required
            />
            <small>/journal/{slug || "article-url"}</small>
          </div>
          <div className="form-field">
            <label htmlFor="category">Category</label>
            <select
              id="category"
              name="category"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
            >
              {categories.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="form-field">
          <label htmlFor="excerpt">Excerpt</label>
          <textarea
            id="excerpt"
            name="excerpt"
            value={excerpt}
            onChange={(event) => setExcerpt(event.target.value)}
            minLength={30}
            maxLength={320}
            required
          />
          <small>{excerpt.length}/320 characters. State the subject without a marketing claim.</small>
        </div>

        <div className="form-field">
          <label htmlFor="bodyMarkdown">Article body / Markdown</label>
          <textarea
            id="bodyMarkdown"
            name="bodyMarkdown"
            value={bodyMarkdown}
            onChange={(event) => setBodyMarkdown(event.target.value)}
            minLength={80}
            required
          />
        </div>

        <div className="form-field">
          <label htmlFor="cover">Cover image</label>
          <input id="cover" name="cover" type="file" accept="image/jpeg,image/png,image/webp" />
          <small>JPG, PNG, or WebP. Maximum 8 MB.</small>
        </div>

        <div className="editor-actions">
          <button className="secondary-button" type="submit" name="intent" value="save" disabled={pending}>
            {post ? "Save changes" : "Save draft"}
          </button>
          {post?.status !== "published" ? (
            <button className="primary-button" type="submit" name="intent" value="review" disabled={pending}>
              Send to review
            </button>
          ) : null}
          {role === "admin" ? (
            <button className="primary-button" type="submit" name="intent" value="publish" disabled={pending}>
              {post?.status === "published" ? "Update published article" : "Publish"}
            </button>
          ) : null}
          {role === "admin" && post ? (
            <button className="danger-button" type="submit" name="intent" value="archive" disabled={pending}>
              Archive
            </button>
          ) : null}
        </div>

        {pending ? <p className="auth-message" role="status">Saving the article…</p> : null}
        {result.message ? (
          <p className={`auth-message${result.ok ? "" : " auth-message--error"}`} role={result.ok ? "status" : "alert"}>
            {result.message}
          </p>
        ) : null}
      </form>

      <aside className="editor-panel editor-preview" aria-label="Live article preview">
        <p className="editor-preview__label">Live preview / not published</p>
        <div className="post-meta">
          <span>{category}</span>
          <span>{post?.status ?? "draft"}</span>
        </div>
        <h2>{previewTitle}</h2>
        {excerpt ? <p className="article-deck">{excerpt}</p> : null}
        <MarkdownContent markdown={bodyMarkdown} />
      </aside>
    </div>
  );
}
