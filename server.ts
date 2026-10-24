import { Pool } from "pg";
import { config } from "dotenv";
import express from "express";
import cors from "cors";
import { invalidResult, postResult } from "./utils/postResult";
import { hashSecret, wrongUserOrPassword } from "./utils/wrongNameOrPassword";
import { createSession, deleteSession, requireSession } from "./utils/sessions";
import { userAlreadyExists, groupAlreadyExists } from "./utils/nameAlreadyExists";
import { createGroup, joinGroup } from "./utils/createAndJoinGroup";
import { getGroupResults, Group } from "./utils/getGroupResults"
import { getMonth } from "./utils/getMonth";
import { getSolution } from "./utils/getSolution";
import { supabaseRootCA } from "./utils/supabaseRootCA";

config(); //Read .env file lines as though they were env vars.

//Call this script with the environment variable LOCAL set if you want to connect to a local db (i.e. without SSL)
//Do not set the environment variable LOCAL if you want to connect to the Supabase DB.

//For the Supabase DB, verify the server certificate against Supabase's root CA (equivalent to sslmode=verify-full).
//pg lets an sslmode in the connection string override this ssl object, so refuse to start if one is set.
if (!process.env.LOCAL && /[?&]sslmode=/.test(process.env.DATABASE_URL ?? "")) {
  throw 'Remove sslmode from DATABASE_URL; TLS verification is configured in server.ts.';
}
const sslSetting = { rejectUnauthorized: true, ca: supabaseRootCA }
const dbConfig = process.env.LOCAL ? { database: "wordle" } : {
  connectionString: process.env.DATABASE_URL,
  ssl: sslSetting,
};

const app = express();

app.use(express.json()); //add body parser to each following route handler
app.use(cors()) //add CORS support to each following route handler

//A pool replaces connections that the DB or network drops, instead of reusing one connection for the process lifetime.
//Supabase's free plan allows 60 direct connections / 200 pooler clients, so 5 leaves plenty of headroom.
export const pool = new Pool({ ...dbConfig, max: 5 });
pool.on("error", (error) => {
  //an idle connection was closed by the DB or network; the pool discards it and opens a new one when needed
  console.error("Idle database connection error:", error);
});
pool.query("select 1").catch((error) => {
  console.error("Could not connect to the database:", error);
  process.exit(1);
});

app.get("/", (req, res) => {
  res.json({message: "Welcome to wordle clone muliplayer backend server"})
})

// called by the frontend on page load, so the server and its DB connection are awake before the user logs in
app.get("/health", async (req, res) => {
  try {
    await pool.query("select 1");
    res.status(200).json({status: "ok"});
  } catch (error) {
    console.error(error);
    res.status(503).json({status: "fail", message: "Database unavailable"});
  }
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
// both return a session token; send it as "Authorization: Bearer <token>" to the routes below that use requireSession
app.post<{}, {}, {user: string, password: string}>("/register", async (req, res) => {
  const {user, password} = req.body;
  const invalidInput = (typeof user !== "string" || typeof password !== "string" || user.length < 1 || password.length < 1)
  if (invalidInput) {
    res.status(400).json({status: "fail", message: "You need to enter a valid username and password"});
  } else if (await userAlreadyExists(user)) {
      res.status(404).json({status: "fail", message: "Username already exists"});
  } else {
    try {
      const newUser = await pool.query("insert into users (username, password) values ($1, $2) returning username", [user, await hashSecret(password)]);
      (newUser.rowCount === 1)? (
        res.status(200).json({status: "success", message: "You have successfully registered", token: await createSession(user)}))
      : (
        res.status(400).json({status: "fail", message: "Oops, something has gone wrong!"})
      )
    } catch(error) {
      console.error(error);
      res.status(400).json({status: "fail", message: error});
    }
  }
})

app.post<{}, {}, {user: string, password: string}>("/login", async (req, res) => {
  const {user, password} = req.body;
  const invalidInput = (typeof user !== "string" || typeof password !== "string" || user.length < 1 || password.length < 1)
  if (invalidInput) {
    res.status(400).json({status: "fail", message: "You need to enter a valid username and password"});
  } else if (await wrongUserOrPassword(user, password)) {
    res.status(401).json({status: "fail", message: "Wrong password or username"})
  } else {
    try {
      res.status(200).json({status: "success", message: "Successful login", token: await createSession(user)})
    } catch (error) {
      console.error(error);
      res.status(500).json({status: "fail", message: "Could not log in"});
    }
  }
})

app.post("/logout", requireSession, async (req, res) => {
  try {
    await deleteSession(res.locals.token);
    res.status(200).json({status: "success", message: "Logged out"});
  } catch (error) {
    console.error(error);
    res.status(500).json({status: "fail", message: "Could not log out"});
  }
})

// deleting an account (its sessions are deleted with it by the foreign key cascade)
app.delete("/account", requireSession, async (req, res) => {
  const user: string = res.locals.user;
  try {
    await pool.query(`delete from users where username = $1`, [user]);
    res.status(200).json({status: "success", message: `Deleted ${user}`});
  } catch (error) {
    console.error(error);
    res.status(404).json({status: "fail", message: error});
  }
})

// getting one user's current result
app.get<{guessDate: string}>("/results/:guessDate", requireSession, async (req, res) => {
  const {guessDate} = req.params;
  const user: string = res.locals.user;
  try {
    const guessesToday = await pool.query("select * from results where result_date = $1 and username = $2", [guessDate, user]);
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
app.post<{guessDate: string}, {}, {guesses: number, solvedStatus: string, emojis: string}>("/results/:guessDate", requireSession, async (req, res) => {
    const {guessDate} = req.params;
    const user: string = res.locals.user;
    const {guesses, solvedStatus, emojis} = req.body;
    if (await invalidResult(guessDate, user, guesses, solvedStatus, emojis)) {
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
app.get("/users/stats", requireSession, async(req, res) => {
  const user: string = res.locals.user;
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
    const stats = await pool.query(statsQuery, [user]);

    const historyQuery = `select * from results where username = $1 and result_date like $2 order by result_date desc limit 5`;
    const history = await pool.query(historyQuery, [user, `%-${month}`]);

    res.status(200).json({stats: stats.rows, history: history.rows});
  } catch (error) {
    console.error(error);
    res.status(400).json({status: "fail", message: error});
  }
})

// creating a group
app.post<{}, {}, {group: string, groupPasscode: string}>("/groups/create", requireSession, async (req, res) => {
  const user: string = res.locals.user;
  const {group, groupPasscode} = req.body;
  const invalidInput = (typeof group !== "string" || typeof groupPasscode !== "string" || group.length < 1 || groupPasscode.length < 1)
  if (invalidInput) {
    res.status(400).json({status: "fail", message: "You need to enter a valid group name and passcode"});
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
app.post<{group: string}, {}, {groupPasscode: string}>("/groups/join/:group", requireSession, async (req, res) => {
  const {group} = req.params;
  const user: string = res.locals.user;
  const {groupPasscode} = req.body;
  const invalidInput = (typeof group !== "string" || typeof groupPasscode !== "string" || group.length < 1 || groupPasscode.length < 1)
  if (invalidInput) {
    res.status(400).json({status: "fail", message: "You need to enter a valid group name and passcode"});
  } else if (!(await groupAlreadyExists(group))) {
      res.status(404).json({status: "fail", message: `Group ${group} does not exist`});
  } else {
    try {
      const joinedGroupStatus = await joinGroup(user, group, groupPasscode);
      if (joinedGroupStatus === `Successfully joined group ${group}`) {
        res.status(200).json({status: "success", message: joinedGroupStatus})
      } else if (joinedGroupStatus === "Wrong group name or passcode") {
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
app.delete<{group: string}>("/groups/exit/:group", requireSession, async (req, res) => {
  const {group} = req.params;
  const user: string = res.locals.user;
  const invalidInput = (typeof group !== "string" || group.length < 1)
  if (invalidInput) {
    res.status(400).json({status: "fail", message: "You need to enter a valid group name and passcode"});
  } else {
    try {
      const dbResponse = await pool.query(`delete from group_members where groupname = $1 and username = $2 returning *`, [group, user]);
      res.status(200).json({status: "success", message: dbResponse})
    } catch (error) {
      console.error(error);
      res.status(400).json({status: "fail", message: error});
    }
  }
})

// getting all results from members of all groups
app.get<{date: string}>("/groups/results/:date", requireSession, async (req, res) => {
  const {date} = req.params;
  const user: string = res.locals.user;
  try {
    const dbResponse: Group[] = await getGroupResults(user, date);
    res.status(200).json(dbResponse);
  } catch (error) {
    console.error(error);
    res.status(400).json({status: "fail", message: error});
  }
})

// getting all stats from members of one groups
app.get<{group: string}>("/groups/:group/stats", requireSession, async (req, res) => {
  const {group} = req.params;
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
    const groupStats = await pool.query(statsQuery, [group, `%-${month}`]);
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
