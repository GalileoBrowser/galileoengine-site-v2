import type { SupabaseClient } from "@supabase/supabase-js";
import { cache } from "react";
import { estimateReadingMinutes } from "@/lib/journal/content";
import { previewPosts } from "@/lib/journal/preview-posts";
import type {
  JournalPost,
  JournalResult,
  PostAuthor,
  StudioProfile,
} from "@/lib/journal/types";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

interface PostRow {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  body_markdown: string;
  category: string;
  cover_path: string | null;
  status: JournalPost["status"];
  published_at: string | null;
  created_at: string;
  updated_at: string;
  author_id: string;
  profiles?:
    | {
        display_name: string | null;
        avatar_url: string | null;
        bio: string | null;
      }
    | Array<{
        display_name: string | null;
        avatar_url: string | null;
        bio: string | null;
      }>
    | null;
}

const localPreviewEnabled = process.env.NODE_ENV === "development";

function authorFromRow(row: PostRow): PostAuthor {
  const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;

  return {
    id: row.author_id,
    displayName: profile?.display_name || "GalileoEngine team",
    avatarUrl: profile?.avatar_url,
    bio: profile?.bio,
  };
}

function mapPost(row: PostRow, supabase: SupabaseClient): JournalPost {
  const coverUrl = row.cover_path
    ? supabase.storage.from("journal-media").getPublicUrl(row.cover_path).data
        .publicUrl
    : null;

  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    excerpt: row.excerpt,
    bodyMarkdown: row.body_markdown,
    category: row.category,
    coverPath: row.cover_path,
    coverUrl,
    status: row.status,
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    readingMinutes: estimateReadingMinutes(row.body_markdown),
    author: authorFromRow(row),
  };
}

const postSelection = `
  id,
  title,
  slug,
  excerpt,
  body_markdown,
  category,
  cover_path,
  status,
  published_at,
  created_at,
  updated_at,
  author_id,
  profiles!posts_author_id_fkey(display_name, avatar_url, bio)
`;

export async function getPublishedPosts(
  category?: string,
): Promise<JournalResult<JournalPost[]>> {
  if (!isSupabaseConfigured) {
    if (!localPreviewEnabled) {
      return {
        data: [],
        mode: "error",
        message: "The journal backend is not configured.",
      };
    }

    const posts = category
      ? previewPosts.filter((post) => post.category === category)
      : previewPosts;

    return {
      data: posts,
      mode: "preview",
      message: "Preview content is shown until Supabase is connected.",
    };
  }

  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("posts")
    .select(postSelection)
    .eq("status", "published")
    .lte("published_at", new Date().toISOString())
    .order("published_at", { ascending: false });

  if (category) query = query.eq("category", category);

  const { data, error } = await query;
  if (error) {
    return {
      data: [],
      mode: "error",
      message: "The journal could not be loaded. Please try again shortly.",
    };
  }

  return {
    data: (data as unknown as PostRow[]).map((row) => mapPost(row, supabase)),
    mode: "live",
  };
}

export const getPublishedPost = cache(async function getPublishedPost(
  slug: string,
): Promise<JournalResult<JournalPost | null>> {
  if (!isSupabaseConfigured) {
    if (!localPreviewEnabled) {
      return {
        data: null,
        mode: "error",
        message: "The journal backend is not configured.",
      };
    }

    return {
      data: previewPosts.find((post) => post.slug === slug) ?? null,
      mode: "preview",
      message: "Preview content is shown until Supabase is connected.",
    };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("posts")
    .select(postSelection)
    .eq("slug", slug)
    .eq("status", "published")
    .lte("published_at", new Date().toISOString())
    .maybeSingle();

  if (error) {
    return {
      data: null,
      mode: "error",
      message: "This article could not be loaded.",
    };
  }

  return {
    data: data ? mapPost(data as unknown as PostRow, supabase) : null,
    mode: "live",
  };
});

export async function getCurrentStudioProfile(): Promise<
  JournalResult<StudioProfile | null>
> {
  if (!isSupabaseConfigured) {
    return {
      data: null,
      mode: "preview",
      message: "Connect Supabase to enable team authentication.",
    };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { data: null, mode: "live" };

  const { data, error } = await supabase
    .from("profiles")
    .select("id, display_name, avatar_url, role")
    .eq("id", user.id)
    .single();

  if (error) {
    return {
      data: null,
      mode: "error",
      message: "Your editorial profile could not be loaded.",
    };
  }

  return {
    data: {
      id: data.id,
      displayName: data.display_name || user.email || "Team member",
      avatarUrl: data.avatar_url,
      role: data.role,
    } as StudioProfile,
    mode: "live",
  };
}

export async function getStudioPosts(): Promise<JournalResult<JournalPost[]>> {
  if (!isSupabaseConfigured) {
    return {
      data: [],
      mode: "preview",
      message: "Connect Supabase to create and manage real drafts.",
    };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("posts")
    .select(postSelection)
    .order("updated_at", { ascending: false });

  if (error) {
    return {
      data: [],
      mode: "error",
      message: "Drafts could not be loaded.",
    };
  }

  return {
    data: (data as unknown as PostRow[]).map((row) => mapPost(row, supabase)),
    mode: "live",
  };
}

export async function getStudioPost(
  id: string,
): Promise<JournalResult<JournalPost | null>> {
  if (!isSupabaseConfigured) {
    return { data: null, mode: "preview" };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("posts")
    .select(postSelection)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return { data: null, mode: "error", message: "Draft could not be loaded." };
  }

  return {
    data: data ? mapPost(data as unknown as PostRow, supabase) : null,
    mode: "live",
  };
}
