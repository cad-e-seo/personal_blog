import { createClient } from '@/lib/supabase/server';
import { downloadImage } from '@/lib/api/markdown-transform';
import type { Asset } from '@/lib/supabase/types';

/**
 * Upload an image from a remote URL to Supabase storage and create an asset record.
 */
export async function uploadImageFromUrl(
  url: string,
  altText?: string
): Promise<Asset> {
  const supabase = await createClient();

  const { buffer, contentType, filename } = await downloadImage(url);

  const ext = filename.split('.').pop() || 'jpg';
  const uniqueFilename = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const storagePath = `posts/${uniqueFilename}`;

  const { error: uploadError } = await supabase.storage
    .from('blog-assets')
    .upload(storagePath, buffer, {
      contentType,
      upsert: false,
      cacheControl: '31536000', // ponytail: 1yr — images are immutable, cut egress
    });

  if (uploadError) {
    throw new Error(`Storage upload failed: ${uploadError.message}`);
  }

  const { data: asset, error: assetError } = await supabase
    .from('assets')
    .insert({
      storage_path: storagePath,
      bucket: 'blog-assets',
      filename,
      mime_type: contentType,
      file_size: buffer.byteLength,
      alt_text: altText || null,
    })
    .select()
    .single();

  if (assetError) {
    await supabase.storage.from('blog-assets').remove([storagePath]);
    throw new Error(`Asset record creation failed: ${assetError.message}`);
  }

  return asset as Asset;
}

interface LexicalNode {
  type: string;
  children?: LexicalNode[];
  src?: string;
  assetId?: string;
  [key: string]: unknown;
}

/**
 * Walk a Lexical editor state JSON tree, find image nodes with remote URLs,
 * download and upload each to Supabase, and update src/assetId in-place.
 */
export async function processRemoteImages(
  editorState: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const root = (editorState as { root?: LexicalNode }).root;
  if (!root?.children) return editorState;

  await walkAndUpload(root.children);
  return editorState;
}

async function walkAndUpload(nodes: LexicalNode[]): Promise<void> {
  for (const node of nodes) {
    if (node.type === 'image' && typeof node.src === 'string' && isRemoteUrl(node.src)) {
      try {
        const asset = await uploadImageFromUrl(node.src, (node.alt as string) || undefined);
        const supabase = await createClient();
        const { data: { publicUrl } } = supabase.storage
          .from(asset.bucket)
          .getPublicUrl(asset.storage_path);
        node.src = publicUrl;
        node.assetId = asset.id;
      } catch (err) {
        console.error(`Failed to upload remote image ${node.src}:`, err);
        // Leave the original URL in place
      }
    }

    if (node.children) {
      await walkAndUpload(node.children);
    }
  }
}

function isRemoteUrl(url: string): boolean {
  return url.startsWith('http://') || url.startsWith('https://');
}
