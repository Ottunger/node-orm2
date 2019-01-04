module.exports = ChainInstance;

function ChainInstance(chain, cb) {
    let instances = null;
    let loading = false;
    const queue = [];

    const load = function () {
        loading = true;
        chain.run(function (err, items) {
            instances = items;

            return next();
        });
    };
    const promise = function (hwd) {
        return function () {
            if (!loading) {
                load();
            }

            queue.push({hwd: hwd, args: arguments});

            return calls;
        };
    };
    const next = function () {
        if (queue.length === 0) return;

        const item = queue.shift();

        item.hwd.apply(calls, item.args);
    };
    const calls = {
        filter: promise(function (cb) {
            instances = instances.filter(cb);

            return next();
        }),
        forEach: promise(function (cb) {
            instances.forEach(cb);

            return next();
        }),
        sort: promise(function (cb) {
            instances.sort(cb);

            return next();
        }),
        count: promise(function (cb) {
            cb(instances.length);

            return next();
        }),
        get: promise(function (cb) {
            cb(instances);

            return next();
        }),
        save: promise(function (cb) {
            const saveNext = function (i) {
                if (i >= instances.length) {
                    if (typeof cb === "function") {
                        cb();
                    }
                    return next();
                }

                return instances[i].save(function (err) {
                    if (err) {
                        if (typeof cb === "function") {
                            cb(err);
                        }
                        return next();
                    }

                    return saveNext(i + 1);
                });
            };

            return saveNext(0);
        })
    };

    if (typeof cb === "function") {
        return calls.forEach(cb);
    }
    return calls;
}
