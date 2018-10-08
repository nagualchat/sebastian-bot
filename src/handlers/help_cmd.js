const help =
  '<b>Поиск</b>\n' +
  'Поиск по книгам Кастанеды, Тайши и Флоринды работает в <a href="https://core.telegram.org/bots/inline">инлайн-режиме</a>. ' +
  'Чтобы им воспользоваться, наберите в поле ввода сообщения <code>@toltebot искомая фраза</code>. ' +
  'Также можно ввести <code>"точный запрос"</code>, оформив его в кавычки или <code>&#8209;исключить</code> слово из поиска, поставив перед ним минус. ' +
  'Нажатие по одному из найденных результатов отправляет фрагмент в тот чат, который сейчас открыт.\n\n' +
  '<b>Модерирование</b>\n' +
  'Подробнее в /mod.';

module.exports = function(bot) {

  bot.onText(/^\/start\b/, (msg) => {
    if (msg.chat.type == 'private') bot.sendMessage(msg.chat.id, help, { parse_mode : 'html', disable_web_page_preview: 'true' });
  });

  bot.onText(/^\/help\b/, (msg) => {
    bot.sendMessage(msg.chat.id, help, { parse_mode : 'html', disable_web_page_preview: 'true' });
  });
  
};