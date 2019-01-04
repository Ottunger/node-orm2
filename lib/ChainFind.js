const _ = require("lodash");
const async = require("async");
const Utilities = require("./Utilities");
const ChainInstance = require("./ChainInstance");
const promisify = require("./promisify").promisify;
const DeprecatedPromise = require("./DeprecatedPromise").Promise;

module.exports = ChainFind;

function ChainFind(Model, opts) {
    const promiseFunctionPostfix = Model.settings.get('promiseFunctionPostfix');

    const prepareConditions = function () {
        return Utilities.transformPropertyNames(
            opts.conditions, opts.properties
        );
    };

    const prepareOrder = function () {
        return Utilities.transformOrderPropertyNames(
            opts.order, opts.properties
        );
    };

    const chainRun = function (done) {
        let order, conditions;

        conditions = Utilities.transformPropertyNames(
            opts.conditions, opts.properties
        );
        order = Utilities.transformOrderPropertyNames(
            opts.order, opts.properties
        );

        opts.driver.find(opts.only, opts.table, conditions, {
            limit: opts.limit,
            order: order,
            merge: opts.merge,
            offset: opts.offset,
            exists: opts.exists
        }, function (err, dataItems) {
            if (err) {
                return done(err);
            }
            if (dataItems.length === 0) {
                return done(null, []);
            }

            const eagerLoad = function (err, items) {
                const idMap = {};

                const keys = _.map(items, function (item, index) {
                    const key = item[opts.keys[0]];
                    // Create the association arrays
                    for (let i = 0; i < opts.__eager.length; i++) {
                        item[opts.__eager[i].name] = [];
                    }
                    idMap[key] = index;

                    return key;
                });

                async.eachSeries(opts.__eager,
                    function (association, cb) {
                        opts.driver.eagerQuery(association, opts, keys, function (err, instances) {
                            if (err) return cb(err);

                            for (let i = 0; i < instances.length; i++) {
                                // Perform a parent lookup with $p, and initialize it as an instance.
                                items[idMap[instances[i].$p]][association.name].push(association.model(instances[i]));
                            }
                            cb();
                        });
                    },
                    function (err) {
                        if (err) done(err);
                        else done(null, items);
                    }
                );
            };

            async.map(dataItems, opts.newInstance, function (err, items) {
                if (err) return done(err);

                const shouldEagerLoad = opts.__eager && opts.__eager.length;
                const completeFn = shouldEagerLoad ? eagerLoad : done;

                return completeFn(null, items);
            });
        });
    };
    let promise = null;
    const chain = {
        find: function () {
            let cb = null;

            const args = Array.prototype.slice.call(arguments);
            opts.conditions = opts.conditions || {};

            if (typeof _.last(args) === "function") {
                cb = args.pop();
            }

            if (typeof args[0] === "object") {
                _.extend(opts.conditions, args[0]);
            } else if (typeof args[0] === "string") {
                opts.conditions.__sql = opts.conditions.__sql || [];
                opts.conditions.__sql.push(args);
            }

            if (cb) {
                chainRun(cb);
            }
            return this;
        },
        only: function () {
            if (arguments.length && Array.isArray(arguments[0])) {
                opts.only = arguments[0];
            } else {
                opts.only = Array.prototype.slice.apply(arguments);
            }
            return this;
        },
        omit: function () {
            let omit = null;

            if (arguments.length && Array.isArray(arguments[0])) {
                omit = arguments[0];
            } else {
                omit = Array.prototype.slice.apply(arguments);
            }
            this.only(_.difference(Object.keys(opts.properties), omit));
            return this;
        },
        limit: function (limit) {
            opts.limit = limit;
            return this;
        },
        skip: function (offset) {
            return this.offset(offset);
        },
        offset: function (offset) {
            opts.offset = offset;
            return this;
        },
        order: function (property, order) {
            if (!Array.isArray(opts.order)) {
                opts.order = [];
            }
            if (property[0] === "-") {
                opts.order.push([property.substr(1), "Z"]);
            } else {
                opts.order.push([property, (order && order.toUpperCase() === "Z" ? "Z" : "A")]);
            }
            return this;
        },
        orderRaw: function (str, args) {
            if (!Array.isArray(opts.order)) {
                opts.order = [];
            }
            opts.order.push([str, args || []]);
            return this;
        },
        count: function (cb) {
            opts.driver.count(opts.table, prepareConditions(), {
                merge: opts.merge
            }, function (err, data) {
                if (err || data.length === 0) {
                    return cb(err);
                }
                return cb(null, data[0].c);
            });
            return this;
        },
        remove: function (cb) {
            const keys = _.map(opts.keyProperties, 'mapsTo');

            opts.driver.find(keys, opts.table, prepareConditions(), {
                limit: opts.limit,
                order: prepareOrder(),
                merge: opts.merge,
                offset: opts.offset,
                exists: opts.exists
            }, function (err, data) {
                if (err) {
                    return cb(err);
                }
                if (data.length === 0) {
                    return cb(null);
                }

                const conditions = {};
                let or;

                conditions.or = [];

                for (let i = 0; i < data.length; i++) {
                    or = {};
                    for (let j = 0; j < opts.keys.length; j++) {
                        or[keys[j]] = data[i][keys[j]];
                    }
                    conditions.or.push(or);
                }

                return opts.driver.remove(opts.table, conditions, null, cb);
            });
            return this;
        },

        first: function (cb) {
            return this.run(function (err, items) {
                return cb(err, items && items.length > 0 ? items[0] : null);
            });
        },
        last: function (cb) {
            return this.run(function (err, items) {
                return cb(err, items && items.length > 0 ? items[items.length - 1] : null);
            });
        },
        each: function (cb) {
            return new ChainInstance(this, cb);
        },
        run: function (cb) {
            chainRun(cb);
            return this;
        },
        success: function (cb) {
            console.warn("ChainFind.success() function is deprecated & will be removed in a future version");
            if (!promise) {
                promise = new DeprecatedPromise();
                promise.handle(this.all);
            }
            return promise.success(cb);
        },
        fail: function (cb) {
            if (!promise) {
                promise = new DeprecatedPromise();
                promise.handle(this.all);
            }
            console.warn("ChainFind.fail() function is deprecated & will be removed in a future version");
            return promise.fail(cb);
        },
        eager: function () {
            // This will allow params such as ("abc", "def") or (["abc", "def"])
            const associations = _.flatten(arguments);

            // TODO: Implement eager loading for Mongo and delete this.
            if (opts.driver.config.protocol === "mongodb:") {
                throw new Error("MongoDB does not currently support eager loading");
            }

            opts.__eager = _.filter(opts.associations, function (association) {
                return ~associations.indexOf(association.name);
            });

            return this;
        }
    };
    chain.all = chain.where = chain.find;

    chain['find' + promiseFunctionPostfix] = promisify(chain.find);
    chain['first' + promiseFunctionPostfix] = promisify(chain.first);
    chain['last' + promiseFunctionPostfix] = promisify(chain.last);
    chain['run' + promiseFunctionPostfix] = promisify(chain.run);
    chain['remove' + promiseFunctionPostfix] = promisify(chain.remove);

    if (opts.associations) {
        for (let i = 0; i < opts.associations.length; i++) {
            addChainMethod(chain, opts.associations[i], opts);
        }
    }
    for (let k in Model) {
        if ([
            "hasOne", "hasMany",
            "drop", "sync", "get", "clear", "create",
            "exists", "settings", "aggregate"
        ].indexOf(k) >= 0) {
            continue;
        }
        if (typeof Model[k] !== "function" || chain[k]) {
            continue;
        }

        chain[k] = Model[k];
    }
    chain.model = Model;
    chain.options = opts;

    return chain;
}

function addChainMethod(chain, association, opts) {
    chain[association.hasAccessor] = function (value) {
        if (!opts.exists) {
            opts.exists = [];
        }
        const conditions = {};

        const assocIds = Object.keys(association.mergeAssocId);
        const ids = association.model.id;

        function mergeConditions(source) {
            for (let i = 0; i < assocIds.length; i++) {
                if (typeof conditions[assocIds[i]] === "undefined") {
                    conditions[assocIds[i]] = source[ids[i]];
                } else if (Array.isArray(conditions[assocIds[i]])) {
                    conditions[assocIds[i]].push(source[ids[i]]);
                } else {
                    conditions[assocIds[i]] = [conditions[assocIds[i]], source[ids[i]]];
                }
            }
        }

        if (Array.isArray(value)) {
            for (let i = 0; i < value.length; i++) {
                mergeConditions(value[i]);
            }
        } else {
            mergeConditions(value);
        }

        opts.exists.push({
            table: association.mergeTable,
            link: [Object.keys(association.mergeId), association.model.id],
            conditions: conditions
        });

        return chain;
    };
}
