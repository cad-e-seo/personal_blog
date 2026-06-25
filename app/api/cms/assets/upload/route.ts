import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { validateApiKey, jsonResponse, errorResponse } from '@/lib/api/auth';
import type { Asset } from '@/lib/api/types';

const ALLOWED_IMAGE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/svg+xml',
];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

/**
 * POST /api/cms/assets/upload
 * Upload a file to storage
 *
 * Form data:
 * - file: File (required)
 * - alt_text: string (optional)
 * - caption: string (optional)
 */
export async function POST(request: NextRequest) {
  const authError = validateApiKey(request);
  if (authError) return authError;

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const altText = formData.get('alt_text') as string | null;
    const caption = formData.get('caption') as string | null;

    if (!file) {
      return errorResponse('file is required', 400);
    }

    // Validate file type
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      return errorResponse(
        `Invalid file type. Allowed types: ${ALLOWED_IMAGE_TYPES.join(', ')}`,
        400
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return errorResponse('File too large. Maximum size is 10MB', 400);
    }

    const supabase = await createClient();

    // Generate unique filename
    const ext = file.name.split('.').pop() || 'bin';
    const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const storagePath = `posts/${filename}`;

    // Upload to storage
    const arrayBuffer = await file.arrayBuffer();
    const buffer = new Uint8Array(arrayBuffer);

    const { error: uploadError } = await supabase.storage
      .from('blog-assets')
      .upload(storagePath, buffer, {
        contentType: file.type,
        upsert: false,
        cacheControl: '31536000', // ponytail: 1yr — images are immutable, cut egress
      });

    if (uploadError) {
      console.error('Storage upload error:', uploadError);
      return errorResponse('Failed to upload file to storage', 500, uploadError);
    }

    // Get image dimensions if it's an image
    let width: number | null = null;
    let height: number | null = null;

    // Note: We can't easily get dimensions server-side without additional libraries
    // For now, we'll skip this and let the client provide them if needed

    // Create asset record
    const { data: asset, error: assetError } = await supabase
      .from('assets')
      .insert({
        storage_path: storagePath,
        bucket: 'blog-assets',
        filename: file.name,
        mime_type: file.type,
        file_size: file.size,
        width,
        height,
        alt_text: altText,
        caption,
      })
      .select()
      .single();

    if (assetError) {
      console.error('Asset record creation error:', assetError);
      // Try to clean up the uploaded file
      await supabase.storage.from('blog-assets').remove([storagePath]);
      return errorResponse('Failed to create asset record', 500, assetError);
    }

    const typedAsset = asset as Asset;
    const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/blog-assets/${storagePath}`;

    return jsonResponse(
      {
        data: {
          asset: typedAsset,
          url,
        },
      },
      201
    );
  } catch (error) {
    console.error('Error uploading asset:', error);
    return errorResponse('Failed to upload asset', 500, error);
  }
}
