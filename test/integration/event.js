const should = require('should');
const helper = require('../support/spec_helper');

describe("Event", function () {
    let db = null;
    const Person = null;

    const triggeredHooks = {};

    const checkHook = function (hook) {
        triggeredHooks[hook] = false;

        return function () {
            triggeredHooks[hook] = Date.now();
        };
    };

    const setup = function (hooks) {
        return function (done) {
            Person = db.define("person", {
                name: {type: "text", required: true}
            });

            return helper.dropSync(Person, done);
        };
    };

    before(function (done) {
        helper.connect(function (connection) {
            db = connection;

            return done();
        });
    });

    after(function () {
        return db.close();
    });

    describe("save", function () {
        before(setup());

        it("should trigger when saving an instance", function (done) {
            let triggered = false;
            const John = new Person({
                name: "John Doe"
            });

            John.on("save", function () {
                triggered = true;
            });

            triggered.should.be.false;

            John.save(function () {
                triggered.should.be.true;

                return done();
            });
        });

        it("should trigger when saving an instance even if it fails", function (done) {
            let triggered = false;
            const John = new Person();

            John.on("save", function (err) {
                triggered = true;

                err.should.be.a.Object();
                err.should.have.property("msg", "required");
            });

            triggered.should.be.false;

            John.save(function () {
                triggered.should.be.true;

                return done();
            });
        });

        it("should be writable for mocking", function (done) {
            let triggered = false;
            const John = new Person();

            John.on = function (event, cb) {
                triggered = true;
            };
            triggered.should.be.false;

            John.on("mocked", function (err) {
            });
            triggered.should.be.true;
            done();
        });
    });
});
