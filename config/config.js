const config = {

telegramToken : '',
witToken : '',
mongoConnectUrl : '',

booksUrl: 'https://nagualchat.github.io',

// ids
group : '',
channel : '',
admin : '',

joinPeriod : 24, // Время, после которого участник считается "старым", в часах
responseTimeout : 60, // Время между пожеланиями доброго дня, в течении которого бот на них не реагирует, в секундах
sessionLifeTime: 30000, // Время, после которого открытая сессия самоуничтожается, в милисекундах

};

module.exports = config;
