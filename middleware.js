import { NextResponse } from "next/server";

export function middleware(req) {
  const password = process.env.MAYA_PASSWORD;

  if (!password) {
    return new NextResponse("Configure MAYA_PASSWORD na Vercel.", { status: 503 });
  }

  const auth = req.headers.get("authorization") || "";
  const [scheme, encoded] = auth.split(" ");

  if (scheme === "Basic" && encoded) {
    try {
      const decoded = atob(encoded);
      const sent = decoded.slice(decoded.indexOf(":") + 1);
      if (sent === password) return NextResponse.next();
    } catch {}
  }

  return new NextResponse("Acesso restrito.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Maya", charset="UTF-8"' },
  });
}

export const config = { matcher: "/:path*" };
