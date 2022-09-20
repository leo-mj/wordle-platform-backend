import { client } from "../server";

export const invalidResult = async (guessDate: string, user: string, guesses: number, solvedStatus: string, emojis: string) => {
  const hasGuessed = await client.query("select * from results where result_date = $1 and username = $2", [guessDate, user]);
  if (hasGuessed.rowCount > 0) {
    return true;
  } else if (guesses < 1 || solvedStatus !== ("solved"|| "failed") || emojis.length < 5) {
    return true;
  }
  return false;
  // add more checks
} 

export const postResult = async (guessDate: string, user: string, guesses: number, solvedStatus: string, emojis: string ) => {
      const queryText = "insert into results (result_date, username, guesses, solved_status, emojis) values ($1, $2, $3, $4, $5) returning *";
      const values = [guessDate, user, guesses, solvedStatus, emojis];
      const response = await client.query(queryText, values);
      return response;
}