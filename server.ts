import { Client } from "pg";
import { config } from "dotenv";
import express from "express";
import cors from "cors";
import {dailySolution, ISolution} from "./utils/dailySolution";
import { invalidResult, postResult } from "./utils/postResult";
import { userDoesntExist, wrongUserOrPassword } from "./utils/registerAndLogin";

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

export const client = new Client(dbConfig);
client.connect();

app.get("/", (req, res) => {
  res.json({message: "Welcome to wordle clone muliplayer backend server"})
})

app.get<{guessDate: string}>("/solution/:guessDate", async (req, res) => {
  const guessDate = req.params.guessDate;
  const todaysSolution: ISolution = dailySolution(guessDate);
  res.json(todaysSolution);
});

// registration and login
app.post("/register", async (req, res) => {
  const {user, password} = req.body;
  const invalidInput = (typeof user !== "string" || typeof password !== "string" || user.length < 1 || password.length < 1)
  if (invalidInput) {
    res.status(400).json({status: "fail", message: "You need to enter a valid username and password"});
  } else if (await userDoesntExist(user)) {
      res.status(404).json({status: "fail", message: "Username already exists"});
  } else {
    const newUser = await client.query("insert into users (username, password) values ($1, $2) returning *", [user, password]);
    (newUser.rowCount === 1)? (
      res.status(200).json({status: "success", message: "You have successfully registered"}))
    : (
      res.status(400).json({status: "fail", message: "Oops, something has gone wrong!"})
    )
  }
})

app.get("/login/:user/:password", async (req, res) => {
  const {user, password} = req.params;
  const invalidInput = (typeof user !== "string" || typeof password !== "string" || user.length < 1 || password.length < 1)
  if (invalidInput) {
    res.status(400).json({status: "fail", message: "You need to enter a valid username and password"});
  } else if (await wrongUserOrPassword(user, password)) {
    res.status(404).json({status: "fail", message: "Wrong password or username"})
  } else {
    res.status(200).json({status: "success", message: "Successful login"})
  }
})


// getting and posting one user's results
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
    if (await wrongUserOrPassword(user, password)) {
      res.status(404).json({status: "fail", message: "Wrong password or username"})
    } else if (await invalidResult(guessDate, user, result)) {
      res.status(400).json({status: "fail", message: "You have already played today"});
    } else {
      const response = await postResult(guessDate, user, result);
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
