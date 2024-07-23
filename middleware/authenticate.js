import https from "https";
import querystring from "querystring";
import User from "../models/user.js";
import dotenv from "dotenv";

dotenv.config();

const authenticate = async (req, res, next) => {
  if (!req.user) {
    return res.status(401).send("Unauthorized");
  }

  // Check if the access token has expired
  if (new Date() > req.user.accessTokenExpiresAt) {
    try {
      // Refresh the access token
      const refreshTokenData = querystring.stringify({
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        refresh_token: req.user.refreshToken,
        grant_type: "refresh_token",
      });

      const refreshTokenOptions = {
        hostname: "oauth2.googleapis.com",
        path: "/token",
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Content-Length": refreshTokenData.length,
        },
      };

      const refreshTokenResponse = await new Promise((resolve, reject) => {
        const req = https.request(refreshTokenOptions, (res) => {
          let data = "";
          res.on("data", (chunk) => (data += chunk));
          res.on("end", () => resolve(data));
        });
        req.on("error", reject);
        req.write(refreshTokenData);
        req.end();
      });

      const newTokens = JSON.parse(refreshTokenResponse);
      req.user.accessToken = newTokens.access_token;
      req.user.accessTokenExpiresAt = new Date(
        Date.now() + newTokens.expires_in * 1000
      );

      // Save the updated user to the session and database
      req.session.user = await User.findOneAndUpdate(
        { googleId: req.user.googleId },
        {
          accessToken: newTokens.access_token,
          accessTokenExpiresAt: req.user.accessTokenExpiresAt,
        },
        { new: true }
      );
    } catch (error) {
      console.error("Error refreshing access token:", error);
      return res.status(500).send("Internal Server Error");
    }
  }

  next();
};

export default authenticate;
