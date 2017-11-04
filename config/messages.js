const messages = {
  
    welcomeNew : [
      'Рад тебя видеть в нашем чате, $name.',
      'Вы только посмотрите, кто к нам заглянул. Это же $name!',
      'Привет, $name. Какими судьбами?',
      'Здравствуй, $name. Как дела?',
      'Привет, $name. В этом чате мы обсуждаем учение толтеков. Ты же знаешь кто это такие, да?',
      'Добро пожаловать, $name. Какая у тебя конфигурация энергетического тела? Мне это нужно в бумагах указать.',
      'Приветствую, $name. Ты уже прочёл книги Кастанеды или только собираешься? В любом случае, советую заглянуть в нашу [библиотеку](https://nagualchat.github.io).'
    ],
  
    welcomeRet1 : [
      'О, это же опять $name. Я даже соскучиться не успел.',
      'О, это же опять $name. Быстро ты.'
    ],
  
    welcomeRet2 : [
      'С возвращением, $name. Где пропадал?',
      'С возвращением, $name. Давно тебя не было видно.'
    ],
      
    goodDay : [
	   'Доброе утро. Как спалось?',
	   'И тебе утра доброго.',
	   'Как спалось, что снилось?',
	   'Утро — плохое время для мага.'
    ],
  
    goodNight : [
      'Желаю хорошо посновидеть.',
      'Ясных снов!',
      'Не забудь сегодня посмотреть на руки во сне.'
    ],

    answer : [
      'Да.',
      'Нет.'
    ],

    answerChoice : [
      '$variant.',
      '$variant. Тут и думать нечего.',
      'Конечно же, $variant.',
      'Спроси что попроще.'
    ],

    deleteDel1 : 'Сообщение участника $username было удалено.',
    deleteDel2 : 'Сообщение участника $username было удалено за $reason.',
    deleteDels1 : '$count участника $name было удалено.',
    deleteDels2 : 'Сообщения ($names) были удалены',
    deleteSpam : 'Сообщение участника $username было распознано как спам и автоматически удалено.',
    
    restrictVoice1 : '$username помещается в изолятор и не сможет оттуда отправлять сообщения в чат.',
    restrictVoice2 : '$username помещается в изолятор на $duration. В течении этого времени он не сможет отправлять сообщения в чат.',
    restrictMedia1 : '$username помещается в карантин и не сможет оттуда отправлять в чат медиа-контент любого типа.',    
    restrictMedia2 : '$username помещается в карантин на $duration. В течении этого времени он не сможет отправлять в чат медиа-контент любого типа.',
    unRestrict : '$username, все ранее установленные ограничения с тебя сняты.',
    
    kick : '$username получает пинком под зад.',
    kickNotFound : 'Я бы с радостью это сделал, но $username уже и так покинул группу.',
    ban : '$username изгоняется из чата без возможности вернуться обратно.',

    favAdd : 'Закладка $fav добавлена. Посмотреть список закладок можно набрав команду /favs.',
    favAddDupl : 'Такая закладка уже существует.',
    favAddWrong : 'Чтобы добавить сообщение в закладки, пришлите в ответ на него команду `/fav название`. Название закладки может содержать несколько слов, но в целом должно быть не длиннее 80 символов.',
    favList: 'Список избранных сообщений:\n',
    favEdit: 'Закладка переименована в $fav.',
    favDel: 'Закладка $fav удалена.',
    favNotFound: 'Закладка $fav не найдена.',

    kickBotImg: 'AgADAgADo6gxGySk6ErJHLDftoDq8HTEDw4ABKb97OqDIEHUNaMBAAEC',
    kickBotMsg: 'Должен остаться только один!',

    reportBtn : 'Показать',
    reSend : 'Копия удалённого сообщения отправлена в приват.',
    reSendErr : 'Ботам запрещено первыми начинать разговор с незнакомыми пользователями. Чтобы Себастьян мог переслать вам удалённое сообщение, сначала откройте приват с ним и познакомьтесь, нажав кнопку «START».',

    help : 'Меня зовут Себастьян, я многофункциональный роботизированный дворецкий. ' + 
    'Приветствую гостей, выявляю спамеров, веду архив удаляемых сообщений и выполняю некоторые другие функции. \n\n' +
    'Чтобы содержащие важную информацию или просто интересные сообщения не затерялись среди ординарных разговоров, реализована функция добавления закладок. ' +
    'Добавить сообщение в избранное можно написав в ответ на него команду `/fav название закладки`. Посмотреть список избранного: /favs.',

    admin : 'Список доступных админам команд:\n' + 
    '`/say текст` : отправляет в чат сообщение от лица бота. Работает markdown-разметка: `_курсив_, *жирный*, [ссылка](http://)`. Перенос строки: `/n`.\n' +
    '`/del (причина)` : удаляет сообщение с занесением в БД.\n' +
    '`/kick (причина)` : выгоняет участника из чата.\n' + 
    '`/ban (причина)` : выгоняет и банит участника.\n' + 
    '`/mute (длительность) (причина)` : лишает участника возможности писать любые сообщения.\n' +
    '`/mute2 (длительность) (причина)` : лишает возможности отправлять медиа-контент (войсы, фото, стикеры и так далее).\n' +
    '`/unmute` : снимает все ограничения.\n\n' +
    'Все команды (кроме `/say`) должны применяться к процитированному сообщению. Параметры в скобках опциональны. Длительность указывается вида `1h` или `1d`, что соответствует 1 часу и 1 дню. Если не указана, то считается бесконечной.'
  };
  
  module.exports = messages;
  
