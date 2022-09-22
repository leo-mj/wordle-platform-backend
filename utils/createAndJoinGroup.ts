import { client } from "../server";
import { wrongGroupOrPasscode } from "./wrongNameOrPassword";

export async function createGroup(user: string, group: string, passcode: string): Promise<string> {
    const newGroup = await client.query("insert into group_names (groupname, password) values ($1, $2) returning *", [group, passcode]);
    const userJoined = await joinGroup(user, group, passcode);
    if (newGroup.rowCount !== 1) {
        return "group could not be created"
    } else if (userJoined !== `Successfully joined group ${group}`) {
        return "user could not join group"
    } 
    return `Successfully created group ${group}`;
}

export async function joinGroup(user: string, group: string, passcode: string): Promise<string> {
    const wrongInput = await wrongGroupOrPasscode(group, passcode);
    if (wrongInput) {
        return "Wrong group name or passcode"
    }
    const userJoined = await client.query("insert into group_members (groupname, username) values ($1, $2) returning *", [group, user]);
    if (userJoined.rowCount !== 1) {
        return "user could not join group"
    }
    return `Successfully joined group ${group}`;
}