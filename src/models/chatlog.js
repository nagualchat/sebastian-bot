const mongoose = require("mongoose");

const logSchema = new mongoose.Schema({
  createdAt: { type: Date, expires: 86400, default: Date.now }, 
  msg: mongoose.Schema.Types.Mixed
});

module.exports = mongoose.model("log_messages", logSchema);