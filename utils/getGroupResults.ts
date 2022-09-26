import { QueryResult } from "pg";
import {client} from "../server";

export interface GroupEntry {
    username: string;
    guesses: number;
    solved_status: string;
    emojis: string
}

export interface Group {
    groupName: string;
    groupEntries: GroupEntry[]
}

export async function getGroupResults(user: string, date: string): Promise<Group[]> {
    try {
        const allGroupNamesAsObjArr = await client.query("select groupname from group_members where username = $1", [user]);
        const allGroupNames: string[] = allGroupNamesAsObjArr.rows.map((obj) => obj.groupname);
        const allGroupResults: Group[] = await Promise.all(allGroupNames.map(async (group) => {return await getResults(group, date)}));
        return allGroupResults;
    } catch (error) {
        console.error(error);
        return;
    }
}

async function getResults(groupName: string, date: string): Promise<Group> {
    try {
        const groupEntriesAsObjArr = await client.query(`select username, guesses, solved_status, emojis from results 
        where result_date = $1 and username in 
        (select username from group_members where groupname = $2)`, 
        [date, groupName]);
        const groupEntries: GroupEntry[] = groupEntriesAsObjArr.rows
        const groupObj = {groupName: groupName, groupEntries: groupEntries}
        return groupObj;
    } catch (error) {
        console.error(error)
        return;
    }
}

