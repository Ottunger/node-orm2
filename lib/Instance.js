const Utilities = require("./Utilities");
const Hook = require("./Hook");
const enforce = require("enforce");
const promisify = require("./promisify").promisify;

exports.Instance = Instance;

const INSTNCE_METHOD_NAMES = ["save", "remove", "validate"];

function Instance(Model, opts) {
    opts = opts || {};
    opts.data = opts.data || {};
    opts.extra = opts.extra || {};
    opts.keys = opts.keys || "id";
    opts.changes = (opts.is_new ? Object.keys(opts.data) : []);
    opts.extrachanges = [];
    opts.associations = {};
    opts.originalKeyValues = {};

    const promiseFunctionPostfix = Model.settings.get('promiseFunctionPostfix');
    let instance_saving = false;
    const events = {};
    let instance = {};
    let connectionId = opts.connectionId || null;
    const setConnectionId = function (conId) {
        connectionId = conId;
    };
    const getConnectionId = function () {
        return connectionId;
    };
    const emitEvent = function () {
        const args = Array.prototype.slice.apply(arguments);
        const event = args.shift();

        if (!events.hasOwnProperty(event)) return;

        events[event].map(function (cb) {
            cb.apply(instance, args);
        });
    };
    const rememberKeys = function () {
        let i, prop;

        for (i = 0; i < opts.keyProperties.length; i++) {
            prop = opts.keyProperties[i];
            opts.originalKeyValues[prop.name] = opts.data[prop.name];
        }
    };
    const shouldSaveAssocs = function (saveOptions) {
        if (Model.settings.get("instance.saveAssociationsByDefault")) {
            return saveOptions.saveAssociations !== false;
        } else {
            return !!saveOptions.saveAssociations;
        }
    };
    const handleValidations = function (cb) {
        let required, alwaysValidate;

        Hook.wait(instance, opts.hooks.beforeValidation, function (err) {
            let k, i;
            if (err) {
                return saveError(cb, err);
            }

            const checks = new enforce.Enforce({
                returnAllErrors: Model.settings.get("instance.returnAllErrors")
            });

            for (k in opts.validations) {
                required = false;

                if (Model.allProperties[k]) {
                    required = Model.allProperties[k].required;
                    alwaysValidate = Model.allProperties[k].alwaysValidate;
                } else {
                    for (i = 0; i < opts.one_associations.length; i++) {
                        if (opts.one_associations[i].field === k) {
                            required = opts.one_associations[i].required;
                            break;
                        }
                    }
                }
                if (!alwaysValidate && !required && instance[k] == null) {
                    continue; // avoid validating if property is not required and is "empty"
                }
                for (i = 0; i < opts.validations[k].length; i++) {
                    checks.add(k, opts.validations[k][i]);
                }
            }

            checks.context("instance", instance);
            checks.context("model", Model);
            checks.context("driver", opts.driver);

            return checks.check(instance, cb);
        });
    };
    const saveError = function (cb, err) {
        instance_saving = false;

        emitEvent("save", err, instance);

        Hook.trigger(instance, opts.hooks.afterSave, false);

        if (typeof cb === "function") {
            cb(err, instance);
        }
    };
    const saveInstance = function (saveOptions, cb) {
        // what this condition means:
        // - If the instance is in state mode
        // - AND it's not an association that is asking it to save
        //   -> return has already saved
        if (instance_saving && saveOptions.saveAssociations !== false) {
            return cb(null, instance);
        }
        instance_saving = true;

        handleValidations(function (err) {
            if (err) {
                return saveError(cb, err);
            }

            if (opts.is_new) {
                waitHooks(["beforeCreate", "beforeSave"], function (err) {
                    if (err) {
                        return saveError(cb, err);
                    }

                    return saveNew(saveOptions, getInstanceData(), cb);
                });
            } else {
                waitHooks(["beforeSave"], function (err) {
                    if (err) {
                        return saveError(cb, err);
                    }

                    return savePersisted(saveOptions, getInstanceData(), cb);
                });
            }
        });
    };
    const runAfterSaveActions = function (cb, create, err) {
        instance_saving = false;

        emitEvent("save", err, instance);

        if (create) {
            Hook.trigger(instance, opts.hooks.afterCreate, !err);
        }
        Hook.trigger(instance, opts.hooks.afterSave, !err);

        cb();
    };
    const getInstanceData = function () {
        const data = {};
        let prop;
        for (let k in opts.data) {
            if (!opts.data.hasOwnProperty(k)) continue;
            prop = Model.allProperties[k];

            if (prop) {
                if (opts.data[k] == null && (prop.type === 'serial' || typeof prop.defaultValue === 'function')) {
                    continue;
                }

                if (opts.driver.propertyToValue) {
                    data[k] = opts.driver.propertyToValue(opts.data[k], prop);
                } else {
                    data[k] = opts.data[k];
                }
            } else {
                data[k] = opts.data[k];
            }
        }

        return data;
    };
    const waitHooks = function (hooks, next) {
        const nextHook = function () {
            if (hooks.length === 0) {
                return next();
            }
            Hook.wait(instance, opts.hooks[hooks.shift()], function (err) {
                if (err) {
                    return next(err);
                }

                return nextHook();
            });
        };

        return nextHook();
    };
    const saveNew = function (saveOptions, data, cb) {
        let i, prop;

        const finish = function (err) {
            runAfterSaveActions(function () {
                if (err) return cb(err);
                saveInstanceExtra(saveOptions.connectionId || connectionId, cb);
            }, true);
        };

        data = Utilities.transformPropertyNames(data, Model.allProperties);

        opts.driver.insert(opts.table, data, opts.keyProperties, saveOptions.connectionId || connectionId, function (save_err, info) {
            if (save_err) {
                return saveError(cb, save_err);
            }

            opts.changes.length = 0;

            for (i = 0; i < opts.keyProperties.length; i++) {
                prop = opts.keyProperties[i];
                opts.data[prop.name] = info.hasOwnProperty(prop.name) ? info[prop.name] : data[prop.name];
            }
            opts.is_new = false;
            rememberKeys();

            if (!shouldSaveAssocs(saveOptions)) {
                return finish();
            }

            return saveAssociations(finish);
        });
    };
    const savePersisted = function (saveOptions, data, cb) {
        let changes = {};
        const conditions = {};
        let i, prop;

        const next = function (saved) {
            const finish = function () {
                saveInstanceExtra(saveOptions.connectionId || connectionId, cb);
            };

            if (!saved && !shouldSaveAssocs(saveOptions)) {
                finish();
            } else {
                if (!shouldSaveAssocs(saveOptions)) {
                    runAfterSaveActions(function () {
                        finish();
                    }, false);
                } else {
                    saveAssociations(function (err, assocSaved) {
                        if (saved || assocSaved) {
                            runAfterSaveActions(function () {
                                if (err) return cb(err);
                                finish();
                            }, false, err);
                        } else {
                            finish();
                        }
                    });
                }
            }
        };

        if (opts.changes.length === 0) {
            next(false);
        } else {
            for (i = 0; i < opts.changes.length; i++) {
                changes[opts.changes[i]] = data[opts.changes[i]];
            }
            for (i = 0; i < opts.keyProperties.length; i++) {
                prop = opts.keyProperties[i];
                conditions[prop.mapsTo] = opts.originalKeyValues[prop.name];
            }
            changes = Utilities.transformPropertyNames(changes, Model.allProperties);

            opts.driver.update(opts.table, changes, conditions, saveOptions.connectionId || connectionId, function (err) {
                if (err) {
                    return saveError(cb, err);
                }
                opts.changes.length = 0;
                rememberKeys();

                next(true);
            });
        }
    };
    const saveAssociations = function (cb) {
        let pending = 1;
        let errored = false;
        let i, j;
        const saveAssociation = function (accessor, instances) {
            pending += 1;

            instance[accessor](instances, function (err) {
                if (err) {
                    if (errored) return;

                    errored = true;
                    return cb(err, true);
                }

                if (--pending === 0) {
                    return cb(null, true);
                }
            });
        };

        const _saveOneAssociation = function (assoc) {
            if (!instance[assoc.name] || typeof instance[assoc.name] !== "object") return;
            if (assoc.reversed) {
                // reversed hasOne associations should behave like hasMany
                if (!Array.isArray(instance[assoc.name])) {
                    instance[assoc.name] = [instance[assoc.name]];
                }
                for (let i = 0; i < instance[assoc.name].length; i++) {
                    if (!instance[assoc.name][i].isInstance) {
                        instance[assoc.name][i] = new assoc.model(instance[assoc.name][i]);
                    }
                    saveAssociation(assoc.setAccessor, instance[assoc.name][i]);
                }
                return;
            }
            if (!instance[assoc.name].isInstance) {
                instance[assoc.name] = new assoc.model(instance[assoc.name]);
            }

            saveAssociation(assoc.setAccessor, instance[assoc.name]);
        };

        for (i = 0; i < opts.one_associations.length; i++) {
            _saveOneAssociation(opts.one_associations[i]);
        }


        const _saveManyAssociation = function (assoc) {
            const assocVal = instance[assoc.name];

            if (!Array.isArray(assocVal)) return;
            if (!opts.associations[assoc.name].changed) return;

            for (j = 0; j < assocVal.length; j++) {
                if (!assocVal[j].isInstance) {
                    assocVal[j] = new assoc.model(assocVal[j]);
                }
            }

            saveAssociation(assoc.setAccessor, assocVal);
        };

        for (i = 0; i < opts.many_associations.length; i++) {
            _saveManyAssociation(opts.many_associations[i]);
        }

        if (--pending === 0) {
            return cb(null, false);
        }
    };
    const saveInstanceExtra = function (connectionId, cb) {
        if (opts.extrachanges.length === 0) {
            if (cb) return cb(null, instance);
            else return;
        }

        const data = {};
        const conditions = {};

        for (i = 0; i < opts.extrachanges.length; i++) {
            if (!opts.data.hasOwnProperty(opts.extrachanges[i])) continue;

            if (opts.extra[opts.extrachanges[i]]) {
                data[opts.extrachanges[i]] = opts.data[opts.extrachanges[i]];
                if (opts.driver.propertyToValue) {
                    data[opts.extrachanges[i]] = opts.driver.propertyToValue(data[opts.extrachanges[i]], opts.extra[opts.extrachanges[i]]);
                }
            } else {
                data[opts.extrachanges[i]] = opts.data[opts.extrachanges[i]];
            }
        }

        for (i = 0; i < opts.extra_info.id.length; i++) {
            conditions[opts.extra_info.id_prop[i]] = opts.extra_info.id[i];
            conditions[opts.extra_info.assoc_prop[i]] = opts.data[opts.keys[i]];
        }

        opts.driver.update(opts.extra_info.table, data, conditions, connectionId, function (err) {
            return cb(err);
        });
    };
    const removeInstance = function (cb) {
        if (opts.is_new) {
            return cb(null);
        }

        const conditions = {};
        for (let i = 0; i < opts.keys.length; i++) {
            conditions[opts.keys[i]] = opts.data[opts.keys[i]];
        }

        Hook.wait(instance, opts.hooks.beforeRemove, function (err) {
            if (err) {
                emitEvent("remove", err, instance);
                if (typeof cb === "function") {
                    cb(err, instance);
                }
                return;
            }

            emitEvent("beforeRemove", instance);

            opts.driver.remove(opts.table, conditions, connectionId, function (err) {
                Hook.trigger(instance, opts.hooks.afterRemove, !err);

                emitEvent("remove", err, instance);

                if (typeof cb === "function") {
                    cb(err, instance);
                }

                instance = undefined;
            });
        });
    };
    const saveInstanceProperty = function (key, value) {
        const changes = {}, conditions = {};
        changes[key] = value;

        if (Model.properties[key]) {
            if (opts.driver.propertyToValue) {
                changes[key] = opts.driver.propertyToValue(changes[key], Model.properties[key]);
            }
        }

        for (let i = 0; i < opts.keys.length; i++) {
            conditions[opts.keys[i]] = opts.data[opts.keys[i]];
        }

        Hook.wait(instance, opts.hooks.beforeSave, function (err) {
            if (err) {
                Hook.trigger(instance, opts.hooks.afterSave, false);
                emitEvent("save", err, instance);
                return;
            }

            opts.driver.update(opts.table, changes, conditions, connectionId, function (err) {
                if (!err) {
                    opts.data[key] = value;
                }
                Hook.trigger(instance, opts.hooks.afterSave, !err);
                emitEvent("save", err, instance);
            });
        });
    };
    const setInstanceProperty = function (key, value) {
        const prop = Model.allProperties[key] || opts.extra[key];

        if (prop) {
            if ('valueToProperty' in opts.driver) {
                value = opts.driver.valueToProperty(value, prop);
            }
            if (opts.data[key] !== value) {
                opts.data[key] = value;
                return true;
            }
        }
        return false;
    };

    // ('data.a.b', 5) => opts.data.a.b = 5
    const setPropertyByPath = function (path, value) {
        if (typeof path === 'string') {
            path = path.split('.');
        } else if (!Array.isArray(path)) {
            return;
        }

        const propName = path.shift();
        const prop = Model.allProperties[propName] || opts.extra[propName];
        let currKey, currObj;

        if (!prop) {
            return;
        }
        if (path.length === 0) {
            instance[propName] = value;
            return;
        }
        currObj = instance[propName];

        while (currObj && path.length > 0) {
            currKey = path.shift();

            if (path.length > 0) {
                currObj = currObj[currKey];
            } else if (currObj[currKey] !== value) {
                currObj[currKey] = value;
                opts.changes.push(propName);
            }
        }
    };

    const addInstanceProperty = function (key) {
        let defaultValue = null;
        const prop = Model.allProperties[key];

        // This code was first added, and then commented out in a later commit.
        // Its presence doesn't affect tests, so I'm just gonna log if it ever gets called.
        // If someone complains about noise, we know it does something, and figure it out then.
        if (instance.hasOwnProperty(key)) console.log("Overwriting instance property");

        if (key in opts.data) {
            defaultValue = opts.data[key];
        } else if (prop && 'defaultValue' in prop) {
            defaultValue = prop.defaultValue;
        }

        setInstanceProperty(key, defaultValue);

        Object.defineProperty(instance, key, {
            get: function () {
                return opts.data[key];
            },
            set: function (val) {
                if (prop.key === true) {
                    if (prop.type === 'serial' && opts.data[key] != null) {
                        return;
                    } else {
                        opts.originalKeyValues[prop.name] = opts.data[prop.name];
                    }
                }

                if (!setInstanceProperty(key, val)) {
                    return;
                }

                if (opts.autoSave) {
                    saveInstanceProperty(key, val);
                } else if (opts.changes.indexOf(key) === -1) {
                    opts.changes.push(key);
                }
            },
            enumerable: !(prop && !prop.enumerable)
        });
    };
    const addInstanceExtraProperty = function (key) {
        if (!instance.hasOwnProperty("extra")) {
            instance.extra = {};
        }
        Object.defineProperty(instance.extra, key, {
            get: function () {
                return opts.data[key];
            },
            set: function (val) {
                setInstanceProperty(key, val);

                /*if (opts.autoSave) {
                  saveInstanceProperty(key, val);
                }*/
                if (opts.extrachanges.indexOf(key) === -1) {
                    opts.extrachanges.push(key);
                }
            },
            enumerable: true
        });
    };

    let i, k;

    for (k in Model.allProperties) {
        addInstanceProperty(k);
    }
    for (k in opts.extra) {
        addInstanceProperty(k);
    }

    for (k in opts.methods) {
        Object.defineProperty(instance, k, {
            value: opts.methods[k].bind(instance),
            enumerable: false,
            writable: true
        });
    }

    for (k in opts.extra) {
        addInstanceExtraProperty(k);
    }

    Object.defineProperty(instance, "useConnectionId", {
        value: function (conId) {
            setConnectionId(conId);
            return this;
        },
        enumerable: false,
        writable: true
    });
    Object.defineProperty(instance, "getConnectionId", {
        value: function () {
            return getConnectionId();
        },
        enumerable: false,
        writable: false
    });
    Object.defineProperty(instance, "on", {
        value: function (event, cb) {
            if (!events.hasOwnProperty(event)) {
                events[event] = [];
            }
            events[event].push(cb);

            return this;
        },
        enumerable: false,
        writable: true
    });
    Object.defineProperty(instance, "save", {
        value: function () {
            let arg = null, objCount = 0, connectionId = null;
            let data = {}, saveOptions = {}, cb = null;

            while (arguments.length > 0) {
                arg = Array.prototype.shift.call(arguments);

                switch (typeof arg) {
                    case 'object':
                        switch (objCount) {
                            case 0:
                                data = arg;
                                break;
                            case 1:
                                saveOptions = arg;
                                break;
                        }
                        objCount++;
                        break;
                    case 'function':
                        cb = arg;
                        break;
                    case "string":
                        connectionId = arg;
                        break;
                    default:
                        const err = new Error("Unknown parameter type '" + (typeof arg) + "' in Instance.save()");
                        err.model = Model.table;
                        throw err;
                }
            }

            for (let k in data) {
                if (data.hasOwnProperty(k)) {
                    this[k] = data[k];
                }
            }

            saveOptions.connectionId = saveOptions.connectionId || connectionId;
            saveInstance(saveOptions, function (err) {
                if (!cb) return;
                if (err) return cb(err);

                return cb(null, instance);
            });

            return this;
        },
        enumerable: false,
        writable: true
    });
    Object.defineProperty(instance, "saved", {
        value: function () {
            return opts.changes.length === 0;
        },
        enumerable: false,
        writable: true
    });
    Object.defineProperty(instance, "remove", {
        value: function (cb) {
            removeInstance(cb);

            return this;
        },
        enumerable: false,
        writable: true
    });
    Object.defineProperty(instance, "set", {
        value: setPropertyByPath,
        enumerable: false,
        writable: true
    });
    Object.defineProperty(instance, "markAsDirty", {
        value: function (propName) {
            if (propName !== undefined) {
                opts.changes.push(propName);
            }
        },
        enumerable: false,
        writable: true
    });
    Object.defineProperty(instance, "dirtyProperties", {
        get: function () {
            return opts.changes;
        },
        enumerable: false
    });
    Object.defineProperty(instance, "isInstance", {
        value: true,
        enumerable: false
    });
    Object.defineProperty(instance, "isPersisted", {
        value: function () {
            return !opts.is_new;
        },
        enumerable: false,
        writable: true
    });
    Object.defineProperty(instance, "isShell", {
        value: function () {
            return opts.isShell;
        },
        enumerable: false
    });
    Object.defineProperty(instance, "validate", {
        value: function (cb) {
            handleValidations(function (errors) {
                cb(null, errors || false);
            });
        },
        enumerable: false,
        writable: true
    });
    Object.defineProperty(instance, "__singleton_uid", {
        value: function (cb) {
            if (typeof cb === "function") {
                cb(opts.uid);
            }
            return opts.uid;
        },
        enumerable: false
    });
    Object.defineProperty(instance, "__opts", {
        value: opts,
        enumerable: false
    });
    Object.defineProperty(instance, "model", {
        value: function (cb) {
            if (typeof cb === "function") {
                cb(Model);
            }
            return Model;
        },
        enumerable: false
    });

    for (let j = 0; j < INSTNCE_METHOD_NAMES.length; j++) {
        const name = INSTNCE_METHOD_NAMES[j];
        Object.defineProperty(instance, name + promiseFunctionPostfix, {
            value: promisify(instance[name]),
            enumerable: false,
            writable: true
        });
    }

    for (i = 0; i < opts.keyProperties.length; i++) {
        const prop = opts.keyProperties[i];

        if (!(prop.name in opts.data)) {
            opts.changes = Object.keys(opts.data);
            break;
        }
    }
    rememberKeys();

    opts.setupAssociations(instance);

    for (i = 0; i < opts.one_associations.length; i++) {
        const asc = opts.one_associations[i];

        if (!asc.reversed && !asc.extension) {
            for (let k in asc.field) {
                if (!opts.data.hasOwnProperty(k)) {
                    addInstanceProperty(k);
                }
            }
        }

        if (asc.name in opts.data) {
            const d = opts.data[asc.name];
            const mapper = function (obj) {
                return obj.isInstance ? obj : new asc.model(obj);
            };

            if (Array.isArray(d)) {
                instance[asc.name] = d.map(mapper);
            } else {
                instance[asc.name] = mapper(d);
            }
            delete opts.data[asc.name];
        }
    }
    for (i = 0; i < opts.many_associations.length; i++) {
        const aName = opts.many_associations[i].name;
        opts.associations[aName] = {
            changed: false, data: opts.many_associations[i]
        };

        if (Array.isArray(opts.data[aName])) {
            instance[aName] = opts.data[aName];
            delete opts.data[aName];
        }
    }

    Hook.wait(instance, opts.hooks.afterLoad, function (err) {
        process.nextTick(function () {
            emitEvent("ready", err);
        });
    });

    return instance;
}
