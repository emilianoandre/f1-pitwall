import { NextResponse } from "next/server";
import { createSessionToken, timingSafeEqualStr } from "@/lib/session";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { username?: string; password?: string } | null;

  const expectedUser = process.env.APP_USERNAME;
  const expectedPass = process.env.APP_PASSWORD;
  const secret = process.env.AUTH_SECRET;
  if (!expectedUser || !expectedPass || !secret) {
    return NextResponse.json({ error: "login is not configured" }, { status: 503 });
  }

  const username = body?.username ?? "";
  const password = body?.password ?? "";
  const valid =
    timingSafeEqualStr(username, expectedUser) && timingSafeEqualStr(password, expectedPass);
  if (!valid) {
    return NextResponse.json({ error: "invalid username or password" }, { status: 401 });
  }

  const token = await createSessionToken(secret);
  const res = NextResponse.json({ ok: true });
  res.cookies.set("session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 30 * 24 * 60 * 60,
  });
  return res;
}
