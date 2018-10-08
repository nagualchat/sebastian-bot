const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const electionSchema = new mongoose.Schema({
  stage: String, 
  stageAt: Date,
  candidates: Array,
  pollMsgId: Number,
  pollData: [{ uid: Number, name: String, voters: Array }]
});

module.exports = mongoose.model("mod_elections", electionSchema);