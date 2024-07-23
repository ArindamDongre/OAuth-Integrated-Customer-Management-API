import express from "express";
import mongoose from "mongoose";
import session from "express-session";
import https from "https";
import querystring from "querystring";
import dotenv from "dotenv";
import User from "./models/user.js";
import authenticate from "./middleware/authenticate.js";

dotenv.config();

const app = express();

// MongoDB Connection
mongoose
  .connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.error(err));

// Session Configuration
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
  })
);

// Middleware to set user
app.use((req, res, next) => {
  req.user = req.session.user || null;
  next();
});

// Route to start OAuth flow
app.get("/auth/google", (req, res) => {
  const redirectUri = "https://accounts.google.com/o/oauth2/v2/auth";
  const queryParams = querystring.stringify({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: process.env.GOOGLE_REDIRECT_URI,
    response_type: "code",
    scope: "profile email",
    access_type: "offline",
  });
  const url = `${redirectUri}?${queryParams}`;
  res.redirect(url);
});

// Route to handle OAuth callback
app.get("/auth/google/callback", async (req, res) => {
  const code = req.query.code;
  const tokenData = querystring.stringify({
    code,
    client_id: process.env.GOOGLE_CLIENT_ID,
    client_secret: process.env.GOOGLE_CLIENT_SECRET,
    redirect_uri: process.env.GOOGLE_REDIRECT_URI,
    grant_type: "authorization_code",
  });

  const tokenOptions = {
    hostname: "oauth2.googleapis.com",
    path: "/token",
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Content-Length": tokenData.length,
    },
  };

  try {
    const tokenResponse = await new Promise((resolve, reject) => {
      const req = https.request(tokenOptions, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => resolve(data));
      });
      req.on("error", reject);
      req.write(tokenData);
      req.end();
    });

    const tokens = JSON.parse(tokenResponse);
    const { access_token, refresh_token, expires_in, id_token } = tokens;

    const idTokenOptions = {
      hostname: "oauth2.googleapis.com",
      path: `/tokeninfo?id_token=${id_token}`,
      method: "GET",
    };

    const idTokenResponse = await new Promise((resolve, reject) => {
      https
        .get(idTokenOptions, (res) => {
          let data = "";
          res.on("data", (chunk) => (data += chunk));
          res.on("end", () => resolve(data));
        })
        .on("error", reject);
    });

    const payload = JSON.parse(idTokenResponse);

    const accessTokenExpiresAt = new Date(Date.now() + expires_in * 1000);
    const refreshTokenExpiresAt = new Date(
      Date.now() + 365 * 24 * 60 * 60 * 1000
    );

    const newUser = {
      googleId: payload.sub,
      displayName: payload.name,
      email: payload.email,
      accessToken: access_token,
      refreshToken: refresh_token,
      accessTokenExpiresAt,
      refreshTokenExpiresAt,
    };

    let user = await User.findOneAndUpdate({ googleId: payload.sub }, newUser, {
      new: true,
      upsert: true,
    });

    req.session.user = user;
    res.redirect("/profile");
  } catch (error) {
    console.error(error);
    res.status(500).send("Internal Server Error");
  }
});

// Profile route
app.get("/profile", (req, res) => {
  if (!req.user) {
    return res.redirect("/");
  }
  res.send(`Hello, ${req.user.displayName}`);
});

// Logout route
app.get("/logout", (req, res) => {
  req.session.destroy();
  res.redirect("/");
});

// Home route
app.get("/", (req, res) => {
  res.send('<a href="/auth/google">Login with Google</a>');
});

// Authenticated API route
app.get("/api/data", authenticate, (req, res) => {
  if (!req.user) {
    return res.status(401).send("Unauthorized");
  }

  const options = {
    hostname: "www.googleapis.com",
    path: "/some/google/api/endpoint",
    method: "GET",
    headers: {
      Authorization: `Bearer ${req.user.accessToken}`,
    },
  };

  https
    .get(options, (apiRes) => {
      let data = "";
      apiRes.on("data", (chunk) => (data += chunk));
      apiRes.on("end", () => res.send(JSON.parse(data)));
    })
    .on("error", (e) => {
      console.error(e);
      res.status(500).send("Internal Server Error");
    });
});

// Authenticated POST API routes

app.post("/db-save", authenticate, async (req, res) => {
  const { customer_name, dob, monthly_income } = req.body;

  if (!customer_name || !dob || !monthly_income) {
    return res.status(400).json({ message: "All parameters are required" });
  }

  const age = calculateAge(dob);
  if (age <= 15) {
    return res.status(400).json({ message: "Age must be above 15" });
  }

  const rateLimitCheck = checkRateLimit(customer_name);
  if (rateLimitCheck.exceeded) {
    return res.status(429).json({ message: rateLimitCheck.message });
  }

  try {
    const newCustomer = new Customer({ customer_name, dob, monthly_income });
    await newCustomer.save();
    res.status(201).json(newCustomer);
  } catch (error) {
    res.status(500).json({ message: "Error saving data" });
  }
});

app.post("/time-based-api", authenticate, async (req, res) => {
  const { customer_name, dob, monthly_income } = req.body;
  const now = moment();

  if (!customer_name || !dob || !monthly_income) {
    return res.status(400).json({ message: "All parameters are required" });
  }

  if (now.day() === 1) {
    return res
      .status(403)
      .json({ message: "Please don't use this API on Monday" });
  }

  if (now.hour() >= 8 && now.hour() < 15) {
    return res.status(403).json({ message: "Please try after 3pm" });
  }

  try {
    const newCustomer = new Customer({ customer_name, dob, monthly_income });
    await newCustomer.save();
    res.status(201).json(newCustomer);
  } catch (error) {
    res.status(500).json({ message: "Error saving data" });
  }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
