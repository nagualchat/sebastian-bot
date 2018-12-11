const path = require('path');
const express = require('express');
const Messages = require('../models/chatlog');

var app = express();
app.set('view engine', 'pug');
app.set('views', path.join(__dirname + '/../', 'views'));

app.get('/', async (req, res) => {
  var result = await Messages.find().sort({ 'msg.date' : 1 });

  if (result.length > 0) {
    res.render('chatlog', { log: result, count: result.length });
  } else {
    res.send('Нечего выводить (база сообщений пуста).');
  }
});

app.listen(8082, function() {});

module.exports = function(bot) {
  bot.on('message', async (msg) => {
    if (msg.chat.type == 'supergroup') {
      await Messages.create({ msg: msg });
    }
  });
};