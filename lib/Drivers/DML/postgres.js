const _ = require("lodash");
const pg = require("pg");
const Query = require("sql-query").Query;
const shared = require("./_shared");
const DDL = require("../DDL/SQL");
const poolConnection = require("../../PoolConnection");
const ORMError = require("../../Error");

exports.Driver = Driver;

const switchableFunctions = {
    pool: {
        connect: function (cb) {
            this.db.connect(function (err, client, done) {
                if (!err) {
                    done();
                }
                cb(err);
            });
        },
        execSimpleQuery: function (query, connectionId, cb) {
            if (this.opts.debug) {
                require("../../Debug").sql('postgres', query);
            }
            if (typeof cb === 'undefined' && typeof connectionId === 'function') {
                cb = connectionId;
                connectionId = null;
            }
            const connection = poolConnection.getConnection(connectionId);
            if (connection != null)
                connection.client.query(query, function (err, result) {
                    if (err) {
                        cb(err);
                    } else {
                        cb(null, result.rows);
                    }
                });
            else
                this.db.connect(function (err, client, done) {
                    if (err) {
                        return cb(err);
                    }

                    client.query(query, function (err, result) {
                        done();

                        if (err) {
                            cb(err);
                        } else {
                            cb(null, result.rows);
                        }
                    });
                });
            return this;
        }
    },
    client: {
        connect: function (cb) {
            this.db.connect(cb);
        },
        execSimpleQuery: function (query, connectionId, cb) {
            if (this.opts.debug) {
                require("../../Debug").sql('postgres', query);
            }
            this.db.query(query, function (err, result) {
                if (err) {
                    cb(err);
                } else {
                    cb(null, result.rows);
                }
            });
            return this;
        }
    }
};

function Driver(config, connection, opts) {
    let functions = switchableFunctions.client;

    this.dialect = 'postgresql';
    this.config = config || {};
    this.opts = opts || {};

    if (!this.config.timezone) {
        this.config.timezone = "local";
    }

    this.query = new Query({dialect: this.dialect, timezone: this.config.timezone});
    this.customTypes = {};

    if (connection) {
        this.db = connection;
    } else {
        if (this.config.query && this.config.query.ssl) {
            config.ssl = true;
            this.config = _.extend(this.config, config);
            // } else {
            //   this.config = _.extend(this.config, config);
            //   this.config = config.href || config;
        }

        pg.types.setTypeParser(20, Number);

        if (opts.pool) {
            functions = switchableFunctions.pool;
            this.db = new pg.Pool(this.config);
        } else {
            this.db = new pg.Client(this.config);
        }
    }

    _.extend(this.constructor.prototype, functions);

    this.aggregate_functions = [
        "ABS", "CEIL", "FLOOR", "ROUND",
        "AVG", "MIN", "MAX",
        "LOG", "EXP", "POWER",
        "ACOS", "ASIN", "ATAN", "COS", "SIN", "TAN",
        "RANDOM", "RADIANS", "DEGREES",
        "SUM", "COUNT",
        "DISTINCT"
    ];
}

_.extend(Driver.prototype, shared, DDL);

Driver.prototype.on = function (ev, cb) {
    if (ev === "error") {
        this.db.on("error", cb);
    }
    return this;
};

Driver.prototype.createPool = function (cb) {
    if (!this.opts.pool)
        throw new ORMError('NOT_DEFINED', "Pool option need to be enable");
    this.db.connect(function (err, client, done) {
        if (err) {
            return cb(err);
        }
        return cb(null, poolConnection.addConnection({client: client, done: done}));
    });
};

Driver.prototype.releasePool = function (connectionId) {
    if (!this.opts.pool)
        throw new ORMError('NOT_DEFINED', "Pool option need to be enable");
    const connection = poolConnection.getConnection(connectionId);
    if (connection != null) {
        connection.done();
        poolConnection.removeConnection(connectionId);
    }
    return this;
};

Driver.prototype.ping = function (cb) {
    this.execSimpleQuery("SELECT * FROM pg_stat_activity LIMIT 1", null, function () {
        return cb();
    });
    return this;
};

Driver.prototype.close = function (cb) {
    this.db.end();

    if (typeof cb === "function") cb();


};

Driver.prototype.getQuery = function () {
    return this.query;
};

Driver.prototype.find = function (fields, table, conditions, opts, cb) {
    let q = this.query.select().from(table).select(fields);

    if (opts.offset) {
        q.offset(opts.offset);
    }
    if (typeof opts.limit === "number") {
        q.limit(opts.limit);
    }
    if (opts.order) {
        for (let i = 0; i < opts.order.length; i++) {
            q.order(opts.order[i][0], opts.order[i][1]);
        }
    }

    if (opts.merge) {
        q.from(opts.merge.from.table, opts.merge.from.field, opts.merge.to.field).select(opts.merge.select);
        if (opts.merge.where && Object.keys(opts.merge.where[1]).length) {
            q = q.where(opts.merge.where[0], opts.merge.where[1], opts.merge.table || null, conditions);
        } else {
            q = q.where(opts.merge.table || null, conditions);
        }
    } else {
        q = q.where(conditions);
    }

    if (opts.exists) {
        for (let k in opts.exists) {
            q.whereExists(opts.exists[k].table, table, opts.exists[k].link, opts.exists[k].conditions);
        }
    }

    q = q.build();

    this.execSimpleQuery(q, null, cb);
};

Driver.prototype.count = function (table, conditions, opts, cb) {
    let q = this.query.select().from(table).count(null, 'c');

    if (opts.merge) {
        q.from(opts.merge.from.table, opts.merge.from.field, opts.merge.to.field);
        if (opts.merge.where && Object.keys(opts.merge.where[1]).length) {
            q = q.where(opts.merge.where[0], opts.merge.where[1], conditions);
        } else {
            q = q.where(conditions);
        }
    } else {
        q = q.where(conditions);
    }

    if (opts.exists) {
        for (let k in opts.exists) {
            q.whereExists(opts.exists[k].table, table, opts.exists[k].link, opts.exists[k].conditions);
        }
    }

    q = q.build();

    this.execSimpleQuery(q, null, cb);
};

Driver.prototype.insert = function (table, data, keyProperties, connectionId, cb) {
    const q = this.query.insert().into(table).set(data).build();

    this.execSimpleQuery(q + " RETURNING *", connectionId, function (err, results) {
        if (err) {
            return cb(err);
        }

        let i;
        const ids = {};
        let prop;

        if (keyProperties) {
            for (i = 0; i < keyProperties.length; i++) {
                prop = keyProperties[i];
                // Zero is a valid value for an ID column
                ids[prop.name] = results[0][prop.mapsTo] !== undefined ? results[0][prop.mapsTo] : null;
            }
        }
        return cb(null, ids);
    });
};

Driver.prototype.update = function (table, changes, conditions, connectionId, cb) {
    const q = this.query.update().into(table).set(changes).where(conditions).build();

    this.execSimpleQuery(q, connectionId, cb);
};

Driver.prototype.remove = function (table, conditions, connectionId, cb) {
    const q = this.query.remove().from(table).where(conditions).build();

    this.execSimpleQuery(q, connectionId, cb);
};

Driver.prototype.clear = function (table, cb) {
    const q = "TRUNCATE TABLE " + this.query.escapeId(table);

    this.execSimpleQuery(q, null, cb);
};

Driver.prototype.valueToProperty = function (value, property) {
    let customType, v;

    switch (property.type) {
        case "object":
            if (typeof value === "object" && !Buffer.isBuffer(value)) {
                break;
            }
            try {
                value = JSON.parse(value);
            } catch (e) {
                value = null;
            }
            break;
        case "point":
            if (typeof value === "string") {
                const m = value.match(/\((-?[\d.]+)[\s,]+(-?[\d.]+)\)/);

                if (m) {
                    value = {x: parseFloat(m[1]), y: parseFloat(m[2])};
                }
            }
            break;
        case "date":
            if (_.isDate(value) && this.config.timezone && this.config.timezone !== 'local') {
                const tz = convertTimezone(this.config.timezone);

                // shift local to UTC
                value.setTime(value.getTime() - (value.getTimezoneOffset() * 60000));

                if (tz !== false) {
                    // shift UTC to timezone
                    value.setTime(value.getTime() - (tz * 60000));
                }
            }
            break;
        case "number":
            if (typeof value === 'string') {
                switch (value.trim()) {
                    case 'Infinity':
                    case '-Infinity':
                    case 'NaN':
                        value = Number(value);
                        break;
                    default:
                        v = parseFloat(value);
                        if (Number.isFinite(v)) {
                            value = v;
                        }
                }
            }
            break;
        case "integer":
            if (typeof value === 'string') {
                v = parseInt(value);

                if (Number.isFinite(v)) {
                    value = v;
                }
            }
            break;
        default:
            customType = this.customTypes[property.type];

            if (customType && 'valueToProperty' in customType) {
                value = customType.valueToProperty(value);
            }
    }
    return value;
};

Driver.prototype.propertyToValue = function (value, property) {
    let customType;

    switch (property.type) {
        case "object":
            if (value !== null && !Buffer.isBuffer(value)) {
                value = new Buffer(JSON.stringify(value));
            }
            break;
        case "date":
            if (_.isDate(value) && this.config.timezone && this.config.timezone !== 'local') {
                const tz = convertTimezone(this.config.timezone);

                // shift local to UTC
                value.setTime(value.getTime() + (value.getTimezoneOffset() * 60000));
                if (tz !== false) {
                    // shift UTC to timezone
                    value.setTime(value.getTime() + (tz * 60000));
                }
            }
            break;
        case "point":
            return function () {
                return "POINT(" + value.x + ', ' + value.y + ")";
            };
        default:
            customType = this.customTypes[property.type];

            if (customType && 'propertyToValue' in customType) {
                value = customType.propertyToValue(value);
            }
    }
    return value;
};

Object.defineProperty(Driver.prototype, "isSql", {
    value: true
});

function convertTimezone(tz) {
    if (tz === "Z") {
        return 0;
    }

    const m = tz.match(/([+\-\s])(\d\d):?(\d\d)?/);

    if (m) {
        return (m[1] === '-' ? -1 : 1) * (parseInt(m[2], 10) + ((m[3] ? parseInt(m[3], 10) : 0) / 60)) * 60;
    }
    return false;
}
