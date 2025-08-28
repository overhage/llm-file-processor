export { default } from "next-auth/middleware";

// Require auth on these routes:
export const config = {
  matcher: ["/jobs/:path*", "/upload/:path*"], // (keep /admin protected server-side)
};
