class Database {
  constructor(database) {
    this.database = database
  }

  async create(table, data) {
    try {
      // Код для создания записи
      return createdRecord
    } catch (error) {
      console.error('Error creating record:', error)
    }
  }

  async read(table, query) {
    try {
      const queryObj = JSON.parse(query),
        { fields, excludeFields, filter: filterData, range: rangeData, sort: sortData } = queryObj,
        countRows = await this.database.query(`SELECT COUNT(id) as total_rows FROM ${table}`),
        totalRows = countRows[0][0].total_rows

      let returnObj = {
          'records': [],
          'totalRows': totalRows
        }

      if (totalRows === 0) {
        return returnObj
      }

      let fieldsString = '',
        filter = filterData,
        range = rangeData,
        sort = sortData

      if (typeof filterData == 'string') {
        filter = JSON.parse(filterData)
      }
      if (typeof rangeData == 'string') {
        range = JSON.parse(rangeData)
      }
      if (typeof sortData == 'string') {
        sort = JSON.parse(sortData)
      }

      if (fields) {
        for (let i = 0; i < fields.length; i++) {
          fieldsString += fields[i];

          if (i !== fields.length - 1) {
            fieldsString += ', ';
          }
        }
      } else {
        fieldsString = '*';
      }

      let queryString = `SELECT ${fieldsString} FROM ${table}`,
        queryParams = []

      if (Object.keys(filter).length > 0) {
        const whereClauses = [];

        for (const key in filter) {
          const filterValue = filter[key];

          if (Array.isArray(filterValue)) {
            const placeholders = Array.from({ length: filterValue.length }, () => '?');
            whereClauses.push(`${key} IN (${placeholders.join(', ')})`);
            queryParams.push(...filterValue);
          } else {
            whereClauses.push(`${key} = ?`);
            queryParams.push(filterValue);
          }
        }

        queryString += ` WHERE ${whereClauses.join(' AND ')}`;
      }

      if (sort && sort.length === 2) {
        const [column, order] = sort
        queryString += ` ORDER BY ${column} ${order}`
      }

      if (range && range.length === 2) {
        const [offset, limit] = range
        queryString += ` LIMIT ${limit} OFFSET ${offset}`;
        queryParams.push(limit, offset);
      }

      console.log('queryString', queryString)
      console.log('queryParams', queryParams)

      const response = await this.database.query(queryString, queryParams)

      returnObj['records'] = response[0]

      if (excludeFields) {
        for (let i = 0; i < returnObj.records.length; i++) {
          for (let j = 0; j < excludeFields.length; j++) {
            delete returnObj.records[i][excludeFields[j]]
          }
        }
      }

      // console.log('returnObj', returnObj)

      return returnObj
    } catch (error) {
      console.error('Error reading records:', error)
    }
  }

  async update(table, id, data) {
    try {
      // Код для обновления записи
      return `Record with id ${id} updated successfully`
    } catch (error) {
      console.error('Error updating record:', error);
    }
  }

  async delete(table, id) {
    try {
      // Код для удаления записи
      return `Record with id ${id} deleted successfully`
    } catch (error) {
      console.error('Error deleting record:', error)
    }
  }
}

module.exports = Database;