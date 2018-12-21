exports.trigger = function () {
    const args = Array.prototype.slice.apply(arguments);
    const self = args.shift();
    const cb = args.shift();

    if (typeof cb === "function") {
        cb.apply(self, args);
    }
};

exports.wait = function () {
    const args = Array.prototype.slice.apply(arguments);
    const self = args.shift();
    const hook = args.shift();
    const next = args.shift();

    args.push(next);
    if (typeof hook === "function") {
        const hookValue = hook.apply(self, args);

        const hookDoesntExpectCallback = hook.length < args.length;
        const isPromise = hookValue && typeof (hookValue.then) === "function";

        if (hookDoesntExpectCallback) {
            if (isPromise) {
                return hookValue
                    .then(function () {
                        next();
                    })
                    .catch(next);
            }
            return next();
        }
    } else {
        return next();
    }
};
