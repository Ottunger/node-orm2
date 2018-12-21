const should = require('should');
const helper = require('../support/spec_helper');
const ORM = require('../../');

describe("Model.clearAsync()", function () {
    let db = null;
    const Person = null;

    const setup = function () {
        return function (done) {
            Person = db.define("person", {
                name: String
            });

            ORM.singleton.clear();

            return helper.dropSync(Person, function () {
                Person.create([{
                    name: "John Doe"
                }, {
                    name: "Jane Doe"
                }], done);
            });
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

    describe("with callback", function () {
        before(setup());

        it("should call when done", function () {
            return Person.clearAsync()
                .then(Person.countAsync)
                .then(function (count) {
                    should.equal(count, 0);
                });
        });
    });

    describe("without callback", function () {
        before(setup());

        it("should still remove", function () {
            return Person.clearAsync()
                .then(Person.countAsync)
                .then(function (count) {
                    should.equal(count, 0);
                });
        });
    });
});
