const moment = require('moment');

// Функция для вывода второй части имени, если она есть
function name2show(msg) {
  if (msg.last_name != undefined) {
    return msg.first_name + ' ' + msg.last_name;
  } else {
    // Убирает собаку из имени, чтобы не получалась ссылка
    return msg.first_name.replace(/^@(.?)/g, '$1');
  }
};

// Выбор случайной строки из массива
function random(array) {
  var randomMessage = Math.floor(Math.random() * array.length);
  return array[randomMessage];
};

function randomW(array) {
  // Строки копируются в другой массив, умножаясь в соответствии со значением weight
  var arrayIds = [];
  for (var i = 0; i < array.length; i++) {
    for (var x = 0; x < array[i].weight; x++) {
      arrayIds.push(array[i].text);
    };
  };
  // Из размноженных элементов выбирается случайный
  var index = Math.floor(Math.random() * (arrayIds.length));
  // В котором случайно выбираются подстроки, оформленные в {}
  var str = arrayIds[index].replace(/{([^}]+)}/g, function(p, m) {
    var arr = m.split("|");
    return arr[~~(Math.random() * arr.length)];
  });
  return str;
};

// Перемешивание содержимого массива
function shuffle(arr) {
  for (let i = arr.length; i; i--) {
    let j = Math.floor(Math.random() * i);
    [arr[i - 1], arr[j]] = [arr[j], arr[i - 1]];
  };
};

// Сортировка массива объектов
// Аргументом передаётся поле (или несколько полей) по которым необходимо отсортировать
function sortByAttribute(array, ...attrs) {
  let predicates = attrs.map(pred => {
    let descending = pred.charAt(0) === '-' ? -1 : 1;
    pred = pred.replace(/^-/, '');
    return {
      getter: o => o[pred],
      descend: descending
    };
  });
  return array.map(item => {
    return {
      src: item,
      compareValues: predicates.map(predicate => predicate.getter(item))
    };
  })
  .sort((o1, o2) => {
    let i = -1, result = 0;
    while (++i < predicates.length) {
      if (o1.compareValues[i] < o2.compareValues[i]) result = -1;
      if (o1.compareValues[i] > o2.compareValues[i]) result = 1;
      if (result *= predicates[i].descend) break;
    }
    return result;
  })
  .map(item => item.src);
};

// Функция делает первую букву строки заглавной
function capitalize(string) {
  return string.charAt(0).toUpperCase() + string.slice(1);
}

// Делает первую букву заглавной и расставляет точки
function correction(string) {
  var capitalized = string.charAt(0).toUpperCase() + string.slice(1);
  return capitalized.replace(/([а-я]) ([А-Я])/g, '$1. $2') + '.';
}

// Общая функция склонение слов для согласования с числами
function decl(number, titles) {
  cases = [2, 0, 1, 1, 1, 2];
  return number + ' ' + titles[(number % 100 > 4 && number % 100 < 20) ? 2 : cases[(number % 10 < 5) ? number % 10 : 5]];
}

// Склонение слов
function declension(match, mode) {
  let words = { message: ['сообщение', 'сообщения', 'сообщений'], plus: ['плюс', 'плюса', 'плюсов'] };
  return decl(match, words[mode]);
}

// Функция отображения срока наказания для мьюта
function dconvert(match, mode) {
  var regexp = match.match(/(\d*)(\S)/i);
  // Склонения можно определить, примеряя к цифрам 1, 3 и 5
  let words = { day: ['дня', 'дней', 'дней'], hour: ['часа', 'часов', 'часов'] };
  if (regexp[2] == 'd' && regexp[1] <= 7) {
    if (mode == 'date') {
      return date = moment().add(regexp[1], 'days').unix();
    } else {
      return decl(regexp[1], words.day);
    }
  } else if (regexp[2] == 'h' && regexp[1] <= 24) {
    if (mode == 'date') {
      return date = moment().add(regexp[1], 'hours').unix();
    } else {
      return decl(regexp[1], words.hour);
    }
  } else return 'err';
};

exports.name2show = name2show;
exports.randomW = randomW;
exports.random = random;
exports.shuffle = shuffle;
exports.sortByAttribute = sortByAttribute;
exports.capitalize = capitalize;
exports.decl = decl;
exports.declension = declension;
exports.dconvert = dconvert;
exports.correction = correction;