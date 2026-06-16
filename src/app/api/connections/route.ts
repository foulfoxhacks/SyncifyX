import { NextResponse } from "next/server";
import { getConnectionStatus } from "@/lib/db";
import { getUserId } from "@/lib/session";

export async function GET() {
  try {
    const userId = await getUserId();
    return NextResponse.json(await getConnectionStatus(userId), {
      headers: {
        "cache-control": "no-store, no-cache, must-revalidate"
      }
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: `Could not load account status. Check DATABASE_URL/DATABASE_SSL in Vercel. ${(error as Error).message}`
      },
      {
        status: 500,
        headers: {
          "cache-control": "no-store, no-cache, must-revalidate"
        }
      }
    );
  }
}
