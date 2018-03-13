const config = {

telegramToken : '',
witToken : '',
mongoConnectUrl : '',

booksUrl: 'https://nagualchat.github.io',

// ids
group : '',
channel : '',
admin : '',

joinPeriod : 168, // Время, после которого участник считается "старым", в часах
responseTimeout : 60, // Время между пожеланиями доброго дня, в течении которого бот на них не реагирует, в секундах
sessionLifeTime: 60000, // Время, после которого открытая сессия самоуничтожается, в милисекундах
antiSpamCounter: 3 // Количество сообщений новых участников, которые проверяются на содержание спам-ссылок

};

module.exports = config;
