import { pool } from "../server"

export async function getSolution(date: string): Promise<string> {
  let solution = (await pool.query(`select word from target_words where word_date = $1`, [date])).rows[0];
  if (solution) {
    return solution;
  } else {
    solution = (await pool.query(`delete from word_list where word = (select word from word_list order by id desc limit 1) returning word`)).rows[0];
    solution = (await pool.query(`insert into target_words values ($1, $2) returning word`, [date, solution.word])).rows[0];
    return solution;
  }
}


