import type { LoaderFunctionArgs } from "react-router";
import { readFile } from "node:fs/promises";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

function safeDownloadName(value: string) {
  return value.replace(/[^a-zA-Z0-9_.-]/g, "_") || "order.pdf";
}

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const id = params.id || "";

  const saved = await prisma.savedPdf.findFirst({
    where: { id, shop: session.shop },
  });

  if (!saved) {
    return new Response("Saved PDF not found.", { status: 404 });
  }

  try {
    const file = await readFile(saved.filePath);
    return new Response(file, {
      headers: {
        "Content-Type": saved.contentType,
        "Content-Disposition": `attachment; filename="${safeDownloadName(saved.fileName)}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return new Response("The database record exists, but the PDF file is missing from storage.", { status: 410 });
  }
};
