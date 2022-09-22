import { client } from "../server";

export async function userAlreadyExists(user: string): Promise<boolean> {
    try {
        const rowWithSameName = await client.query("select * from users where username=$1", [user]);
    if (rowWithSameName.rowCount === 1) {
        return true;
    }
    return false;
    } catch (error) {
        console.error(error);
    }
}

export async function groupAlreadyExists(group: string): Promise<boolean> {
    try {
        const rowWithSameName = await client.query("select * from group_names where groupname=$1", [group]);
        if (rowWithSameName.rowCount === 1) {
            return true;
        }
        return false;  
    } catch (error) {
        console.error(error);
    }
}