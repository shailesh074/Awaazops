import "server-only";
import { ZodError } from "zod";
import { ReportError } from "@/server/pipeline/errors";

/** Uniform JSON error responses. Never leaks stack traces or provider internals. */
export function errorResponse(err: unknown): Response {
  if (err instanceof ReportError) {
    return Response.json({ error: { code: err.code, message: err.message } }, { status: err.status });
  }
  if (err instanceof ZodError) {
    return Response.json(
      { error: { code: "BAD_REQUEST", message: err.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; ") } },
      { status: 400 },
    );
  }
  console.error("[api]", err);
  return Response.json({ error: { code: "INTERNAL", message: "Something went wrong." } }, { status: 500 });
}
