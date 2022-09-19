import { client } from "../server";

export const invalidResult = async (guessDate: string, user: string, result: string) => {
  const hasGuessed = await client.query("select * from results where result_date = $1 and username = $2", [guessDate, user]);
  if (hasGuessed.rowCount > 0) {
    return true;
  }
  return false;
  // add more checks
} 

export const postResult = async (guessDate: string, user: string, result: string) => {
      const queryText = "insert into results (result_date, username, guess) values ($1, $2, $3) returning *";
      const values = [guessDate, user, result];
      const response = await client.query(queryText, values);
      return response;
}