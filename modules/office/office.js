const { DBase, DBPrefix } = require('../DB/db')

const createOffice = async (req, res) => {
    const query = JSON.stringify({
        'queryFields': JSON.stringify(req.body),
        'requiredFields': ['title', 'address', 'phone', 'state'],
        'uniqueFields': ['title', 'address', 'phone']
    })

    const response = JSON.parse(await DBase.create('office', query)),
        { result: responseResult, resultText: responseText, resultData: responseData } = response

    if (responseResult == 'success') {
        return res.status(201).json({
            id: responseData[0].insertId,
            message: responseText
        });
    }
    if (responseResult == 'error') {
        return res.status(500).json({
            error: responseText,
            errorData: responseData
        });
    }
}

/* const getOffice = async (req, res) => {
    console.log('Вызвана getOffice');
    const filter = JSON.parse(req.query.filter),
        office = await core.getOffice(filter.id),
        range = office.length
    res.setHeader('content-range', range);
    return res.status(200).json(office)
} */

const getOfficeById = async (req, res) => {
    const query = JSON.stringify({ filter: req.params }),
        response = await DBase.read('office', query),
        record = response.records[0]

    return res.status(200).json(record)
}

const getOffices = async (req, res) => {
    const requestQuery = req.query,
        query = JSON.stringify(requestQuery),
        response = await DBase.read('office', query),
        range = requestQuery.range,
        records = response.records,
        totalRows = response.totalRows

    res.setHeader('content-range', `${range}/${totalRows}`);
    return res.status(200).json(records)
}

const updateOfficeById = async (req, res) => {
    const query = JSON.stringify({
        'fields': JSON.stringify(req.body)
    }),
        response = await DBase.update('office', query)
    return res.status(200).json(response)
}



module.exports = {
    createOffice,
    /* getOffice, */
    getOfficeById,
    getOffices,
    updateOfficeById,
}