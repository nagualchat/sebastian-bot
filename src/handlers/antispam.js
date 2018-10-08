/*  Антиспам, который действует для недавно вошедших в чат участников                                     */
/*  Срабатывает на форвард и ссылки типа @username, t.me, telegram.me, удаляя содержащие их сообщения     */
/*  Удалённые посты отправляются в канал для хранения и при запросе высылаются пользователю в приват      */

const Users = require('../models/users');
const DeletedMsgs = require('../models/dels');
const tools = require('../tools');
const config = require('../config');

const delNotice = 'Сообщение участника $username было распознано как спам и автоматически удалено.';
const reSend = 'Копия удалённого сообщения отправлена в приват.';
const reSendErr = 'Ботам запрещено первыми начинать разговор с незнакомыми пользователями. Чтобы Себастьян мог переслать вам удалённое сообщение, сначала откройте с ним приват и познакомьтесь, нажав кнопку [START].';

module.exports = function(bot) {

  bot.on('message', async (msg) => {
    // $gte - больше или равно
    var user = await Users.findOne({ uid: msg.from.id, antispam: { $gte: 1 } });
    var deleted = false;
    if (user) {
      if (msg.forward_from_chat) {
        if (!(msg.document || msg.audio)) {
          deleteSpam(msg, user.antispam);
          deleted = true;
        }
      } else if (msg.text) {
        if (/t(?:elegram)?\.me/.test(msg.text)) {
          deleteSpam(msg, user.antispam);
          deleted = true;
        }
        var entities = msg.entities || [];
        for (var entity of entities) {
          if (entity.type && entity.type == 'mention') {
            var mentioned = msg.text.substr(entity.offset, entity.length);
            try {
              var chat = await bot.getChat(mentioned);
              if (chat && chat.type == 'channel' || chat && chat.type == 'supergroup') {
                deleteSpam(msg, user.antispam);
                deleted = true;
                break;
              }
            } catch (err) {}
          }
        }
      } else if (msg.caption) {
        if (/t(?:elegram)?\.me/.test(msg.caption)) {
          deleteSpam(msg, user.antispam);
          deleted = true;
        }
        var entities = msg.caption_entities || [];
        for (var entity of entities) {
          if (entity.type && entity.type == 'mention') {
            var mentioned = msg.caption.substr(entity.offset, entity.length);
            try {
              var chat = await bot.getChat(mentioned);
              if (chat && chat.type == 'channel' || chat && chat.type == 'supergroup') {
                deleteSpam(msg, user.antispam);
                deleted = true;
                break;
              }
            } catch (err) {}
          }
        }
      }
      if (deleted == false) {
        if (user.antispam > 1) {
          await Users.update({ uid: msg.from.id }, { $set: { antispam: user.antispam - 1 } });
        } else {
          await Users.update({ uid: msg.from.id }, { $unset: { antispam: '' } });
        }
      }
    }
  });

  /* Обработчик кнопки под удалённым сообщением */
  bot.on('callback_query', async (msg) => {
    if (msg.data === 'send_del_msg') {
      var found = await DeletedMsgs.findOne({ reportId: msg.message.message_id });
      console.log('[Log]', tools.name2show(msg.from) + ' (' + msg.from.id + ') запросил удалённое сообщение ' + found.forwardId);
      try {
        await bot.forwardMessage(msg.from.id, config.channelId, found.forwardId);
      } catch (err) {
        success = false;
        bot.answerCallbackQuery(msg.id, reSendErr, true);
        console.log('[Log] доставить сообщение не удалось (' + err.message + ')');
      }
      if (success != false) {
        bot.answerCallbackQuery(msg.id, reSend);
      }
    }
  });

  /* Функция удаления сообщений для антиспама */
  const deleteSpam = async (msg, antispam) => {
    var forward = await bot.forwardMessage(config.channelId, msg.chat.id, msg.message_id, { disable_notification: true });
    var report = await bot.sendMessage(msg.chat.id, delNotice.replace('$username', '[' + tools.name2show(msg.from) + '](tg://user?id=' + msg.from.id + ')'), {
      parse_mode: 'markdown', reply_markup: { inline_keyboard: [[{ text: 'Показать', callback_data: 'send_del_msg' }]] }});
    if (antispam == 10) {
      bot.deleteMessage(msg.chat.id, msg.message_id);
      bot.kickChatMember(msg.chat.id, msg.from.id);
    } else {
      bot.deleteMessage(msg.chat.id, msg.message_id);
      bot.kickChatMember(msg.chat.id, msg.from.id);
      bot.unbanChatMember(msg.chat.id, msg.from.id);
      await Users.update({ uid: msg.from.id }, { $set: { antispam: 10 } });
    }
    DeletedMsgs.create({ msg, reportId: report.message_id, forwardId: forward.message_id });
  };

};