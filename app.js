const express = require("express");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const bcrypt = require("bcrypt");
const path = require("path");
const jwt = require("jsonwebtoken");
const app = express();
const jwtMiddleWare = express.json();
app.use(jwtMiddleWare);

const dbPath = path.join(__dirname, "twitterClone.db");
let db = null;
const initializeDbServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server Running at http://localhost:3000");
    });
  } catch (e) {
    console.log(`DB Error : '${e.message}'`);
    process.exit(1);
  }
};
initializeDbServer();

const validPassword = (password) => {
  return password.length > 6;
};

const convertTweetToJson = (dbObject) => {
  return {
    username: dbObject.username,
    tweet: dbObject.tweet,
    dateTime: dbObject.date_time,
  };
};

const tweetStatus = (dbObject) => {
  return {
    tweet: dbObject.tweet,
    likes: dbObject.likes,
    replies: dbObject.replies,
    dateTime: dbObject.date_time,
  };
};

//authenticationAccessToken
const authenticationAccessToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "my_secret_key", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
};

//API 1
app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  const addUserQuery = `SELECT * FROM user WHERE username = '${username}';`;
  const addUser = await db.get(addUserQuery);
  if (addUser === undefined) {
    const createUserQuery = `
          INSERT INTO
          user(username,password,name,gender)
          VALUES('${username}', '${hashedPassword}', '${name}', '${gender}');`;
    if (validPassword(password)) {
      await db.run(createUserQuery);
      response.status(200);
      response.send("User created successfully");
    } else {
      response.status(400);
      response.send("Password is too short");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

//API 2
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const addUserQuery = `SELECT * FROM user WHERE username = '${username}';`;
  const addUser = await db.get(addUserQuery);
  if (addUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatch = await bcrypt.compare(password, addUser.password);
    if (isPasswordMatch === true) {
      const payload = { username: username };
      const jwtToken = jwt.sign(payload, "my_secret_key");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});
/*
const getUserId = async (username) => {
  const getUserIdQuery = `SELECT user_id FROM user WHERE username = '${username}';`;
  const userId = await db.get(getUserIdQuery);
  return userId.user_id;
};
*/
const getUserId = async (username) => {
  const userIdQuery = `SELECT user_id FROM user WHERE username = '${username}'`;
  const userId = await db.get(userIdQuery);
  return userId.user_id;
};

//API 3
app.get(
  "/user/tweets/feed/",
  authenticationAccessToken,
  async (request, response) => {
    const { username } = request;
    const userId = await getUserId(username);
    const tweetUserQuery = ` 
    SELECT 
      username, tweet, date_time
    from 
      (follower  
        INNER JOIN 
      tweet ON follower_user_id = tweet.user_id )AS T NATURAL JOIN user
      WHERE follower_user_id = ${userId}
    ORDER BY 
        date_time DESC 
    LIMIT 4 ;`;
    const tweetUser = await db.all(tweetUserQuery);
    response.send(tweetUser.map((tweets) => convertTweetToJson(tweets)));
  }
);
//API 4
app.get(
  "/user/following/",
  authenticationAccessToken,
  async (request, response) => {
    const { username } = request;
    const userId = await getUserId(username);
    const followingUserQuery = `
    SELECT name FROM user INNER JOIN follower ON user.user_id = follower.following_user_id WHERE follower.follower_user_id = ${userId};`;
    const followingUser = await db.all(followingUserQuery);
    response.send(followingUser);
  }
);

//API 5
app.get(
  "/user/followers/",
  authenticationAccessToken,
  async (request, response) => {
    const { username } = request;
    const userId = await getUserId(username);
    const followersUserQuery = `
    SELECT name FROM user INNER JOIN follower ON user_id = follower.follower_user_id WHERE follower.following_user_id = ${userId};`;
    const followersUser = await db.all(followersUserQuery);
    response.send(followersUser);
  }
);
//API 6
app.get(
  "/tweets/:tweetId/",
  authenticationAccessToken,
  async (request, response) => {
    const { username } = request;
    const userId = await getUserId(username);
    const { tweetId } = request.params;
    const tweetUserQuery = ` 
    SELECT 
      * 
    FROM 
      tweet  
        INNER JOIN 
      follower ON tweet.tweet_id = follower.following_user_id
      WHERE tweet_id = ${tweetId} AND follower.follower_user_id = ${userId};`;
    const tweetUser = await db.get(tweetUserQuery);
    if (tweetUser === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const likesCountQuery = `
    SELECT 
    COUNT(*) AS likes 
     FROM 
      tweet 
      INNER JOIN 
      like 
        ON tweet.tweet_id = like.tweet_id
        WHERE tweet.tweet_id =${tweetId} ;`;
      const likesCount = await db.all(likesCountQuery);
      console.log(likesCount);
      const repliesCountQuery = `
      SELECT 
      COUNT(*) AS replies
      FROM tweet INNER JOIN reply ON tweet.tweet_id = reply.tweet_id
      WHERE tweet.tweet_id = ${tweetId};`;
      const repliesCount = await db.all(repliesCountQuery);
      console.log(repliesCount);
      response.send({
        tweet: tweetUser["tweet"],
        likes: likesCount[0]["likes"],
        replies: repliesCount[0]["replies"],
        dateTime: tweetUser["date_time"],
      });
    }
  }
);

//API 7
app.get(
  "/tweets/:tweetId/likes/",
  authenticationAccessToken,
  async (request, response) => {
    const { username } = request;
    const userId = await getUserId(username);
    const { tweetId } = request.params;
    const tweetUserQuery = `
    SELECT 
     *
    FROM
    follower INNER JOIN  
    tweet ON follower.following_user_id= tweet.tweet_id 
    WHERE tweet.tweet_id =${tweetId};`;
    const tweetLike = await db.get(tweetUserQuery);
    if (tweetLike === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const likesQuery = `
        SELECT username FROM (tweet INNER JOIN like ON tweet.tweet_id = like.tweet_id) INNER JOIN user ON user.user_id = like.user_id
        WHERE tweet.tweet_id = ${tweetId};`;
      const likesCount = await db.all(likesQuery);
      const likes = likesCount.map((each) => each.username);
      response.send({ likes: likes });
    }
  }
);

//API 8
app.get(
  "/tweets/:tweetId/replies/",
  authenticationAccessToken,
  async (request, response) => {
    const { username } = request;
    const userId = await getUserId(username);
    const { tweetId } = request.params;
    const tweetUserQuery = `
    SELECT 
     *
    FROM
    follower INNER JOIN  
    tweet ON follower.following_user_id= tweet.tweet_id 
    WHERE tweet.tweet_id =${tweetId};`;
    const tweetLike = await db.get(tweetUserQuery);
    if (tweetLike === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const repliesQuery = `
        SELECT username FROM (tweet INNER JOIN reply ON tweet.tweet_id = reply.tweet_id) INNER JOIN user ON user.user_id = reply.user_id
        WHERE tweet.tweet_id = ${tweetId};`;
      const repliesCount = await db.all(repliesQuery);
      const replies = repliesCount.map((each) => each.username);
      response.send(replies);
    }
  }
);

// API 9
app.get(
  "/user/tweets/",
  authenticationAccessToken,
  async (request, response) => {
    const { username } = request;
    const userId = await getUserId(username);
    const tweetQuery = `
    SELECT
    tweet,COUNT(*) AS likes,
    (
        SELECT
          COUNT(*) AS replies
        FROM
          tweet INNER JOIN reply ON tweet.tweet_id = reply.tweet_id
        WHERE tweet.user_id = ${userId}
        GROUP BY
          tweet.tweet_id
    ) AS replies,tweet.date_time AS dateTime
  FROM
    tweet INNER JOIN like ON tweet.tweet_id = like.tweet_id
  WHERE tweet.user_id = ${userId}
  GROUP BY
    tweet.tweet_id;
  `;
    const tweetData = await db.all(tweetQuery);
    response.send(tweetData);
  }
);
//API 10
app.post(
  "/user/tweets/",
  authenticationAccessToken,
  async (request, response) => {
    const { username } = request;
    const userId = await getUserId(username);
    const { tweet } = request.body;
    const addTweetQuery = `
    INSERT INTO tweet(tweet, user_id) VALUES('${tweet}',${userId})`;
    await db.run(addTweetQuery);
    response.send("Created a Tweet");
  }
);

// API 11
app.delete(
  "/tweets/:tweetId/",
  authenticationAccessToken,
  async (request, response) => {
    const { username } = request;
    const userId = await getUserId(username);
    const { tweetId } = request.params;
    const tweetsUserQuery = `
    SELECT 
     *
    FROM
     tweet 
    WHERE tweet_id =${tweetId};`;
    const tweetsLike = await db.get(tweetsUserQuery);
    const { user_id } = tweetsLike;
    if (user_id !== userId) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const deleteTweetQuery = `
        DELETE FROM tweet WHERE tweet.tweet_id = ${tweetId};`;
      await db.run(deleteTweetQuery);
      response.send("Tweet Removed");
    }
  }
);

module.exports = app;
