const promisify = require("../../promisify").promisify;
const execQuery = function () {
    let query, cb, connectionId;
    if (arguments.length === 2) {
        query = arguments[0];
        cb = arguments[1];
        connectionId = null;
    } else if (arguments.length === 3) {
        if (arguments[1].constructor === Array) {
            query = this.query.escape(arguments[0], arguments[1]);
            cb = arguments[2];
        } else {
            query = arguments[0];
            connectionId = arguments[1];
            cb = arguments[2];
        }
    } else if (arguments.length === 4) {
        query = this.query.escape(arguments[0], arguments[1]);
        connectionId = arguments[2];
        cb = arguments[3];
    }
    return this.execSimpleQuery(query, connectionId, cb);
};

const eagerQuery = function (association, opts, keys, cb) {
    const desiredKey = Object.keys(association.field);
    const assocKey = Object.keys(association.mergeAssocId);

    const where = {};
    where[desiredKey] = keys;

    const query = this.query.select()
        .from(association.model.table)
        .select(opts.only)
        .from(association.mergeTable, assocKey, opts.keys)
        .select(desiredKey).as("$p")
        .where(association.mergeTable, where)
        .build();

    this.execSimpleQuery(query, null, cb);
};

module.exports = {
    execQuery: execQuery,

    eagerQuery: eagerQuery,

    execQueryAsync: promisify(execQuery),

    eagerQueryAsync: promisify(eagerQuery)
};
