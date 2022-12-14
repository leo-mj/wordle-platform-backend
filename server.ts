import { Client } from "pg";
import { config } from "dotenv";
import express from "express";
import cors from "cors";
import { invalidResult, postResult } from "./utils/postResult";
import {wrongUserOrPassword } from "./utils/wrongNameOrPassword";
import { userAlreadyExists, groupAlreadyExists } from "./utils/nameAlreadyExists";
import { createGroup, joinGroup } from "./utils/createAndJoinGroup";
import { getGroupResults, Group } from "./utils/getGroupResults"
import { getMonth } from "./utils/getMonth";
import { getSolution } from "./utils/getSolution";

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
  try {
    const todaysSolution: string = await getSolution(guessDate);
    res.status(200).json(todaysSolution);
  } catch (error) {
    console.error(error);
    res.status(400).json({status: "fail", message: error})
  }
});

// registration and login
app.post<{}, {}, {user: string, password: string}>("/register", async (req, res) => {
  const {user, password} = req.body;
  const invalidInput = (typeof user !== "string" || typeof password !== "string" || user.length < 1 || password.length < 1)
  if (invalidInput) {
    res.status(400).json({status: "fail", message: "You need to enter a valid username and password"});
  } else if (await userAlreadyExists(user)) {
      res.status(404).json({status: "fail", message: "Username already exists"});
  } else {
    try {
      const newUser = await client.query("insert into users (username, password) values ($1, $2) returning *", [user, password]);
      (newUser.rowCount === 1)? (
        res.status(200).json({status: "success", message: "You have successfully registered"}))
      : (
        res.status(400).json({status: "fail", message: "Oops, something has gone wrong!"})
      )
    } catch(error) {
      console.error(error);
      res.status(400).json({status: "fail", message: error});
    }
  }
})

app.get<{user: string, password: string}>("/login/:user/:password", async (req, res) => {
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

// deleting an account
app.delete<{user: string, password: string}>("/delete/:user/:password", async (req, res) => {
  const {user, password} = req.params;
  const invalidInput = (typeof user !== "string" || typeof password !== "string" || user.length < 1 || password.length < 1)
  if (invalidInput) {
    res.status(400).json({status: "fail", message: "You need to enter a valid username and password"});
  } else if (await wrongUserOrPassword(user, password)) {
    res.status(404).json({status: "fail", message: "Wrong password or username"})
  } else {
    try {
      await client.query(`delete from users where username = $1`, [user]);
      res.status(200).json({status: "success", message: `Deleted ${user}`});
    } catch (error) {
      console.error(error);
      res.status(404).json({status: "fail", message: error});
    }
  }
})

// getting one user's current result
app.get<{user: string, guessDate: string}>("/results/:user/:guessDate", async (req, res) => {
  const {user, guessDate} = req.params;
  try {
    const guessesToday = await client.query("select * from results where result_date = $1 and username = $2", [guessDate, user]);
    if (guessesToday.rowCount === 1) {
      res.status(200).json(guessesToday.rows);
    } else {
      res.status(404).json({status: "fail", message: "Could not find result"});
    }
  } catch (error) {
    console.error(error);
    res.status(404).json({status: "fail", message: error});
  }
})

// posting one user's current result
app.post<{user: string, guessDate: string}, {}, {password: string, guesses: number, solvedStatus: string, emojis: string}>("/results/:user/:guessDate", async (req, res) => {
    const {user, guessDate} = req.params;
    const {password, guesses, solvedStatus, emojis} = req.body;
    if (await wrongUserOrPassword(user, password)) {
      res.status(404).json({status: "fail", message: "Wrong password or username"})
    } else if (await invalidResult(guessDate, user, guesses, solvedStatus, emojis)) {
      res.status(400).json({status: "fail", message: "You have already played today"});
    } else {
      try {
        const dbResponse = await postResult(guessDate, user, guesses, solvedStatus, emojis);
        dbResponse.rowCount === 1? res.status(200).json({status: "success", message: "Your result has been recorded"}) : res.json({status: "fail"});
      } catch (error) {
        console.error(error);
        res.status(400).json({status: "fail", message: error});
      }
    }
})

// getting one user's result stats
app.get<{user: string, password: string}>("/users/stats/:user/:password", async(req, res) => {
  const {user, password} = req.params;
  if (await wrongUserOrPassword(user, password)) {
    res.status(404).json({status: "fail", message: "Wrong password or username"})
  } else {
    try {
      const month = getMonth();
      const statsQuery = `select allgames.username, round(avg(allgames.guesses), 2) as avg_guesses, 
        count(allgames.*) as total_games, 
        count(solved.*) as games_solved,
        round((cast(count(solved.*) as decimal)/cast(count(allgames.*) as decimal))*100, 0) as solved_percentage, 
        coalesce((count(solved.*)*7 - sum(solved.guesses)), 0) as points
        from results allgames
        left join (select * from results solved where solved.solved_status = 'solved') as solved
        on allgames.username = solved.username and allgames.result_date = solved.result_date
        join users
        on allgames.username = users.username
        where users.username = $1 
        group by allgames.username`;
      const stats = await client.query(statsQuery, [user]);

      const historyQuery = `select * from results where username = $1 and result_date like $2 order by result_date desc limit 5`;
      const history = await client.query(historyQuery, [user, `%-${month}`]);

      res.status(200).json({stats: stats.rows, history: history.rows});
    } catch (error) {
      console.error(error);
      res.status(400).json({status: "fail", message: error});
    }
  }
})

// creating a group
app.post<{user: string}, {}, {userPassword: string, group: string, groupPasscode: string}>("/groups/create/:user", async (req, res) => {
  const {user} = req.params;
  const {userPassword, group, groupPasscode} = req.body;
  const invalidInput = (typeof group !== "string" || typeof groupPasscode !== "string" || group.length < 1 || groupPasscode.length < 1)
  if (invalidInput) {
    res.status(400).json({status: "fail", message: "You need to enter a valid group name and passcode"});
  } else if (await wrongUserOrPassword(user, userPassword)) {
    res.status(404).json({status: "fail", message: "You need to log into a valid account"});
  } else if (await groupAlreadyExists(group)) {
      res.status(404).json({status: "fail", message: "Group name already exists"});
  } else {
    try {
      const newGroupStatus = await createGroup(user, group, groupPasscode);
      (newGroupStatus === `Successfully created group ${group}`)? (
        res.status(200).json({status: "success", message: newGroupStatus}))
      : (
        res.status(400).json({status: "fail", message: "Oops, something has gone wrong!"})
      )
    } catch (error) {
      console.error(error);
      res.status(400).json({status: "fail", message: error})
    }
  }
})

// joining a group
app.post<{group: string}, {}, {user: string, userPassword: string, groupPasscode: string}>("/groups/join/:group", async (req, res) => {
  const {group} = req.params;
  const {user, userPassword, groupPasscode} = req.body;
  const invalidInput = (typeof group !== "string" || typeof groupPasscode !== "string" || group.length < 1 || groupPasscode.length < 1)
  if (invalidInput) {
    res.status(400).json({status: "fail", message: "You need to enter a valid group name and passcode"});
  } else if (await wrongUserOrPassword(user, userPassword)) {
    res.status(404).json({status: "fail", message: "You need to log into a valid account"});
  } else if (!(await groupAlreadyExists(group))) {
      res.status(404).json({status: "fail", message: `Group ${group} does not exist`});
  } else {
    try {
      const joinedGroupStatus = await joinGroup(user, group, groupPasscode);
      if (joinedGroupStatus === `Successfully joined group ${group}`) {
        res.status(200).json({status: "success", message: joinedGroupStatus})
      } else if (joinedGroupStatus === "Wrong passcode") {
        res.status(400).json({status: "fail", message: "Wrong passcode"})
      } else {
        res.status(400).json({status: "fail", message: "Oops, something has gone wrong!"})
      }
    } catch (error) {
      console.error(error);
      res.status(400).json({status: "fail", message: error})
    }
  }
})

// leaving a group
app.delete<{group: string, user: string, userPassword: string}>("/groups/exit/:group/:user/:userPassword", async (req, res) => {
  const {group, user, userPassword} = req.params;
  const invalidInput = (typeof group !== "string" || group.length < 1)
  if (invalidInput) {
    res.status(400).json({status: "fail", message: "You need to enter a valid group name and passcode"});
  } else if (await wrongUserOrPassword(user, userPassword)) {
    res.status(404).json({status: "fail", message: "You need to log into a valid account"});
  } else {
    try {
      const dbResponse = await client.query(`delete from group_members where groupname = $1 and username = $2 returning *`, [group, user]);
      res.status(200).json({status: "success", message: dbResponse})
    } catch (error) {
      console.error(error);
      res.status(400).json({status: "fail", message: error});
    }
  }
})

// getting all results from members of all groups
app.get<{user: string, date: string}>("/groups/results/:user/:date", async (req, res) => {
  const {user, date} = req.params;
  try {
    const dbResponse: Group[] = await getGroupResults(user, date);
    res.status(200).json(dbResponse);
  } catch (error) {
    console.error(error);
    res.status(400).json({status: "fail", message: error});
  }
})

// getting all stats from members of one groups
app.get<{group: string, user: string, password: string}>("/groups/:group/stats/:user/:password", async (req, res) => {
  const {group, user, password} = req.params;
  if (await wrongUserOrPassword(user, password)) {
    res.status(404).json({status: "fail", message: "You need to log into a valid account"});
    return;
  }
  try {
    const month = getMonth();
    const statsQuery = `select allgames.username, round(avg(allgames.guesses), 2) as avg_guesses, 
      count(allgames.*) as total_games, count(solved.*) as games_solved,
      round((cast(count(solved.*) as decimal)/cast(count(allgames.*) as decimal))*100, 0) as solved_percentage, 
      coalesce((count(solved.*)*7 - sum(solved.guesses)),0) as points
      from results allgames
      left join (select * from results solved where solved.solved_status = 'solved') as solved
      on allgames.username = solved.username and allgames.result_date = solved.result_date
      join group_members
      on allgames.username = group_members.username
      where group_members.groupname = $1 and allgames.result_date like $2
      group by allgames.username order by points desc`;
    const groupStats = await client.query(statsQuery, [group, `%-${month}`]);
    res.status(200).json(groupStats.rows);
  } catch (error) {
    console.error(error);
    res.status(400).json({status: "fail", message: error});
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
