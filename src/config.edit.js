const env = process.env.NODE_ENV;

const connections = {
  'production': {
    telegramToken: '',
    mongo: {
      url: 'mongodb://',
      options: { useNewUrlParser: true }
    },
    groupId: 123456789
  },

  'development': {
    telegramToken: '',
    mongo: {
      url: 'mongodb://',
      options: { useNewUrlParser: true }
    },
    groupId: 123456789
  }
};

const settings = {
  channelId: 123456789,  // ID канала для удалённых сообщений
  siteUrl: 'http://nagualism.space',
};

module.exports = Object.assign(connections[env], settings);
