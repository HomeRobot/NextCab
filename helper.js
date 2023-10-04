const moment = require('moment');

function formatDatesInObject(obj, format) {
  // Рекурсивная функция для обхода всех свойств объекта
  function traverse(obj) {
    for (let key in obj) {
      if (obj.hasOwnProperty(key)) {
        const value = obj[key];
        if (typeof value === 'object') {
          traverse(value); // Рекурсивный вызов для вложенных объектов
        } else if (moment(value, moment.ISO_8601).isValid()) {
          obj[key] = moment(value).format(format); // Форматирование даты
        }
      }
    }
  }

  const newObj = { ...obj }; // Создаем копию объекта, чтобы не изменять исходный
  traverse(newObj); // Обходим объект для форматирования дат
  return newObj;
}

module.exports = {
  formatDatesInObject
}