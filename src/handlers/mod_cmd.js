const config = require('../config');
const tools = require('../tools');
const Users = require('../models/users');

const modCommand = 'Все команды (кроме последней) необходимо отправлять в ответ на чьё-либо сообщение — таким образом задаётся цель.'
const muteCommand = '*/mute*\nЗапрещает писать в чат в течении определённого срока (от 1 часа до 7 дней). ' +
  'Обязательно должен быть указан срок ограничения: `/mute 12h` — двенадцать часов, `/mute 2d` — два дня, и так далее.';
const unmuteCommand = '*/unmute*\nСнимает все ограничения (если они есть).'
const kickCommand = '*/kick*\nВыгоняет человека из группы (он сможет вернуться, если захочет).';
const pinCommand = '*/pin*\nПрикрепляет сообщение. Все в чате получат об этом уведомление.';
const unpinCommand = '*/unpin*\nУбирает прикреплённое сообщение.';

const muteNotice = '$username не сможет писать сообщения в течении $duration.';
const unmuteNotice = 'С $username были сняты все установленные ограничения.';
const kickNotice = '$username покинул группу.';

const error = 'Отказываюсь это выполнять.'

module.exports = function(bot) {

  /* Справка по всем этим функциям */
  bot.onText(/^\/mod\b/, async (msg) => {
    bot.sendMessage(msg.chat.id, `${modCommand}\n\n${muteCommand}\n\n${unmuteCommand}\n\n${kickCommand}\n\n${pinCommand}\n\n${unpinCommand}`, { parse_mode: 'markdown' });
  });

  /* Команда /mute, лишающая пользователя возможности оправлять сообщения в общий чат */
  /* Аргументом указывается длительность в формате 1d и 1h */
  bot.onText(/^\/mute\b ?([^\s]+)?/, async (msg, match) => {
    if (msg.chat.type != 'supergroup' && await checkAuthority(config.groupId, msg.from.id) == 'user') return;

    if (msg.reply_to_message && match[1] && tools.dconvert(match[1]) != 'err') {
      if (await checkAuthority(config.groupId, msg.reply_to_message.from.id) != 'user') {
        bot.sendMessage(msg.chat.id, error, { parse_mode: 'markdown' });
      } else {
        bot.restrictChatMember(msg.chat.id, msg.reply_to_message.from.id, { until_date: tools.dconvert(match[1], 'date'), can_send_messages: false });
        bot.sendMessage(msg.chat.id, muteNotice.replace('$username', '[' + tools.name2show(msg.reply_to_message.from) + '](tg://user?id=' +
          msg.reply_to_message.from.id + ')').replace('$duration', tools.dconvert(match[1])), { parse_mode: 'markdown' });
      };
    } else {
      bot.sendMessage(msg.chat.id, muteCommand, { parse_mode: 'markdown' });
    }
  });

  /* Команда /unmute, снимающая все ограничения */
  bot.onText(/^\/unmute\b/, async (msg) => {
    if (msg.chat.type != 'supergroup' && await checkAuthority(config.groupId, msg.from.id) == 'user') return;
    if (!msg.reply_to_message) bot.sendMessage(msg.chat.id, unmuteCommand, { parse_mode: 'markdown' });

    if (await checkAuthority(config.groupId, msg.reply_to_message.from.id) != 'user') {
      bot.sendMessage(msg.chat.id, error, { parse_mode: 'markdown' });
    } else {
      bot.restrictChatMember(msg.chat.id, msg.reply_to_message.from.id, {
        can_send_messages: true,
        can_send_media_messages: true,
        can_send_other_messages: true,
        can_add_web_page_previews: true
      });
      bot.sendMessage(msg.chat.id, unmuteNotice.replace('$username', '[' + tools.name2show(msg.reply_to_message.from) + '](tg://user?id=' +
        msg.reply_to_message.from.id + ')'), { parse_mode: 'markdown' });
    };
  });

  /* Команда /kick, удаляющая участника из чата */
  bot.onText(/^\/kick\b/, async (msg) => {
    if (msg.chat.type != 'supergroup' && await checkAuthority(config.groupId, msg.from.id) == 'user') return;
    if (!msg.reply_to_message) bot.sendMessage(msg.chat.id, kickCommand, { parse_mode: 'markdown' });

    if (await checkAuthority(config.groupId, msg.reply_to_message.from.id) != 'user') {
      bot.sendMessage(msg.chat.id, error, { parse_mode: 'markdown' });
    } else {
      bot.kickChatMember(msg.chat.id, msg.reply_to_message.from.id);
      bot.unbanChatMember(msg.chat.id, msg.reply_to_message.from.id);
      bot.sendMessage(msg.chat.id, kickNotice.replace('$username', '[' + tools.name2show(msg.reply_to_message.from) + '](tg://user?id=' +
        msg.reply_to_message.from.id + ')'), { parse_mode: 'markdown' });
    }
  });

  /* Команда /pin, прикрепляющая сообщение */
  bot.onText(/^\/pin\b/, async (msg) => {
    if (msg.chat.type != 'supergroup' && await checkAuthority(config.groupId, msg.from.id) == 'user') return;

    if (msg.reply_to_message) {
      bot.pinChatMessage(msg.chat.id, msg.reply_to_message.message_id);
    } else {
      bot.sendMessage(msg.chat.id, pinCommand, { parse_mode: 'markdown' });
    }
  });

  /* Команда /unpin */
  bot.onText(/^\/unpin\b/, async (msg) => {
    if (msg.chat.type != 'supergroup' && await checkAuthority(config.groupId, msg.from.id) == 'user') return;
    bot.unpinChatMessage(msg.chat.id);
  });

  /* Функция проверяет, является ли пользователь админом или модератором */
  async function checkAuthority(groupId, userId) {
    var user = await Users.findOne({ uid: userId });
    var admins = await bot.getChatAdministrators(groupId);
    if (user && user.isMod) {
      return 'mod';
    } else if (admins.filter(x => x.user.id == userId).length > 0) {
      return 'admin';
    } else {
      return 'user';
    }
  };

};