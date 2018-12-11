const config = require('../config');
const tools = require('../tools');
const Users = require('../models/users');
const DeletedMsgs = require('../models/dels');

const modCommand = 'Все команды необходимо отправлять в ответ на чьё-либо сообщение — таким образом задаётся цель.'
const warnCommand = '*/warn*\nВыдаёт предупреждения, которые накапливаются. После получения трёх предупреждений будет установлен мьют на сутки.';
const muteCommand = '*/mute*\nЗапрещает писать в чат в течении определённого срока (от 1 часа до 7 дней). ' +
  'Обязательно должен быть указан срок ограничения: `/mute 12h` — двенадцать часов, `/mute 2d` — два дня, и так далее.';
const unmuteCommand = '*/unmute*\nСнимает все ограничения (если они есть).'
const kickCommand = '*/kick*\nВыгоняет человека из группы (он сможет вернуться, если захочет).';
const spamCommand = '*/spam*\nУдаляет сообщение спамера и выгоняет его из группы. Устанавливает метку для антиспам-функции.';

const spamNotice = 'Сообщение участника $username было удалено, а сам он выгнан вон за спам.';
const warnNotice = '$username, это $count предупреждение. После получения трёх будет установлен мьют на сутки.';
const muteNotice = '$username не сможет писать сообщения в течении $duration.';
const unmuteNotice = 'С $username были сняты все установленные ограничения.';
const kickNotice = '$username покинул группу.';

const fail = ' Команду следует отправлять в ответ на чьё-либо сообщение (таким образом задаётся цель).';
const error = 'Отказываюсь это выполнять.'

module.exports = function(bot) {

  /* Справка по всем этим функциям */
  bot.onText(/^\/mod\b/, async (msg) => {
    bot.sendMessage(msg.chat.id, `${modCommand}\n\n${warnCommand}\n\n${muteCommand}\n\n${unmuteCommand}\n\n${kickCommand}\n\n${spamCommand}`, { parse_mode: 'markdown' });
  });

  /* Команда /warn, выдающая предупреждение. После 3 предупреждений мьют на сутки  */
  bot.onText(/^\/warn\b/, async (msg) => {
    if (msg.chat.type != 'supergroup' || await checkAuthority(config.groupId, msg.from.id) == 'user') return;
    if (!msg.reply_to_message) return bot.sendMessage(msg.chat.id, warnCommand + fail, { parse_mode: 'markdown' });

    if (await checkAuthority(config.groupId, msg.reply_to_message.from.id) == 'user') {
      bot.sendMessage(msg.chat.id, error, { parse_mode: 'markdown' });
    } else {
      var user = await Users.findOne({ uid: msg.reply_to_message.from.id });
      if (user.warns && user.warns >= 2) {
        var until_date = moment().add(1, 'days').unix();
        bot.restrictChatMember(msg.chat.id, msg.reply_to_message.from.id, { until_date: until_date, can_send_messages: false });
        bot.sendMessage(msg.chat.id, muteNotice.replace('$username', '[' + tools.name2show(msg.reply_to_message.from) + '](tg://user?id=' +
          msg.reply_to_message.from.id + ')').replace('$duration', '1 дня'), { parse_mode: 'markdown' });
        await Users.updateOne({ uid: msg.reply_to_message.from.id }, { $unset: { warns: '' } });
      } else {
        await Users.updateOne({ uid: msg.reply_to_message.from.id }, { $set: { warns: user.warns + 1 || 1 } });
        bot.sendMessage(msg.chat.id, warnNotice.replace('$username', '[' + tools.name2show(msg.reply_to_message.from) + '](tg://user?id=' +
          msg.reply_to_message.from.id + ')').replace('$count', user.warns + 1 || 1), { parse_mode: 'markdown' });
      }
    }
  });

  /* Команда /spam для удаления спама (удаление сообщения с бекапом, удаление из группы и активация системы антиспама)   */
  bot.onText(/^\/spam\b/, async (msg) => {
    if (msg.chat.type != 'supergroup' || await checkAuthority(config.groupId, msg.from.id) == 'user') return;
    if (!msg.reply_to_message) return bot.sendMessage(msg.chat.id, spamCommand + fail, { parse_mode: 'markdown' });

    if (await checkAuthority(config.groupId, msg.reply_to_message.from.id) != 'user') {
      bot.sendMessage(msg.chat.id, error, { parse_mode: 'markdown' });
    } else {
      bot.kickChatMember(msg.chat.id, msg.reply_to_message.from.id);
      bot.unbanChatMember(msg.chat.id, msg.reply_to_message.from.id);
      await Users.updateOne({ uid: msg.reply_to_message.from.id }, { $set: { antispam: 10 } });
      var forward = await bot.forwardMessage(config.channelId, msg.chat.id, msg.reply_to_message.message_id, { disable_notification: true });
      var report = await bot.sendMessage(msg.chat.id, spamNotice.replace('$username', '[' + tools.name2show(msg.reply_to_message.from) + '](tg://user?id=' + msg.reply_to_message.from.id + ')'), {
        parse_mode: 'markdown', reply_markup: { inline_keyboard: [[{ text: 'Показать', callback_data: 'send_del_msg' }]]}
      });
      await DeletedMsgs.create({ msg, reportId: report.message_id, forwardId: forward.message_id });
      bot.deleteMessage(msg.chat.id, msg.reply_to_message.message_id);
    }
  });

  /* Команда /mute, лишающая пользователя возможности оправлять сообщения в общий чат */
  /* Аргументом указывается длительность в формате 1d и 1h */
  bot.onText(/^\/mute\b ?([^\s]+)?/, async (msg, match) => {
    if (msg.chat.type != 'supergroup' || await checkAuthority(config.groupId, msg.from.id) == 'user') return;

    if (msg.reply_to_message && match[1] && tools.dconvert(match[1]) != 'err') {
      if (await checkAuthority(config.groupId, msg.reply_to_message.from.id) != 'user') {
        bot.sendMessage(msg.chat.id, error, { parse_mode: 'markdown' });
      } else {
        bot.restrictChatMember(msg.chat.id, msg.reply_to_message.from.id, { until_date: tools.dconvert(match[1], 'date'), can_send_messages: false });
        bot.sendMessage(msg.chat.id, muteNotice.replace('$username', '[' + tools.name2show(msg.reply_to_message.from) + '](tg://user?id=' +
          msg.reply_to_message.from.id + ')').replace('$duration', tools.dconvert(match[1])), { parse_mode: 'markdown' });
      };
    } else {
      bot.sendMessage(msg.chat.id, muteCommand + fail, { parse_mode: 'markdown' });
    }
  });

  /* Команда /unmute, снимающая все ограничения */
  bot.onText(/^\/unmute\b/, async (msg) => {
    if (msg.chat.type != 'supergroup' || await checkAuthority(config.groupId, msg.from.id) == 'user') return;
    if (!msg.reply_to_message) return bot.sendMessage(msg.chat.id, unmuteCommand + fail, { parse_mode: 'markdown' });

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
    if (msg.chat.type != 'supergroup' || await checkAuthority(config.groupId, msg.from.id) == 'user') return;
    if (!msg.reply_to_message) return bot.sendMessage(msg.chat.id, kickCommand + fail, { parse_mode: 'markdown' });

    if (await checkAuthority(config.groupId, msg.reply_to_message.from.id) != 'user') {
      bot.sendMessage(msg.chat.id, error, { parse_mode: 'markdown' });
    } else {
      bot.kickChatMember(msg.chat.id, msg.reply_to_message.from.id);
      bot.unbanChatMember(msg.chat.id, msg.reply_to_message.from.id);
      bot.sendMessage(msg.chat.id, kickNotice.replace('$username', '[' + tools.name2show(msg.reply_to_message.from) + '](tg://user?id=' +
        msg.reply_to_message.from.id + ')'), { parse_mode: 'markdown' });
    }
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