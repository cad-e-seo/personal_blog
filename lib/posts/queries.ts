import { createStaticClient, createServiceClient } from '@/lib/supabase/server';
import type { Post, PostWithAsset, Node, NodeWithAsset, MajorTag } from '@/lib/supabase/types';

// ponytail: listings/feeds don't need the post body. Selecting `*` shipped
// editor_state (the full content JSONB) for every card -> the PostgREST egress.
// Explicit column list omits editor_state + footnotes. Single-post fetches keep `*`.
const LIST_COLUMNS = `
  id, slug, title, description, major_tag, sub_tag, language, tags, author,
  status, published_at, created_at, updated_at, featured_image_id, source,
  source_url, translation_of,
  featured_image:assets!featured_image_id(*)
`;

export async function getAllPosts(options?: {
  status?: 'published' | 'draft' | 'archived';
  majorTag?: MajorTag;
  limit?: number;
  includeTranslations?: boolean;
}): Promise<PostWithAsset[]> {
  const supabase = createStaticClient();

  let query = supabase
    .from('posts')
    .select(LIST_COLUMNS)
    .order('published_at', { ascending: false, nullsFirst: false });

  if (options?.status) {
    query = query.eq('status', options.status);
    // For published posts, only show posts with published_at in the past
    if (options.status === 'published') {
      query = query.lte('published_at', new Date().toISOString());
    }
  }

  // By default, exclude translations from feed listings
  if (options?.includeTranslations !== true) {
    query = query.is('translation_of', null);
  }

  if (options?.majorTag) {
    query = query.eq('major_tag', options.majorTag);
  }

  if (options?.limit) {
    query = query.limit(options.limit);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching posts:', error);
    throw error;
  }

  // ponytail: list queries omit editor_state/footnotes by design; cast through unknown.
  return data as unknown as PostWithAsset[];
}

export async function getPublishedPosts(options?: {
  majorTag?: MajorTag;
  limit?: number;
}): Promise<PostWithAsset[]> {
  return getAllPosts({ status: 'published', ...options });
}

export async function getPostBySlug(slug: string): Promise<PostWithAsset | null> {
  const supabase = createStaticClient();

  const { data, error } = await supabase
    .from('posts')
    .select(`
      *,
      featured_image:assets!featured_image_id(*)
    `)
    .eq('slug', slug)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null; // Not found
    }
    console.error('Error fetching post:', error);
    throw error;
  }

  return data as PostWithAsset;
}

export async function getPostWithNodes(slug: string): Promise<{
  post: PostWithAsset;
  nodes: NodeWithAsset[];
} | null> {
  const supabase = createStaticClient();

  // Fetch post
  const { data: post, error: postError } = await supabase
    .from('posts')
    .select(`
      *,
      featured_image:assets!featured_image_id(*)
    `)
    .eq('slug', slug)
    .single();

  if (postError) {
    if (postError.code === 'PGRST116') {
      return null;
    }
    throw postError;
  }

  // Fetch nodes for this post
  const { data: nodes, error: nodesError } = await supabase
    .from('nodes')
    .select(`
      *,
      asset:assets(*)
    `)
    .eq('post_id', post.id)
    .order('position', { ascending: true });

  if (nodesError) {
    throw nodesError;
  }

  return {
    post: post as PostWithAsset,
    nodes: nodes as NodeWithAsset[],
  };
}

/**
 * Fetch a post using the service role client (bypasses RLS).
 * Used for preview mode so draft posts can be read.
 */
export async function getPostWithNodesPreview(slug: string): Promise<{
  post: PostWithAsset;
  nodes: NodeWithAsset[];
} | null> {
  const supabase = createServiceClient();

  const { data: post, error: postError } = await supabase
    .from('posts')
    .select(`
      *,
      featured_image:assets!featured_image_id(*)
    `)
    .eq('slug', slug)
    .single();

  if (postError) {
    if (postError.code === 'PGRST116') {
      return null;
    }
    throw postError;
  }

  const { data: nodes, error: nodesError } = await supabase
    .from('nodes')
    .select(`
      *,
      asset:assets(*)
    `)
    .eq('post_id', post.id)
    .order('position', { ascending: true });

  if (nodesError) {
    throw nodesError;
  }

  return {
    post: post as PostWithAsset,
    nodes: nodes as NodeWithAsset[],
  };
}

export async function getPostSlugs(): Promise<string[]> {
  const supabase = createStaticClient();

  const { data, error } = await supabase
    .from('posts')
    .select('slug')
    .eq('status', 'published')
    .lte('published_at', new Date().toISOString());

  if (error) {
    console.error('Error fetching post slugs:', error);
    throw error;
  }

  return data.map((post: { slug: string }) => post.slug);
}

export async function getPostsByMajorTag(options?: { includeTranslations?: boolean }): Promise<Record<MajorTag, PostWithAsset[]>> {
  const posts = await getAllPosts({ status: 'published', includeTranslations: options?.includeTranslations });

  const grouped: Record<MajorTag, PostWithAsset[]> = {
    'Thoughts': [],
    'Tinkering': [],
    'Translations': [],
  };

  for (const post of posts) {
    if (grouped[post.major_tag]) {
      grouped[post.major_tag].push(post);
    }
  }

  return grouped;
}

export async function searchPosts(query: string): Promise<PostWithAsset[]> {
  const supabase = createStaticClient();

  const { data, error } = await supabase
    .from('posts')
    .select(LIST_COLUMNS)
    .eq('status', 'published')
    .lte('published_at', new Date().toISOString())
    .or(`title.ilike.%${query}%,description.ilike.%${query}%`)
    .order('published_at', { ascending: false });

  if (error) {
    console.error('Error searching posts:', error);
    throw error;
  }

  // ponytail: list queries omit editor_state/footnotes by design; cast through unknown.
  return data as unknown as PostWithAsset[];
}

export async function getPublishedPostsByTag(tag: string): Promise<PostWithAsset[]> {
  const supabase = createStaticClient();

  const { data, error } = await supabase
    .from('posts')
    .select(LIST_COLUMNS)
    .eq('status', 'published')
    .lte('published_at', new Date().toISOString())
    .contains('tags', [tag])
    .order('published_at', { ascending: false });

  if (error) {
    console.error('Error fetching posts by tag:', error);
    throw error;
  }

  // ponytail: list queries omit editor_state/footnotes by design; cast through unknown.
  return data as unknown as PostWithAsset[];
}

export async function getAllUniqueTags(): Promise<string[]> {
  const supabase = createStaticClient();

  const { data, error } = await supabase
    .from('posts')
    .select('tags')
    .eq('status', 'published')
    .lte('published_at', new Date().toISOString());

  if (error) {
    console.error('Error fetching unique tags:', error);
    throw error;
  }

  // Flatten all tags and get unique values, sorted alphabetically
  const allTags = data.flatMap((post: { tags: string[] }) => post.tags);
  const uniqueTags = [...new Set(allTags)].sort((a, b) =>
    a.toLowerCase().localeCompare(b.toLowerCase())
  );

  return uniqueTags;
}

/**
 * Get all translations of a given post (posts where translation_of = postId).
 * Also finds sibling translations if the post itself is a translation.
 */
export async function getTranslationsOf(postId: string, translationOf: string | null): Promise<PostWithAsset[]> {
  const supabase = createStaticClient();

  // The "original" post id — either this post (if it's the original) or its parent
  const originalId = translationOf ?? postId;

  // Fetch all posts that are translations of the original, plus the original itself if we're on a translation
  const { data, error } = await supabase
    .from('posts')
    .select(LIST_COLUMNS)
    .or(`translation_of.eq.${originalId},id.eq.${originalId}`)
    .neq('id', postId);

  if (error) {
    console.error('Error fetching translations:', error);
    return [];
  }

  // ponytail: list queries omit editor_state/footnotes by design; cast through unknown.
  return data as unknown as PostWithAsset[];
}
