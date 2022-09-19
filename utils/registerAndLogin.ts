import { client } from "../server";

export const userDoesntExist = async (user: string) => {
    const usersWithSameName = await client.query("select * from users where username=$1", [user]);
    if (usersWithSameName.rowCount === 1) {
        return true;
    }
    return false;
}

export const wrongUserOrPassword = async (user: string, password: string) => {
    const checkUser = await client.query("select * from users where username = $1", [user]);
    const givenUsersPassword = await client.query("select password from users where username = $1", [user]);
    if (checkUser.rowCount !== 1 || password !== givenUsersPassword.rows[0].password) {
      return true;
    }
    return false;
}