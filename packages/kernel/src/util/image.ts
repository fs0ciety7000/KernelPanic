// Image metadata helpers shared by `exiftool` and the Images app.

export interface ImageInfo {
  mime: string;
  width?: number;
  height?: number;
  title?: string;
  description?: string;
  /** Ordered EXIF-like tags (from <kp:exif …/> in SVGs). */
  exif: Array<[string, string]>;
}

const decodeEntities = (s: string) =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

export function imageInfo(content: string): ImageInfo {
  if (content.startsWith('data:')) {
    const mime = content.slice(5, content.indexOf(';'));
    return { mime, exif: [] };
  }
  const svg = content.match(/<svg\b[^>]*>/)?.[0] ?? '';
  const attr = (tag: string, name: string) => tag.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1];
  const viewBox = attr(svg, 'viewBox')?.split(/\s+/).map(Number);
  const width = Number(attr(svg, 'width')) || viewBox?.[2];
  const height = Number(attr(svg, 'height')) || viewBox?.[3];
  const title = content.match(/<title>([\s\S]*?)<\/title>/)?.[1];
  const description = content.match(/<desc>([\s\S]*?)<\/desc>/)?.[1];
  const exifTag = content.match(/<kp:exif\b([\s\S]*?)\/>/)?.[1] ?? '';
  const exif: Array<[string, string]> = [];
  for (const m of exifTag.matchAll(/([A-Za-z][\w:-]*)="([^"]*)"/g)) {
    if (m[1]!.startsWith('xmlns')) continue;
    exif.push([m[1]!, decodeEntities(m[2]!)]);
  }
  return {
    mime: 'image/svg+xml',
    width,
    height,
    title: title && decodeEntities(title.trim()),
    description: description && decodeEntities(description.trim()),
    exif,
  };
}

/** Browser-displayable URL for an image file's content. */
export function imageSrc(content: string): string {
  if (content.startsWith('data:')) return content;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(content)}`;
}
