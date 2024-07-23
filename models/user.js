import mongoose from "mongoose";

const UserSchema = new mongoose.Schema({
  googleId: {
    type: String,
    required: true,
    unique: true,
  },
  displayName: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    required: true,
  },
  accessToken: {
    type: String,
    required: true,
  },
  refreshToken: {
    type: String,
    required: true,
  },
  accessTokenExpiresAt: {
    type: Date,
    required: true,
  },
  refreshTokenExpiresAt: {
    type: Date,
    required: true,
  },
});

export default mongoose.model("User", UserSchema);
