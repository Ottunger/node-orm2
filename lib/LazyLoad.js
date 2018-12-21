const promisify = require("./promisify").promisify;
const LAZY_METHOD_NAMES = ["get", "remove", "set"];

const extend = function (Instance, Model, properties) {
    for (let k in properties) {
        if (properties[k].lazyload === true) {
            addLazyLoadProperty(properties[k].lazyname || k, Instance, Model, k);
        }
    }
};

const conditionAssign = function (instance, model) {
    const conditions = {};
    conditions[model.id] = instance[model.id];
    return conditions;
};

function addLazyLoadProperty(name, Instance, Model, property) {
    const method = ucfirst(name);
    const promiseFunctionPostfix = Model.settings.get('promiseFunctionPostfix');
    const functionNames = {
        get: {
            callback: "get" + method,
            promise: "get" + method + promiseFunctionPostfix
        },
        remove: {
            callback: "remove" + method,
            promise: "remove" + method + promiseFunctionPostfix
        },
        set: {
            callback: "set" + method,
            promise: "set" + method + promiseFunctionPostfix
        }
    };

    Object.defineProperty(Instance, functionNames.get.callback, {
        value: function (cb) {
            const conditions = conditionAssign(Instance, Model);

            Model.find(conditions, {identityCache: false}).only(Model.id.concat(property)).first(function (err, item) {
                return cb(err, item ? item[property] : null);
            });

            return this;
        },
        enumerable: false
    });

    Object.defineProperty(Instance, functionNames.remove.callback, {
        value: function (cb) {
            const conditions = conditionAssign(Instance, Model);

            Model.find(conditions, {identityCache: false}).only(Model.id.concat(property)).first(function (err, item) {
                if (err) {
                    return cb(err);
                }
                if (!item) {
                    return cb(null);
                }

                item[property] = null;

                return item.save(cb);
            });

            return this;
        },
        enumerable: false
    });

    Object.defineProperty(Instance, functionNames.set.callback, {
        value: function (data, cb) {
            const conditions = conditionAssign(Instance, Model);

            Model.find(conditions, {identityCache: false}).first(function (err, item) {
                if (err) {
                    return cb(err);
                }
                if (!item) {
                    return cb(null);
                }

                item[property] = data;

                return item.save(cb);
            });

            return this;
        },
        enumerable: false
    });

    for (let i = 0; i < LAZY_METHOD_NAMES.length; i++) {
        const methodName = LAZY_METHOD_NAMES[i];
        Object.defineProperty(Instance, functionNames[methodName].promise, {
            value: promisify(Instance[functionNames[methodName].callback]),
            enumerable: false
        });
    }
}

function ucfirst(text) {
    return text[0].toUpperCase() + text.substr(1).toLowerCase();
}

exports.extend = extend;