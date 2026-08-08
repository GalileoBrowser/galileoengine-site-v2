"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { normaliseSlug } from "@/lib/journal/content";
import type { PostStatus } from "@/lib/journal/types";
import { getCurrentStudioProfile } from "@/lib/journal/queries";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const postSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().trim().min(5).max(140),
  slug: z.string().trim().min(3).max(80),
  excerpt: z.string().trim().min(30).max(320),
  category: z.string().trim().min(3).max(60),
  bodyMarkdown: z.string().trim().min(80).max(100_000),
  intent: z.enum(["save", "review", "publish", "archive"]),
});

interface ExistingPost {
  author_id: string;
  status: PostStatus;
  published_at: string | null;
  slug: string;
  cover_path: string | null;
}

export interface StudioActionResult {
  ok: boolean;
  message: string;
  postId?: string;
}

function value(formData: FormData, key: string) {
  const item = formData.get(key);
  return typeof item === "string" ? item : "";
}

function nextStatus(
  intent: z.infer<typeof postSchema>["intent"],
  currentStatus: PostStatus,
  role: "editor" | "admin",
): PostStatus {
  if (intent === "review") return "review";
  if (intent === "publish") return role === "admin" ? "published" : "review";
  if (intent === "archive") return role === "admin" ? "archived" : currentStatus;
  return currentStatus === "archived" && role !== "admin" ? "draft" : currentStatus;
}

async function uploadCover(
  formData: FormData,
  ownerId: string,
  supabase: SupabaseClient,
) {
  const file = formData.get("cover");
  if (!(file instanceof File) || file.size === 0) return null;

  const acceptedTypes = ["image/jpeg", "image/png", "image/webp"];
  if (!acceptedTypes.includes(file.type)) {
    throw new Error("Cover images must be JPG, PNG, or WebP.");
  }
  if (file.size > 8 * 1024 * 1024) {
    throw new Error("Cover images must be smaller than 8 MB.");
  }

  const extensionByType: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
  };
  const extension = extensionByType[file.type];
  const path = `${ownerId}/${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from("journal-media").upload(path, file, {
    cacheControl: "3600",
    contentType: file.type,
    upsert: false,
  });

  if (error) throw new Error("The cover image could not be uploaded.");
  return path;
}

async function removeCover(supabase: SupabaseClient, path: string | null) {
  if (!path) return;
  await supabase.storage.from("journal-media").remove([path]);
}

export async function savePost(formData: FormData): Promise<StudioActionResult> {
  if (!isSupabaseConfigured) {
    return { ok: false, message: "Supabase is not connected." };
  }

  const profileResult = await getCurrentStudioProfile();
  const profile = profileResult.data;
  if (!profile || (profile.role !== "editor" && profile.role !== "admin")) {
    return { ok: false, message: "Your account does not have editorial access." };
  }

  const parsed = postSchema.safeParse({
    id: value(formData, "id") || undefined,
    title: value(formData, "title"),
    slug: normaliseSlug(value(formData, "slug") || value(formData, "title")),
    excerpt: value(formData, "excerpt"),
    category: value(formData, "category"),
    bodyMarkdown: value(formData, "bodyMarkdown"),
    intent: value(formData, "intent") || "save",
  });

  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, message: issue?.message || "Check the article fields and try again." };
  }

  if (
    (parsed.data.intent === "publish" || parsed.data.intent === "archive") &&
    profile.role !== "admin"
  ) {
    return { ok: false, message: "Only an administrator can publish or archive an article." };
  }
  if (!parsed.data.id && parsed.data.intent === "archive") {
    return { ok: false, message: "Save the article before archiving it." };
  }

  const supabase = await createSupabaseServerClient();
  let existingPost: ExistingPost | null = null;
  if (parsed.data.id) {
    const { data, error } = await supabase
      .from("posts")
      .select("author_id, status, published_at, slug, cover_path")
      .eq("id", parsed.data.id)
      .maybeSingle();

    if (error || !data) {
      return { ok: false, message: "The article no longer exists or is not accessible." };
    }

    existingPost = data as ExistingPost;
    if (profile.role === "editor" && existingPost.author_id !== profile.id) {
      return { ok: false, message: "Only the article author or an administrator can modify it." };
    }
  }

  let uploadedCover: string | null = null;
  let persisted = false;
  try {
    uploadedCover = await uploadCover(formData, profile.id, supabase);
    const currentStatus = existingPost?.status ?? "draft";
    const status = nextStatus(parsed.data.intent, currentStatus, profile.role);
    const publishedAt =
      status !== "published"
        ? null
        : parsed.data.intent === "publish" && currentStatus !== "published"
          ? new Date().toISOString()
          : existingPost?.published_at ?? new Date().toISOString();
    const payload = {
      title: parsed.data.title,
      slug: parsed.data.slug,
      excerpt: parsed.data.excerpt,
      category: parsed.data.category,
      body_markdown: parsed.data.bodyMarkdown,
      cover_path: uploadedCover ?? existingPost?.cover_path ?? null,
      status,
      published_at: publishedAt,
    };

    if (parsed.data.id) {
      const { data, error } = await supabase
        .from("posts")
        .update(payload)
        .eq("id", parsed.data.id)
        .select("id")
        .maybeSingle();
      if (error || !data) {
        await removeCover(supabase, uploadedCover);
        uploadedCover = null;
        return {
          ok: false,
          message:
            error?.code === "23505"
              ? "That article URL is already in use. Choose a different slug."
              : "The article could not be updated.",
        };
      }

      persisted = true;
      revalidatePath("/journal");
      revalidatePath(`/journal/${parsed.data.slug}`);
      if (existingPost?.slug && existingPost.slug !== parsed.data.slug) {
        revalidatePath(`/journal/${existingPost.slug}`);
      }
      revalidatePath("/studio");
      if (uploadedCover && existingPost?.cover_path && uploadedCover !== existingPost.cover_path) {
        await removeCover(supabase, existingPost.cover_path);
      }
      return { ok: true, message: `Article saved as ${status}.`, postId: parsed.data.id };
    }

    const { data, error } = await supabase
      .from("posts")
      .insert({ ...payload, author_id: profile.id })
      .select("id")
      .single();

    if (error) {
      await removeCover(supabase, uploadedCover);
      uploadedCover = null;
      return {
        ok: false,
        message:
          error.code === "23505"
            ? "That article URL is already in use. Choose a different slug."
            : "The draft could not be created.",
      };
    }

    persisted = true;
    revalidatePath("/journal");
    revalidatePath("/studio");
    return { ok: true, message: `Article created as ${status}.`, postId: data.id };
  } catch (error) {
    if (!persisted) await removeCover(supabase, uploadedCover);
    return {
      ok: false,
      message: error instanceof Error ? error.message : "The article could not be saved.",
    };
  }
}

export async function signOut() {
  if (!isSupabaseConfigured) return;
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
}
