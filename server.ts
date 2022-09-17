import { Client } from "pg";
import { config } from "dotenv";
import express from "express";
import cors from "cors";
import {dailySolution, ISolution} from "./utils/dailySolution";

config(); //Read .env file lines as though they were env vars.

//Call this script with the environment variable LOCAL set if you want to connect to a local db (i.e. without SSL)
//Do not set the environment variable LOCAL if you want to connect to a heroku DB.

//For the ssl property of the DB connection config, use a value of...
// false - when connecting to a local DB
// { rejectUnauthorized: false } - when connecting to a heroku DB
const herokuSSLSetting = { rejectUnauthorized: false }
const sslSetting = process.env.LOCAL ? false : herokuSSLSetting
const dbConfig = process.env.LOCAL ? "wordle" : {
  connectionString: process.env.DATABASE_URL,
  ssl: sslSetting,
};

const app = express();

app.use(express.json()); //add body parser to each following route handler
app.use(cors()) //add CORS support to each following route handler

const client = new Client(dbConfig);
client.connect();

app.get<{guessDate: string}>("/solution/:guessDate", async (req, res) => {
  const guessDate = req.params.guessDate;
  const todaysSolution: ISolution = dailySolution(guessDate);
  res.json(todaysSolution);
});

app.get<{user: string, guessDate: string}>("/results/:user/:guessDate", async (req, res) => {
  const {user, guessDate} = req.params;
  const guessesToday = await client.query("select * from results where result_date = $1 and username = $2", [guessDate, user]);
  if (guessesToday.rowCount === 1) {
    res.json(guessesToday.rows);
  } else {
    res.status(404).json({status: "fail", message: "Could not find result"});
  }
})

app.post("/results/:user/:guessDate", async (req, res) => {
  const {user, guessDate} = req.params;
    const {password, result} = req.body;
    const userPassword = await client.query("select password from users where username = $1", [user]);
    const guessesToday = await client.query("select * from results where result_date = $1 and username = $2", [guessDate, user]);
    if (guessesToday.rowCount === 1) {
        res.status(400).json({status: "fail", message: "You have already played today"});
    } else if (result.length < 1) {
        res.status(400).json({status: "fail", message: "You need to enter a result"});
    } else if (password !== userPassword.rows[0].password) {
        res.status(400).json({status: "fail", message: "Wrong password"})
    } else {
        const queryText = "insert into results (result_date, username, guess) values ($1, $2, $3) returning *";
        const values = [guessDate, user, result];
        const response = await client.query(queryText, values);
        response.rowCount === 1? res.json({status: "success", message: "Your result has been recorded"}) : res.json({status: "fail"});
    }
})

//Start the server on the given port
const port = process.env.PORT;
if (!port) {
  throw 'Missing PORT environment variable.  Set it in .env file.';
}
app.listen(port, () => {
  console.log(`Server is up and running on port ${port}`);
});
