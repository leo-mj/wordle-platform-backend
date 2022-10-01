import { client } from "../server";

export async function wrongUserOrPassword(user: string, password: string) {
  try {
    const checkUser = await client.query("select * from users where username = $1", [user]);
    const givenUsersPassword = checkUser.rows[0].password
    if (checkUser.rowCount !== 1 || password !== givenUsersPassword) {
      return true;
    }
    return false;
  } catch (error) {
    console.error(error);
    return true;
  }
}

export async function wrongGroupOrPasscode(group: string, passcode: string) {
  try {
    const checkGroup = await client.query("select * from group_names where groupname = $1", [group]);
    const givenGroupsPassword = checkGroup.rows[0].password
    if (checkGroup.rowCount !== 1 || passcode !== givenGroupsPassword) {
      return true;
    }
  return false;
  } catch (error) {
    console.error(error);
    return true;
  }
}