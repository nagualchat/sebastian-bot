const mongoose = require("mongoose");

const favSchema = new mongoose.Schema({
  messageId: Number,
  messageDate: Number,
  favCreatorId: Number,
  favCaption: String
});

module.exports = mongoose.model("favorite_messages", favSchema);