import { client } from "../server"

export async function getSolution(date: string): Promise<string> {
  let solution = (await client.query(`select word from target_words where word_date = $1`, [date])).rows[0];
  if (solution) {
    return solution;
  } else {
    solution = (await client.query(`delete from word_list where word = (select word from word_list limit 1) returning word`)).rows[0];
    solution = (await client.query(`insert into target_words values ($1, $2) returning word`, [date, solution.word])).rows[0];
    return solution;
  }
}


