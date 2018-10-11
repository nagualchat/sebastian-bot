const env = process.env.NODE_ENV;

const connections = {
  'production': {
    telegramToken: '',
    mongo: {
      url: '',
      options: { useNewUrlParser: true }
    },
    groupId: 
  },

  'development': {
    telegramToken: '',
    mongo: {
      url: '',
      options: { useNewUrlParser: true }
    },
    groupId: 
  }
};

const settings = {
  channelId: ,  // ID канала для удалённых сообщений
  adminUid: ,   // UID админа
  siteUrl: 'http://nagualism.space',
};

module.exports = Object.assign(connections[env], settings);
