import { db, isDatabaseConfigured } from "@/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  // Сайт YawaChatHub не зависит от базы данных: без DATABASE_URL просто сообщаем об этом.
  if (!isDatabaseConfigured()) {
    return Response.json({ ok: true, db: "not-configured" });
  }

  try {
    await db.execute(sql`select 1`);
    return Response.json({ ok: true, db: "ok" });
  } catch {
    return Response.json({ ok: false, db: "error" }, { status: 500 });
  }
}
