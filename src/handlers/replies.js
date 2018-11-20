/*  Ответ бота на пожелания доброго утра и спокойной ночи  */

const moment = require('moment');
const config = require('../config');
const tools = require('../tools');

const goodDay = [
  'Доброе утро. Как спалось?',
  'Как спалось, что снилось?',
  'Утро — плохое время для мага.',
  'Ну ты и соня. Тебя даже вчерашний шторм не разбудил.'
];

const goodNight = [
  'Желаю хорошо посновидеть.',
  'Ясных снов!',
  'Не забудь посмотреть на руки во сне.'
];

// Время между пожеланиями доброго дня, в течении которого бот на них не реагирует
const responseTimeout = 60 * 2;

var lastGoodDay, lastGoodNight;

module.exports = function(bot) {

  bot.onText(/добр\S* утр\S*|утр\S* добро\S*|^(утра|утречка)(\.|\!)?$/i, (msg) => {
    if (!lastGoodDay) {
      bot.sendMessage(msg.chat.id, tools.random(goodDay));
      lastGoodDay = msg.date;
    } else if (moment().diff(moment.unix(lastGoodDay), 'minutes') >= responseTimeout) {
      bot.sendMessage(msg.chat.id, tools.random(goodDay));
      lastGoodDay = msg.date;
    }
  });

  bot.onText(/спокойной ночи|приятных снов\S*|доброноч\S*|^(ночки|ночки всем|снов|всем снов)(\.|\!)?$/i, (msg) => {
    if (!lastGoodNight) {
      bot.sendMessage(msg.chat.id, tools.random(goodNight));
      lastGoodNight = msg.date;
    } else if (moment().diff(moment.unix(lastGoodNight), 'minutes') >= responseTimeout) {
      bot.sendMessage(msg.chat.id, tools.random(goodNight));
      lastGoodNight = msg.date;
    }
  });

};