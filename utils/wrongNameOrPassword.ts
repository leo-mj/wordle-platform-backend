import bcrypt from "bcryptjs";
import { pool } from "../server";

const BCRYPT_ROUNDS = 10;
// compared against when the name doesn't exist, so a wrong name takes as long to reject as a wrong password
const DUMMY_HASH = bcrypt.hashSync("no such user", BCRYPT_ROUNDS);

export function hashSecret(secret: string): Promise<string> {
  return bcrypt.hash(secret, BCRYPT_ROUNDS);
}

async function wrongNameOrSecret(table: "users" | "group_names", nameColumn: "username" | "groupname", name: string, secret: string) {
  try {
    const checkName = await pool.query(`select password from ${table} where ${nameColumn} = $1`, [name]);
    const storedHash: string = checkName.rowCount === 1 ? checkName.rows[0].password : DUMMY_HASH;
    const matches = await bcrypt.compare(secret, storedHash);
    return checkName.rowCount !== 1 || !matches;
  } catch (error) {
    console.error(error);
    return true;
  }
}

export function wrongUserOrPassword(user: string, password: string) {
  return wrongNameOrSecret("users", "username", user, password);
}

export function wrongGroupOrPasscode(group: string, passcode: string) {
  return wrongNameOrSecret("group_names", "groupname", group, passcode);
}
