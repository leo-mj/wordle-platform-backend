import { createHash, randomBytes } from "crypto";
import { NextFunction, Request, Response } from "express";
import { pool } from "../server";

const SESSION_DAYS = 30;

// only a hash of each token is stored, so reading the sessions table doesn't give anyone a usable token
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(user: string): Promise<string> {
  const token = randomBytes(32).toString("hex");
  await pool.query(
    "insert into sessions (token_hash, username, expires_at) values ($1, $2, now() + make_interval(days => $3))",
    [hashToken(token), user, SESSION_DAYS]
  );
  return token;
}

export async function deleteSession(token: string) {
  await pool.query("delete from sessions where token_hash = $1", [hashToken(token)]);
}

// Express middleware: accepts "Authorization: Bearer <token>" and puts the session's user in res.locals.user
export async function requireSession(req: Request, res: Response, next: NextFunction) {
  const token = req.get("Authorization")?.match(/^Bearer (\S+)$/)?.[1];
  if (!token) {
    res.status(401).json({status: "fail", message: "You need to log in"});
    return;
  }
  try {
    const session = await pool.query("select username from sessions where token_hash = $1 and expires_at > now()", [hashToken(token)]);
    if (session.rowCount !== 1) {
      res.status(401).json({status: "fail", message: "Your session has expired, please log in again"});
      return;
    }
    res.locals.user = session.rows[0].username;
    res.locals.token = token;
    next();
  } catch (error) {
    console.error(error);
    res.status(500).json({status: "fail", message: "Could not check your session"});
  }
}
