import { NextRequest, NextResponse } from "next/server"

// acceptmarkdown.com compliance:
//   1. Every response advertises `Vary: Accept, Accept-Encoding` so CDNs
//      don't hand a cached HTML variant to an agent asking for markdown.
//   2. When the client explicitly prefers text/markdown, we rewrite to the
//      canonical /llms.txt corpus and re-tag its Content-Type as markdown.
export function proxy(req: NextRequest) {
  const accept = (req.headers.get("accept") || "").toLowerCase()

  const wantsMarkdown =
    accept.includes("text/markdown") &&
    !accept.split(",")[0].includes("text/html")

  const res = wantsMarkdown
    ? NextResponse.rewrite(new URL("/llms.txt", req.url))
    : NextResponse.next()

  if (wantsMarkdown) {
    res.headers.set("Content-Type", "text/markdown; charset=utf-8")
    res.headers.set("X-Content-Variant", "markdown")
  }

  const existingVary = res.headers.get("Vary") || ""
  const varyParts = new Set(
    existingVary
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean),
  )
  varyParts.add("Accept")
  varyParts.add("Accept-Encoding")
  res.headers.set("Vary", Array.from(varyParts).join(", "))

  return res
}

// Skip static assets, Next internals, and API routes — HTML page shells only.
export const config = {
  matcher: "/((?!_next/|api/|.*\\..*).*)",
}
