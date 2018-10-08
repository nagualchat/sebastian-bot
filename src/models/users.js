const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  uid: Number,
  name: String,
  firstJoin: Number,
  lastJoin: Number,
  rejoins: Number,
  thanks: Number,
  isMod: Boolean,
  antispam: Number
});

module.exports = mongoose.model("users", userSchema);