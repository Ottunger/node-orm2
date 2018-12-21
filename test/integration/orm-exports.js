const _ = require('lodash');
const sqlite = require('sqlite3');
const pg = require('pg');
const should = require('should');
const helper = require('../support/spec_helper');
const ORM = require('../../');
const common = require('../common');
const protocol = common.protocol();

describe("ORM", function () {
    describe("when loaded", function () {
        it("should expose .express(), .use() and .connect()", function (done) {
            ORM.express.should.be.a.Function();
            ORM.use.should.be.a.Function();
            ORM.useAsync.should.be.a.Function();
            ORM.connect.should.be.a.Function();
            ORM.connectAsync.should.be.a.Function();

            return done();
        });

        it("should expose default settings container", function (done) {
            ORM.settings.should.be.a.Object();
            ORM.settings.get.should.be.a.Function();
            ORM.settings.set.should.be.a.Function();
            ORM.settings.unset.should.be.a.Function();

            return done();
        });

        it("should expose generic Settings constructor", function (done) {
            ORM.Settings.should.be.a.Object();
            ORM.Settings.Container.should.be.a.Function();

            return done();
        });

        it("should expose singleton manager", function (done) {
            ORM.singleton.should.be.a.Object();
            ORM.singleton.clear.should.be.a.Function();

            return done();
        });

        it("should expose predefined validators", function (done) {
            ORM.validators.should.be.a.Object();
            ORM.validators.rangeNumber.should.be.a.Function();
            ORM.validators.rangeLength.should.be.a.Function();

            return done();
        });
    });
    describe('ORM.connectAsync()', function () {
        it('should be a function', function () {
            return ORM.connectAsync.should.be.a.Function()
        });

        it('should throw error with correct message when protocol not supported', function () {
            return ORM.connectAsync("bd://127.0.0.6")
                .catch(function (err) {
                    should.exist(err);
                    err.message.should.not.equal("CONNECTION_PROTOCOL_NOT_SUPPORTED");
                });
        });

        it('should throw error with correct message when connection URL doesn\'t exist', function () {
            ORM.connectAsync()
                .catch(function (err) {
                    err.message.should.equal("CONNECTION_URL_EMPTY");
                });
        });

        it("should throw error when passed empty string like connection URL", function () {
            return ORM.connectAsync("")
                .catch(function (err) {
                    err.message.should.equal("CONNECTION_URL_EMPTY");
                });
        });

        it("should throw error when passed string with spaces only", function () {
            return ORM.connectAsync("    ")
                .catch(function (err) {
                    err.message.should.equal("CONNECTION_URL_EMPTY");
                });
        });

        it("should throw error when passed invalid protocol", function () {
            return ORM.connectAsync("user@db")
                .catch(function (err) {
                    err.message.should.equal("CONNECTION_URL_NO_PROTOCOL");
                });
        });

        it("should throw error when passed unknown protocol", function () {
            return ORM.connectAsync("unknown://db")
                .catch(function (err) {
                    should.equal(err.literalCode, 'NO_SUPPORT');
                    should.equal(
                        err.message,
                        "Connection protocol not supported - have you installed the database driver for unknown?"
                    );
                });
        });

        it("should throw error when passed invalid connection db link", function () {
            return ORM.connectAsync("mysql://fakeuser:nopassword@127.0.0.1/unknowndb")
                .catch(function (err) {
                    should.exist(err);
                    should.equal(err.message.indexOf("Connection protocol not supported"), -1);
                    err.message.should.not.equal("CONNECTION_URL_NO_PROTOCOL");
                    err.message.should.not.equal("CONNECTION_URL_EMPTY");
                });
        });

        it("should do not mutate opts", function () {
            const opts = {
                protocol: 'mysql',
                user: 'notauser',
                password: "wrong password",
                query: {pool: true, debug: true}
            };

            const expected = JSON.stringify(opts);

            return ORM.connectAsync(opts)
                .catch(function () {
                    should.equal(
                        JSON.stringify(opts),
                        expected
                    );
                });
        });

        it("should pass successful when opts is OK!", function () {
            return ORM.connectAsync(common.getConnectionString())
                .then(function (db) {
                    should.exist(db);

                    db.use.should.be.a.Function();
                    db.define.should.be.a.Function();
                    db.sync.should.be.a.Function();
                    db.load.should.be.a.Function();
                })
        });

        describe('POOL via connectAsync', function () {
            let connStr = null;

            beforeEach(function () {
                connStr = common.getConnectionString();
            });

            afterEach(function () {
                connStr = null
            });

            if (protocol !== 'mongodb') {
                it("should understand pool `'false'` from query string", function () {
                    const connString = connStr + "debug=false&pool=false";
                    return ORM.connectAsync(connString)
                        .then(function (db) {
                            should.strictEqual(db.driver.opts.pool, false);
                            should.strictEqual(db.driver.opts.debug, false);
                        })
                });

                it("should understand pool `'0'` from query string", function () {
                    const connString = connStr + "debug=0&pool=0";
                    return ORM.connectAsync(connString)
                        .then(function (db) {
                            should.strictEqual(db.driver.opts.pool, false);
                            should.strictEqual(db.driver.opts.debug, false);
                        });
                });

                it("should understand pool `'true'` from query string", function () {
                    const connString = connStr + "debug=true&pool=true";
                    return ORM.connectAsync(connString)
                        .then(function (db) {
                            should.strictEqual(db.driver.opts.pool, true);
                            should.strictEqual(db.driver.opts.debug, true);
                        });
                });

                it("should understand pool `'true'` from query string", function () {
                    const connString = connStr + "debug=1&pool=1";
                    return ORM.connectAsync(connString)
                        .then(function (db) {
                            should.strictEqual(db.driver.opts.pool, true);
                            should.strictEqual(db.driver.opts.debug, true);
                        });
                });

                it("should understand pool `'true'` from query string", function () {
                    const connCopy = _.cloneDeep(common.getConfig());
                    const connOpts = _.extend(connCopy, {
                        protocol: common.protocol(),
                        query: {
                            pool: true, debug: true
                        }
                    });

                    return ORM.connectAsync(connOpts)
                        .then(function (db) {
                            should.strictEqual(db.driver.opts.pool, true);
                            should.strictEqual(db.driver.opts.debug, true);
                        });
                });

                it("should understand pool `false` from query options", function () {
                    const connCopy = _.cloneDeep(common.getConfig());
                    const connOpts = _.extend(connCopy, {
                        protocol: common.protocol(),
                        query: {
                            pool: false, debug: false
                        }
                    });

                    return ORM.connectAsync(connOpts)
                        .then(function (db) {
                            should.strictEqual(db.driver.opts.pool, false);
                            should.strictEqual(db.driver.opts.debug, false);
                        });
                });
            }
        });
    });

    describe("ORM.connect()", function () {
        it("should expose .use(), .define(), .sync() and .load()", function (done) {
            const db = ORM.connect();

            db.use.should.be.a.Function();
            db.define.should.be.a.Function();
            db.sync.should.be.a.Function();
            db.load.should.be.a.Function();

            return done();
        });

        it("should emit an error if no url is passed", function (done) {
            const db = ORM.connect();

            db.on("connect", function (err) {
                err.message.should.equal("CONNECTION_URL_EMPTY");

                return done();
            });
        });

        it.skip("should allow protocol alias", function (done) {
            this.timeout(60000);
            const db = ORM.connect("pg://127.0.0.6");

            db.once("connect", function (err) {
                should.exist(err);
                err.message.should.not.equal("CONNECTION_PROTOCOL_NOT_SUPPORTED");

                return done();
            });
        });

        it("should emit an error if empty url is passed", function (done) {
            const db = ORM.connect("");

            db.on("connect", function (err) {
                err.message.should.equal("CONNECTION_URL_EMPTY");

                return done();
            });
        });

        it("should emit an error if empty url (with only spaces) is passed", function (done) {
            const db = ORM.connect("   ");

            db.on("connect", function (err) {
                err.message.should.equal("CONNECTION_URL_EMPTY");

                return done();
            });
        });

        it("should emit an error if no protocol is passed", function (done) {
            const db = ORM.connect("user@db");

            db.on("connect", function (err) {
                err.message.should.equal("CONNECTION_URL_NO_PROTOCOL");

                return done();
            });
        });

        it("should emit an error if unknown protocol is passed", function (done) {
            const db = ORM.connect("unknown://db");

            db.on("connect", function (err) {
                should.equal(err.literalCode, 'NO_SUPPORT');
                should.equal(
                    err.message,
                    "Connection protocol not supported - have you installed the database driver for unknown?"
                );

                return done();
            });
        });

        it("should emit an error if cannot connect", function (done) {
            const db = ORM.connect("mysql://fakeuser:nopassword@127.0.0.1/unknowndb");

            db.on("connect", function (err) {
                should.exist(err);
                should.equal(err.message.indexOf("Connection protocol not supported"), -1);
                err.message.should.not.equal("CONNECTION_URL_NO_PROTOCOL");
                err.message.should.not.equal("CONNECTION_URL_EMPTY");

                return done();
            });
        });

        it("should emit valid error if exception being thrown during connection try", function (done) {
            const testConfig = {
                    protocol: 'mongodb',
                    href: 'unknownhost',
                    database: 'unknowndb',
                    user: '',
                    password: ''
                },
                db = ORM.connect(testConfig);

            db.on("connect", function (err) {
                should.exist(err);
                should.equal(err.message.indexOf("Connection protocol not supported"), -1);
                err.message.should.not.equal("CONNECTION_URL_NO_PROTOCOL");
                err.message.should.not.equal("CONNECTION_URL_EMPTY");

                return done();
            });
        });

        it("should not modify connection opts", function (done) {
            const opts = {
                protocol: 'mysql',
                user: 'notauser',
                password: "wrong password",
                query: {pool: true, debug: true}
            };

            const expected = JSON.stringify(opts);

            ORM.connect(opts, function (err, db) {
                should.equal(
                    JSON.stringify(opts),
                    expected
                );
                done();
            });
        });

        it("should emit no error if ok", function (done) {
            const db = ORM.connect(common.getConnectionString());

            db.on("connect", function (err) {
                should.not.exist(err);

                return done();
            });
        });

        describe("if no connection error", function () {
            let db = null;

            before(function (done) {
                helper.connect(function (connection) {
                    db = connection;

                    return done();
                });
            });

            after(function () {
                return db.close();
            });

            it("should be able to ping the server", function (done) {
                db.ping(function () {
                    return done();
                });
            });

            it("should be able to pingAsync the server", function () {
                return db.pingAsync();
            });
        });

        describe("if callback is passed", function () {
            it("should return an error if empty url is passed", function (done) {
                ORM.connect("", function (err) {
                    err.message.should.equal("CONNECTION_URL_EMPTY");

                    return done();
                });
            });

            it("should return an error if no protocol is passed", function (done) {
                ORM.connect("user@db", function (err) {
                    err.message.should.equal("CONNECTION_URL_NO_PROTOCOL");

                    return done();
                });
            });

            it("should return an error if unknown protocol is passed", function (done) {
                ORM.connect("unknown://db", function (err) {
                    should.equal(err.literalCode, 'NO_SUPPORT');
                    should.equal(
                        err.message,
                        "Connection protocol not supported - have you installed the database driver for unknown?"
                    );

                    return done();
                });
            });
        });

        if (protocol !== 'mongodb') {
            describe("query options", function () {
                let connStr = null;

                beforeEach(function () {
                    connStr = common.getConnectionString();
                });

                afterEach(function () {
                    connStr = null
                });
                it("should understand pool `'false'` from query string", function (done) {
                    const connString = connStr + "debug=false&pool=false";
                    ORM.connect(connString, function (err, db) {
                        should.not.exist(err);
                        should.strictEqual(db.driver.opts.pool, false);
                        should.strictEqual(db.driver.opts.debug, false);
                        done();
                    });
                });

                it("should understand pool `'0'` from query string", function (done) {
                    const connString = connStr + "debug=0&pool=0";
                    ORM.connect(connString, function (err, db) {
                        should.not.exist(err);
                        should.strictEqual(db.driver.opts.pool, false);
                        should.strictEqual(db.driver.opts.debug, false);
                        done();
                    });
                });

                it("should understand pool `'true'` from query string", function (done) {
                    const connString = connStr + "debug=true&pool=true";
                    ORM.connect(connString, function (err, db) {
                        should.not.exist(err);
                        should.strictEqual(db.driver.opts.pool, true);
                        should.strictEqual(db.driver.opts.debug, true);
                        done();
                    });
                });

                it("should understand pool `'1'` from query string", function (done) {
                    const connString = connStr + "debug=1&pool=1";
                    ORM.connect(connString, function (err, db) {
                        should.not.exist(err);
                        should.strictEqual(db.driver.opts.pool, true);
                        should.strictEqual(db.driver.opts.debug, true);
                        done();
                    });
                });

                it("should understand pool `true` from query options", function (done) {
                    const connCopy = _.cloneDeep(common.getConfig());
                    const connOpts = _.extend(connCopy, {
                        protocol: common.protocol(),
                        query: {
                            pool: true, debug: true
                        }
                    });
                    ORM.connect(connOpts, function (err, db) {
                        should.not.exist(err);
                        should.strictEqual(db.driver.opts.pool, true);
                        should.strictEqual(db.driver.opts.debug, true);
                        done();
                    });
                });

                it("should understand pool `false` from query options", function (done) {
                    const connCopy = _.cloneDeep(common.getConfig());
                    const connOpts = _.extend(connCopy, {
                        protocol: common.protocol(),
                        query: {
                            pool: false, debug: false
                        }
                    });
                    ORM.connect(connOpts, function (err, db) {
                        should.not.exist(err);
                        should.strictEqual(db.driver.opts.pool, false);
                        should.strictEqual(db.driver.opts.debug, false);
                        done();
                    });
                });
            });
        }
    });

    describe("ORM.use()", function () {
        it("should be able to use an established connection", function (done) {
            const db = new sqlite.Database(':memory:');

            ORM.use(db, "sqlite", function (err) {
                should.not.exist(err);

                return done();
            });
        });

        it("should be accept protocol alias", function (done) {
            const db = new pg.Client();

            ORM.use(db, "pg", function (err) {
                should.equal(err, null);

                return done();
            });
        });

        it("should return an error in callback if protocol not supported", function (done) {
            const db = new pg.Client();

            ORM.use(db, "unknowndriver", function (err) {
                should.exist(err);

                return done();
            });
        });
    });

    describe("ORM.useAsync()", function () {
        it("should be able to use an established connection", function () {
            const db = new sqlite.Database(':memory:');

            return ORM.useAsync(db, "sqlite");
        });

        it("should be accept protocol alias", function () {
            const db = new pg.Client();

            return ORM.useAsync(db, "pg")
        });

        it("should throw an error in callback if protocol not supported", function () {
            const db = new pg.Client();

            return ORM.useAsync(db, "unknowndriver")
                .catch(function (err) {
                    should.exist(err);
                });
        });
    });
});