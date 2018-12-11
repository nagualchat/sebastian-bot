const Users = require('../models/users');
const tools = require('../tools');

module.exports = function(bot) {

  bot.on('message', async (msg) => {
    if (msg.chat.type == 'supergroup') {
      await Users.updateOne({ uid: msg.from.id }, { $set: { name: tools.name2show(msg.from), activity: msg.date } });
    };
  });

};