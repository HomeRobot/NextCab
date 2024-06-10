const { response } = require('express')
const { isValidJSON } = require('../utils/jsonUtils')

class Database {
  constructor(database) {
    this.database = database
  }

  fieldsToString(fields) {
    let fieldsString = ''
    for (let i = 0; i < fields.length; i++) {
      fieldsString += fields[i]

      if (i !== fields.length - 1) {
        fieldsString += ', '
      }
    }
    return fieldsString
  }

  buildWhereClause(filter, compareLogic) {
    const whereClauses = [],
      queryParams = []

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

    const whereClause = whereClauses.join(` ${compareLogic} `);
    return {
      whereClause: ` WHERE ${whereClause}`,
      queryParams: queryParams
    }
  }

  async create(table, query) {
    let returnObj = {
      'result': 'success',
      'resultText': 'Record created successfully',
      'resultData': null
    }
    try {
      const queryObj = JSON.parse(query),
        { queryFields: queryFieldsData, requiredFields: requiredFieldsData, uniqueFields: uniqueFieldsData } = queryObj

      let queryFields = queryFieldsData,
        requiredFields = requiredFieldsData,
        uniqueFields = uniqueFieldsData

      if (typeof queryFields == 'string') {
        queryFields = JSON.parse(queryFields)
      }
      if (typeof requiredFields == 'string') {
        requiredFields = JSON.parse(requiredFields)
      }
      if (typeof uniqueFields == 'string') {
        uniqueFields = JSON.parse(uniqueFields)
      }

      if (uniqueFields.length > 0) {
        let queryString = `SELECT COUNT(id) as total_rows FROM ${table}`
        const uniqueFieldsObj = Object.entries(queryFields).reduce((obj, [key, value]) => {
          if (uniqueFields.includes(key)) {
            obj[key] = value;
          }
          return obj;
        }, {});
        const { whereClause, queryParams } = this.buildWhereClause(uniqueFieldsObj, 'OR')
        queryString += whereClause
        const uniqueFieldsData = await this.database.query(queryString, queryParams)

        if (uniqueFieldsData[0][0].total_rows > 0) {
          const errorData = {
            'errorType': 'uniqueFields',
            'uniqueFields': uniqueFields
          }
          throw new Error(JSON.stringify(errorData))
        }
      }

      if (requiredFields.length > 0) {
        requiredFields.forEach((field) => {
          if (!Object.keys(queryFields).includes(field) ||
            queryFields[field] === undefined ||
            queryFields[field] === null ||
            queryFields[field] === '') {
            const errorData = {
              'errorType': 'noRequiredField',
              'missedField': field
            }
            throw new Error(JSON.stringify(errorData))
          }
        })
      }

      let queryString = `INSERT INTO ${table} SET ?`

      const response = await this.database.query(queryString, queryFields)

      returnObj.resultData = response

      return JSON.stringify(returnObj)
    } catch (error) {
      returnObj.result = 'error'
      returnObj.resultText = 'Error creating record'
      returnObj.resultData = {
        'error': JSON.stringify(error)
      }

      if (!error.errno && isValidJSON(error.message)) {
        const errorData = JSON.parse(error.message),
          errorType = errorData.errorType

        if (errorType == 'noRequiredField') {
          returnObj.resultText = 'Missing required field'
          returnObj.resultData = {
            'error': errorData
          }
        }
        if (errorType == 'uniqueFields') {
          returnObj.resultText = 'Records with the specified key values already exist'
          returnObj.resultData = {
            'error': errorData
          }
        }
      }

      return JSON.stringify(returnObj)
    }
  }

  async read(table, query) {
    try {
      const { fields, excludeFields, filter: filterData, range: rangeData, sort: sortData, expression: selectExpression } = JSON.parse(query),
        countRows = await this.database.query(`SELECT COUNT(id) as total_rows FROM ${table}`),
        totalRows = countRows[0][0].total_rows

      let returnObj = {
        'records': [],
        'totalRows': totalRows
      }

      if (totalRows === 0) {
        return returnObj
      }

      let selectString = '',
        filter = filterData,
        range = rangeData,
        sort = sortData,
        expression = selectExpression

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
        if (typeof expression == 'string') {
          selectString = expression
        } else {
          for (let i = 0; i < fields.length; i++) {
            selectString += fields[i];

            if (i !== fields.length - 1) {
              selectString += ', ';
            }
          }
        }
      } else {
        if (typeof expression == 'string') {
          selectString = expression
        } else {
          selectString = '*';
        }
      }

      let queryString = `SELECT ${selectString} FROM ${table}`,
        queryParams = []

      if (Object.keys(filter).length > 0) {
        const whereClauses = [];

        for (const key in filter) {
          const filterKey = key,
            filterValue = filter[key]

          if (filterKey.includes(`_like`)) {
            const realKey = filterKey.replace('_like', '')
            whereClauses.push(`${realKey} LIKE ?`)
            queryParams.push(`%${filterValue}%`)
          } else {
            if (Array.isArray(filterValue)) {
              const placeholders = Array.from({ length: filterValue.length }, () => '?');
              whereClauses.push(`${key} IN (${placeholders.join(', ')})`);
              queryParams.push(...filterValue);
            } else {
              whereClauses.push(`${key} = ?`);
              queryParams.push(filterValue);
            }

          }
        }

        queryString += ` WHERE ${whereClauses.join(' AND ')}`;
        //console.log('queryString with filter: ', queryString)
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

      //console.log('queryString: ', queryString)
      //console.log('queryParams: ', queryParams)

      const response = await this.database.query(queryString, queryParams)
      returnObj['records'] = response[0]

      // console.log('read response: ', response)

      if (excludeFields) {
        for (let i = 0; i < returnObj.records.length; i++) {
          for (let j = 0; j < excludeFields.length; j++) {
            delete returnObj.records[i][excludeFields[j]]
          }
        }
      }

      return returnObj
    } catch (error) {
      console.error('Error reading records:', error)
      return 'Error reading records'
    }
  }

  async update(table, query) {
    try {
      const { fields: fieldsData, filter: filterData, range: rangeData } = JSON.parse(query),
        countRows = await this.database.query(`SELECT COUNT(id) as total_rows FROM ${table}`),
        totalRows = countRows[0][0].total_rows

      let fields = fieldsData,
        filter = filterData

      if (totalRows === 0) {
        const errorData = {
          'errorType': 'noDataToUpdate'
        }
        throw new Error(JSON.stringify(errorData))
      }
      if (fieldsData === undefined || fieldsData === null) {
        const errorData = {
          'errorType': 'noDataInQuery'
        }
        throw new Error(JSON.stringify(errorData))
      }

      if (typeof fieldsData == 'string') {
        fields = JSON.parse(fieldsData)
      }
      if (typeof filterData == 'string') {
        filter = JSON.parse(filterData)
      }

      let targetId = 0
      for (const key in fields) {
        if (key == 'id') {
          targetId = fields[key]
        }
      }

      const dataToUpdate = fields
      let queryString = '',
        queryParams = []

      if (typeof filter == 'object' && Object.keys(filter).length > 0) {
        const whereClauses = [];

        for (const key in filter) {
          const filterKey = key,
            filterValue = filter[key]

          if (filterKey.includes(`_like`)) {
            const realKey = filterKey.replace('_like', '')
            whereClauses.push(`${realKey} LIKE ?`)
            queryParams.push(`%${filterValue}%`)
          } else {
            if (Array.isArray(filterValue)) {
              const placeholders = Array.from({ length: filterValue.length }, () => '?');
              whereClauses.push(`${key} IN (${placeholders.join(', ')})`);
              queryParams.push(...filterValue);
            } else {
              whereClauses.push(`${key} = ${filterValue}`);
              queryParams.push(filterValue);
            }

          }
        }
        queryString += `UPDATE ${table} SET ? WHERE ${whereClauses.join(' AND ')}`;
        queryParams = [dataToUpdate]
      } else {
        queryString += `UPDATE ${table} SET ? WHERE id = ?`;
        queryParams = [dataToUpdate, targetId]
        delete dataToUpdate['id']
      }

      const response = await this.database.query(queryString, queryParams)

      let status = true
      if (response[0].serverStatus !== 2 && response[0].warningStatus !== 0) {
        status = false
      }
      const returnObj = {
        'id': targetId,
        'procedure': 'update',
        'status': status
      }
      return returnObj
    } catch (error) {
      console.error('Error updating record:', error);
      return error
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