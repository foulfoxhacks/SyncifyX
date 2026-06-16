import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const canonicalUrl = process.env.APP_URL;

  if (process.env.NODE_ENV !== "production" || !canonicalUrl) {
    return NextResponse.next();
  }

  let canonical: URL;

  try {
    canonical = new URL(canonicalUrl);
  } catch {
    return NextResponse.next();
  }

  if (request.nextUrl.host.toLowerCase() === canonical.host.toLowerCase()) {
    return NextResponse.next();
  }

  const destination = new URL(request.nextUrl.pathname, canonical);
  destination.search = request.nextUrl.search;

  return NextResponse.redirect(destination, 308);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};
