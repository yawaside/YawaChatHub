import { db } from "@/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  // База нужна не всегда (рендерер YawaChatHub работает без неё) —
  // если DATABASE_URL не задан, просто подтверждаем, что веб-процесс жив.
  if (!process.env.DATABASE_URL) {
    return Response.json({ ok: true, db: "skipped" });
  }
  try {
    await db.execute(sql`select 1`);
    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false }, { status: 500 });
  }
}
