import { isAllowedBrandLogoUrl, resolveBrandLogoUrl } from "@/src/lib/brand-logo-url";

/**
 * Same-origin proxy for brand SVGs held in object storage.
 *
 * The mark is inlined into the DOM so it can be tinted with the active theme,
 * and `fetch` from the browser to another origin needs CORS the bucket does not
 * send. Going through our own origin sidesteps that, and keeps the response
 * cacheable at the edge.
 */
export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const src = requestUrl.searchParams.get("src")?.trim();
  if (!src) {
    return new Response("Missing src", { status: 400 });
  }

  const absolute = resolveBrandLogoUrl(src, requestUrl.origin);
  if (!absolute || !isAllowedBrandLogoUrl(absolute, requestUrl.origin)) {
    return new Response("URL not allowed", { status: 400 });
  }

  let upstream: Response;
  try {
    // No redirects: an allowed URL must not bounce the server somewhere else.
    upstream = await fetch(absolute, {
      redirect: "error",
      signal: AbortSignal.timeout(5000),
      next: { revalidate: 3600 },
    });
  } catch {
    return new Response("Failed to fetch logo", { status: 502 });
  }

  if (!upstream.ok) {
    return new Response("Logo not found", { status: upstream.status });
  }

  const text = await upstream.text();
  // Guard the content type ourselves: this markup gets inlined, so trusting the
  // upstream Content-Type would be trusting the bucket to never serve HTML.
  if (!text.includes("<svg")) {
    return new Response("Not an SVG", { status: 415 });
  }

  return new Response(text, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
    },
  });
}
