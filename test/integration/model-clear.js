const should = require('should');
const helper = require('../support/spec_helper');
const ORM = require('../../');

describe("Model.clear()", function () {
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

        it("should call when done", function (done) {
            Person.clear(function (err) {
                should.equal(err, null);

                Person.find().count(function (err, count) {
                    count.should.equal(0);

                    return done();
                });
            });
        });
    });

    describe("without callback", function () {
        before(setup());

        it("should still remove", function (done) {
            Person.clear();

            setTimeout(function () {
                Person.find().count(function (err, count) {
                    count.should.equal(0);

                    return done();
                });
            }, 200);
        });
    });
});
