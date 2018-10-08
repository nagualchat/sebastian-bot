/*  Приветствование вошедших участников; фразы выбираются случайным образом  */
/*  Для новых участников - одно приветствие, для вернувшихся - другое, для быстро вернувшихся - третье  */

const moment = require('moment');
const Users = require('../models/users');
const tools = require('../tools');
const config = require('../config');

const welcomeNew = [
  { text: '{Привет|Приветствую|Здравствуй|Добро пожаловать|Рад тебя видеть}, $name. {Какими судьбами?|Как дела?|Как ты нас нашёл?|Расскажи что-нибудь о себе.|Расскажешь что-нибудь о себе?}', weight: 15 },
  { text: '{Рад видеть тебя в нашем чате, $name!|Рад тебя приветствовать в нашем чате, $name!}{| Располагайся, чувствуй себя как дома.}', weight: 10 },
  { text: 'Вы только посмотрите, кто к нам заглянул. {Это же $name!|Уж не $name ли это?}', weight: 5 },
  { text: '{Приветствую|Здравствуй|Добро пожаловать}, $name. Ты уже прочёл книги Кастанеды или только собираешься?{| В любом случае, советую заглянуть в нашу <a href="http://nagualism.space/lib">библиотеку</a>.}', weight: 5 },
  { text: '{Приветствую|Здравствуй|Добро пожаловать}, $name. Если тебе понадобится найти что-нибудь в книгах Кастанеды, то набери в поле ввода <code>@toltebot искомые слова</code> и я покажу в каких текстах они встречаются. Или можешь воспользоваться поиском на нашем <a href="http://nagualism.space">сайте</a>.', weight: 10 },
  { text: '{Приветствую|Здравствуй|Добро пожаловать}, $name. Возможно, тебе будет интересно узнать, что кроме основного чата у нас имеются дополнительные группы: <a href="https://t.me/nagualchat_prac">практика</a> и <a href="https://t.me/nagualchat_dev">разработка</a>.', weight: 10 }
];

const welcomeRet1 = [
  { text: 'О, это же опять $name.{| Быстро ты.}', weight: 20 },
  { text: 'Я даже соскучиться не успел.', weight: 10 },
  { text: 'Опять ты?', weight: 5 },
  { text: 'Какое знакомое имя.', weight: 5 },
  { text: 'Никогда такого не было, и вот опять.', weight: 5 },
];

const welcomeRet2 = [
  { text: 'С возвращением, $name. Давно тебя не было видно.{| Я скучал.}', weight: 10 },
  { text: 'Рад снова тебя видеть, $name. Как твои дела?', weight: 5 },
  { text: 'Где тебя носило, $name? Ты многое пропустил.', weight: 5 },
  { text: 'Добро пожаловать. Снова.', weight: 5 }
];

const joinPeriod = 168; // Время, после которого участник считается 'старым' (в часах)
const antispamCounter = 3; // Количество сообщений, которые проверяются на содержание спам-ссылок

module.exports = function(bot) {

  bot.on('new_chat_members', async (msg) => {
    if (msg.new_chat_member.id == botData.id) return; // Чтобы не приветствовал самого себя
    // if (msg.new_chat_member.is_bot === true) {
    //   bot.kickChatMember(msg.chat.id, msg.new_chat_member.id);
    //   bot.sendPhoto(msg.chat.id, 'https://i.imgflip.com/a9m7q.jpg', { caption: 'Должен остаться только один!' });
    //   return;
    // }
    var user = await Users.findOne({ uid: msg.new_chat_member.id });
    if (!user) {
      bot.sendMessage(msg.chat.id, tools.randomW(welcomeNew).replace('$name', tools.name2show(msg.new_chat_member)), { parse_mode: 'HTML', disable_web_page_preview: true });
      await Users.create({ uid: msg.new_chat_member.id, name: tools.name2show(msg.new_chat_member), firstJoin: msg.date, lastJoin: msg.date, antispam: antispamCounter });
    } else {
      if (moment().diff(moment.unix(user.lastJoin), 'hours') <= joinPeriod) {
        bot.sendMessage(msg.chat.id, tools.randomW(welcomeRet1).replace('$name', tools.name2show(msg.new_chat_member)));
      } else {
        bot.sendMessage(msg.chat.id, tools.randomW(welcomeRet2).replace('$name', tools.name2show(msg.new_chat_member)));
      }
      await Users.update({ uid: msg.new_chat_member.id }, { $set: { name: tools.name2show(msg.new_chat_member), lastJoin: msg.date, rejoins: user.rejoins + 1 || 1 } });
    }
  });

};