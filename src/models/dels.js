const mongoose = require("mongoose");

const delSchema = new mongoose.Schema({
  reportId: Number,
  forwardId: Number
});

module.exports = mongoose.model("deleted_messages", delSchema);