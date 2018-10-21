const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  uid: Number,
  name: String,
  firstJoin: Number,
  lastJoin: Number,
  rejoins: Number,
  activity: Number,
  thanks: Number,
  isMod: Boolean,
  antispam: Number
});

module.exports = mongoose.model("users", userSchema);