const config = require('../config');

const cycleDayText = 'Наступил день восемнадцатидневного цикла. ' +
  'Согласно словам Кастанеды, в это время некая волна энергии достигает Земли. ' +
  'Если заметите что-то особенное, пожалуйста, напишите об этом с тегом #18дней.\n\n' +
  '_Точка отсчёта 03.08.$year 00:00 GMT-7 (часовой пояс Лос-Анджелеса)._'

module.exports = function(bot) {

  function nextDate2(baseDate) {
    var today = new Date();
    const period = 18 * 1000 * 60 * 60 * 24; // 18 дней в милисекундах
    
    today = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    var remainder = (today.getTime() - baseDate.getTime()) % (period);
    return new Date(today.getTime() + (period - remainder));
  };

  function nextDate(baseDate) {
    var today = new Date().getTime();
    const period = 18 * 1000 * 60 * 60 * 24; // 18 дней в милисекундах
  
    decimal = baseDate.getTime() / period;
    decimal = decimal - Math.floor(decimal); // находим дробную часть от деления
    offset = period * (1 - decimal);
    next = ((today + offset) / period);
    decimalNext = 1 - (next - Math.floor(next)); // 1 - дробная часть от next
    nextMs = period * decimalNext; // сколько милисекунд нужно прибавить к текущей дате
  
    return new Date(today + nextMs); // итоговая дата
  };

  function getNextDays() {
    const date1 = new Date('03 Aug 1980 00:00:00 GMT-0700');
    const date2 = new Date('03 Aug 1981 00:00:00 GMT-0700');

    var nextDays = [];
    nextDays.push({ date: nextDate(date1), type: 1980 });
    nextDays.push({ date: nextDate(date2), type: 1981 });

    nextDays.sort(function(a, b) {
      return +new Date(a.date) - +new Date(b.date);
    });

    console.log('[18 дневный цикл] Следующий день (от ' + nextDays[0].type + 'г) будет:', nextDays[0].date.toString());
    return nextDays;
  };

  var nextDays = getNextDays();

  setInterval(function() {
    const now = new Date();
    if (now.getTime() >= nextDays[0].date.getTime()) {
      bot.sendMessage(config.groupId, cycleDayText.replace('$year', nextDays[0].type), { parse_mode: 'markdown' });
      console.log('[18 дневный цикл] Наступил день (' + nextDays[0].type + 'от г):', nextDays[0].date.toString());
      nextDays = getNextDays();
    };
  }, 30 * 60 * 1000);

};