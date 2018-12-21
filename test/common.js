const common = exports;
const _ = require('lodash');
const util = require('util');
const querystring = require('querystring');
const Semver = require('semver');
const ORM = require('../');

common.ORM = ORM;

common.protocol = function () {
    return process.env.ORM_PROTOCOL;
};

common.isTravis = function () {
    return Boolean(process.env.CI);
};

common.createConnection = function (opts, cb) {
    ORM.connect(this.getConnectionString(opts), cb);
};

common.hasConfig = function (proto) {
    let config;

    if (common.isTravis()) return 'found';

    try {
        config = require("./config");
    } catch (ex) {
        return 'not-found';
    }

    return (config.hasOwnProperty(proto) ? 'found' : 'not-defined');
};

common.getConfig = function () {
    if (common.isTravis()) {
        switch (this.protocol()) {
            case 'mysql':
                return {user: "root", host: "localhost", database: "orm_test"};
            case 'postgres':
            case 'redshift':
                return {user: "postgres", host: "localhost", database: "orm_test"};
            case 'sqlite':
                return {};
            case 'mongodb':
                return {host: "localhost", database: "test"};
            default:
                throw new Error("Unknown protocol");
        }
    } else {
        let config = require("./config")[this.protocol()];
        if (typeof config === "string") {
            config = require("url").parse(config);
        }
        if (config.hasOwnProperty("auth")) {
            if (config.auth.indexOf(":") >= 0) {
                config.user = config.auth.substr(0, config.auth.indexOf(":"));
                config.password = config.auth.substr(config.auth.indexOf(":") + 1);
            } else {
                config.user = config.auth;
                config.password = "";
            }
        }
        if (config.hostname) {
            config.host = config.hostname;
        }

        return config;
    }
};

common.getConnectionString = function (opts) {
    const config = this.getConfig();
    let protocol = this.protocol();
    let query;

    _.defaults(config, {
        user: {postgres: 'postgres', redshift: 'postgres', mongodb: ''}[protocol] || 'root',
        database: {mongodb: 'test'}[protocol] || 'orm_test',
        password: '',
        host: 'localhost',
        pathname: '',
        query: {}
    });
    _.merge(config, opts || {});

    query = querystring.stringify(config.query);

    switch (protocol) {
        case 'mysql':
        case 'postgres':
        case 'redshift':
        case 'mongodb':
            if (common.isTravis()) {
                if (protocol === 'redshift') protocol = 'postgres';
                return util.format("%s://%s@%s/%s?%s",
                    protocol, config.user, config.host, config.database, query
                );
            } else {
                return util.format("%s://%s:%s@%s/%s?%s",
                    protocol, config.user, config.password,
                    config.host, config.database, query
                ).replace(':@', '@');
            }
        case 'sqlite':
            return util.format("%s://%s?%s", protocol, config.pathname, query);
        default:
            throw new Error("Unknown protocol " + protocol);
    }
};

common.retry = function (before, run, until, done, args) {
    if (typeof until === "number") {
        let countDown = until;
        until = function (err) {
            if (err && --countDown > 0) return false;
            return true;
        };
    }

    if (typeof args === "undefined") args = [];

    const handler = function (err) {
        if (until(err)) return done.apply(this, arguments);
        return runNext();
    };

    args.push(handler);

    const runCurrent = function () {
        if (run.length === args.length) {
            return run.apply(this, args);
        } else {
            run.apply(this, args);
            handler();
        }
    };

    var runNext = function () {
        try {
            if (before.length > 0) {
                before(function (err) {
                    if (until(err)) return done(err);
                    return runCurrent();
                });
            } else {
                before();
                runCurrent();
            }
        }
        catch (e) {
            handler(e);
        }
    };

    if (before.length > 0) {
        before(function (err) {
            if (err) return done(err);
            runNext();
        });
    } else {
        before();
        runNext();
    }
};

common.nodeVersion = function () {
    return new Semver(process.versions.node);
};
