const help =
  'Бот-дворецкий группы @nagualchat. Приветствует гостей, выявляет спамеров и многое другое. ' +
  'Исходный код доступен на <a href="https://github.com/nagualchat/sebastian-bot">гитхабе</a>.\n\n' +
  '<b>Поиск</b>\n' +
  'Чтобы воспользоваться поиском по книгам Кастанеды, Тайши и Флоринды, наберите в поле ввода сообщения <code>@toltebot искомая фраза</code>. ' +
  'Также можно ввести <code>"точный запрос"</code>, оформив его в кавычки или <code>&#8209;исключить</code> слово из поиска, поставив перед ним минус. ' +
  'Нажатие по одному из найденных результатов отправляет фрагмент в тот чат, который сейчас открыт.\n\n' +
  '<b>Модерирование</b>\n' +
  'Каждые две недели проводятся выборы временного модератора. После избрания появляется доступ к командам из списка /mod.';

module.exports = function(bot) {

  bot.onText(/^\/start\b/, (msg) => {
    if (msg.chat.type == 'private') bot.sendMessage(msg.chat.id, help, { parse_mode : 'html', disable_web_page_preview: 'true' });
  });

  bot.onText(/^\/help\b/, (msg) => {
    bot.sendMessage(msg.chat.id, help, { parse_mode : 'html', disable_web_page_preview: 'true' });
  });

};