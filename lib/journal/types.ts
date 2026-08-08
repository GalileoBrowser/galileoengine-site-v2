export type PostStatus = "draft" | "review" | "published" | "archived";
export type MemberRole = "reader" | "editor" | "admin";

export interface PostAuthor {
  id?: string;
  displayName: string;
  avatarUrl?: string | null;
  bio?: string | null;
}

export interface JournalPost {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  bodyMarkdown: string;
  category: string;
  coverPath?: string | null;
  coverUrl?: string | null;
  status: PostStatus;
  publishedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  readingMinutes: number;
  author: PostAuthor;
}

export type DataMode = "live" | "preview" | "error";

export interface JournalResult<T> {
  data: T;
  mode: DataMode;
  message?: string;
}

export interface StudioProfile {
  id: string;
  displayName: string;
  avatarUrl?: string | null;
  role: MemberRole;
}
