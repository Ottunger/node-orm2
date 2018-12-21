module.exports = {
    formatErrors: function (errorsIn) {
        const errors = {};
        let a, e;

        for (a = 0; a < errorsIn.length; a++) {
            e = errorsIn[a];

            errors[e.property] = errors[e.property] || [];
            errors[e.property].push(e.msg);
        }
        return errors;
    }
};
