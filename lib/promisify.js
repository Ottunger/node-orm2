exports.promisify = function(nodeFunction, options) {
    options = options || {context: undefined};
    return function() {
        return new Promise((resolve, reject) => nodeFunction.apply(options.context, [...arguments, (err, result) => err? reject(err) : resolve(result)]));
    };
};
